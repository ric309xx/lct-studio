"""Read-only source processing: georeferenced LAS colour/height review crops.

Generated images are evidence for interpreted draft outlines, not automatic
building classification or surveyed boundaries. Native north-up pixel edges
map to [min_x + col*resolution, max_y - row*resolution] in EPSG:3826.
"""
from pathlib import Path
import sys, json, struct, math
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.codex-tmp/geospatial-py'))
import numpy as np
import ezdxf, rasterio
from shapely.geometry import Polygon
from PIL import Image, ImageDraw, ImageFont

OUT = ROOT / 'analysis/20261010-taoyuan-1006/review'
SOURCE = Path(r'D:\DJI\DJITerra\20261006CL\20261006CL\models\pc\0')
INPUT = json.loads((OUT.parent / 'parcel-inputs.json').read_text(encoding='utf-8'))
ENTITIES = {e.dxf.handle:e for e in ezdxf.readfile(r'D:\DATA\WORK\20261006桃園三維地籍\地籍資料\01_1006\1006.dxf').modelspace()}

def main():
    OUT.mkdir(exist_ok=True)
    crops = []
    resolution = .05
    for p in INPUT['parcels']:
        poly = Polygon([(v.dxf.location.x,v.dxf.location.y) for v in ENTITIES[p['dxfHandle']].vertices])
        x0,y0,x1,y1=poly.bounds
        x0,y0=math.floor(x0-8),math.floor(y0-8)
        w,h=math.ceil((x1+8-x0)/resolution),math.ceil((y1+8-y0)/resolution)
        crops.append(dict(parcelNo=p['parcelNo'],polygon=poly,minX=x0,maxY=y0+h*resolution,width=w,height=h,
            resolution=resolution,z=np.full(w*h,-np.inf,np.float32),rgb=np.zeros((w*h,3),np.uint8),
            class2Count=0,class2Residuals=[],groundPoints=[]))
    file_stats=[]
    with rasterio.open(SOURCE/'terra_dem/dem.tif') as dem:
        for path in sorted((SOURCE/'terra_las_1_4').glob('*.las')):
            with path.open('rb') as f: header=f.read(375)
            fmt=header[104]&63; length=struct.unpack_from('<H',header,105)[0]
            count=struct.unpack_from('<Q',header,247)[0] or struct.unpack_from('<I',header,107)[0]
            scale=np.array(struct.unpack_from('<3d',header,131)); offset=np.array(struct.unpack_from('<3d',header,155))
            maxx,minx,maxy,miny=struct.unpack_from('<4d',header,179)
            relevant=[c for c in crops if maxx>=c['minX'] and minx<=c['minX']+c['width']*resolution and maxy>=c['maxY']-c['height']*resolution and miny<=c['maxY']]
            if not relevant: continue
            rgb_offset={2:20,3:28,5:28,7:30,8:30,10:30}.get(fmt)
            if rgb_offset is None: raise ValueError(f'No RGB supported for LAS format {fmt}')
            dtype=np.dtype({'names':['x','y','z','cls','rgb'],'formats':['<i4','<i4','<i4','u1',('<u2',3)],'offsets':[0,4,8,16 if fmt>=6 else 15,rgb_offset],'itemsize':length})
            pts=np.memmap(path,dtype=dtype,mode='r',offset=struct.unpack_from('<I',header,96)[0],shape=(count,))
            classes=np.zeros(256,np.int64); selected=0
            for start in range(0,count,1_000_000):
                q=pts[start:start+1_000_000]; classes+=np.bincount(q['cls'],minlength=256)
                x=q['x']*scale[0]+offset[0];y=q['y']*scale[1]+offset[1]
                for c in relevant:
                    mask=(x>=c['minX'])&(x<c['minX']+c['width']*resolution)&(y>c['maxY']-c['height']*resolution)&(y<=c['maxY'])
                    ids=np.flatnonzero(mask)
                    if not len(ids):continue
                    selected+=len(ids);z=q['z'][ids]*scale[2]+offset[2]
                    idx=np.floor((c['maxY']-y[ids])/resolution).astype(int)*c['width']+np.floor((x[ids]-c['minX'])/resolution).astype(int)
                    # Sort low to high, then retain final (highest) point per cell.
                    order=np.lexsort((z,idx));idxs=idx[order]
                    last=np.r_[idxs[1:]!=idxs[:-1],True]; chosen=order[last]; cells=idx[chosen]
                    replace=z[chosen]>c['z'][cells]; chosen=chosen[replace];cells=cells[replace]
                    c['z'][cells]=z[chosen]
                    color=q['rgb'][ids[chosen]].astype(np.float32)
                    if color.size and color.max()>255: color/=257
                    c['rgb'][cells]=np.clip(color,0,255).astype(np.uint8)
                    ground=q['cls'][ids]==2;c['class2Count']+=int(ground.sum())
                    if ground.any():
                        gid=ids[ground][::50]
                        terrain=np.array([v[0] for v in dem.sample(zip(x[gid],y[gid]))])
                        good=terrain!=dem.nodata
                        c['groundPoints'].extend(np.column_stack((x[gid],y[gid],q['z'][gid]*scale[2]+offset[2])).tolist())
                        c['class2Residuals'].extend((q['z'][gid][good]*scale[2]+offset[2]-terrain[good]).tolist())
            file_stats.append(dict(file=path.name,format=fmt,points=count,reviewPoints=selected,classes={str(i):int(n) for i,n in enumerate(classes) if n}))
            print(path.name,selected,flush=True);del pts
        manifest=[]
        for c in crops:
            w,h=c['width'],c['height'];z=c['z'].reshape(h,w);rgb=c['rgb'].reshape(h,w,3)
            xs=c['minX']+(np.arange(w)+.5)*resolution;ys=c['maxY']-(np.arange(h)+.5)*resolution
            xx,yy=np.meshgrid(xs,ys)
            # Rasterio indexed lookup, respecting source NoData.
            rows,cols=rasterio.transform.rowcol(dem.transform,xx.ravel(),yy.ravel())
            d=dem.read(1)[np.asarray(rows),np.asarray(cols)].reshape(h,w)
            gp=np.asarray(c['groundPoints']);ref=gp[:,:2].mean(axis=0)
            design=np.column_stack((gp[:,:2]-ref,np.ones(len(gp))))
            keep=np.ones(len(gp),bool)
            for _ in range(5):
                coef=np.linalg.lstsq(design[keep],gp[keep,2],rcond=None)[0]
                residual=gp[:,2]-design@coef; med=np.median(residual[keep]);mad=np.median(np.abs(residual[keep]-med))
                keep=np.abs(residual-med)<=max(.10,3*1.4826*mad)
            ground=coef[0]*(xx-ref[0])+coef[1]*(yy-ref[1])+coef[2]
            dz=z-ground; valid=np.isfinite(z)
            # Small display-only hole expansion; analysis keeps original validity.
            shown=rgb.copy();filled=np.isfinite(z)
            for _ in range(3):
                old=filled.copy();values=shown.copy()
                for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
                    m=np.roll(old,(dy,dx),(0,1))&~filled
                    m[0,:]=False;m[-1,:]=False;m[:,0]=False;m[:,-1]=False
                    shown[m]=np.roll(values,(dy,dx),(0,1))[m];filled[m]=True
            base=Image.fromarray(shown);base.save(OUT/(c['parcelNo']+'-colour.png'))
            review=base.copy();draw=ImageDraw.Draw(review)
            coords=[((x-c['minX'])/resolution,(c['maxY']-y)/resolution) for x,y in c['polygon'].exterior.coords]
            draw.line(coords,fill='#ffe22e',width=4)
            for tick in range(0,max(w,h),100):
                if tick<w: draw.text((tick+2,3),str(tick),fill='white',stroke_width=1,stroke_fill='black')
                if tick<h: draw.text((3,tick+2),str(tick),fill='white',stroke_width=1,stroke_fill='black')
            review.save(OUT/(c['parcelNo']+'-parcel.png'))
            hn=np.clip(dz/12,0,1);colors=np.stack([hn*255,(1-abs(hn-.5)*2)*255,(1-hn)*255],-1)
            colors[~valid]=0; hi=Image.fromarray(colors.astype(np.uint8));ImageDraw.Draw(hi).line(coords,fill='yellow',width=4);hi.save(OUT/(c['parcelNo']+'-height.png'))
            np.savez_compressed(OUT/(c['parcelNo']+'-surface.npz'),z=z,dem=d,groundPlane=ground)
            residual=c['class2Residuals']
            item={k:c[k] for k in ['parcelNo','minX','maxY','width','height','resolution','class2Count']}
            item.update(parcelPixelCoordinates=coords,lasClass2MinusDemMedian=float(np.median(residual)) if residual else None,
                lasClass2MinusDemP95Abs=float(np.percentile(np.abs(residual),95)) if residual else None,validSurfaceFraction=float(np.isfinite(z).mean()))
            item['groundPlane']={'referenceTwd97':ref.tolist(),'coefficients':coef.tolist(),'class2Samples':len(gp),'inliers':int(keep.sum()),'medianAbsoluteResidualM':float(np.median(np.abs((gp[:,2]-design@coef)[keep])))}
            manifest.append(item)
        (OUT/'manifest.json').write_text(json.dumps(dict(crs='EPSG:3826',crops=manifest,las=file_stats),indent=2),encoding='utf-8')
    print('Saved six north-up review crops',flush=True)

if __name__=='__main__':main()
