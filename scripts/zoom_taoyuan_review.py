from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[1]/'analysis/20261010-taoyuan-1006/review'
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',20)
for no,box in [('471-7',(150,160,360,530)),('99-1',(150,140,550,660)),('221',(160,220,580,745)),('239-1',(150,200,710,630)),('646-2',(170,250,540,770)),('1051-1',(170,140,540,380))]:
    im=Image.open(root/(no+'-colour.png')).crop(box).resize(((box[2]-box[0])*2,(box[3]-box[1])*2))
    d=ImageDraw.Draw(im)
    for x in range((box[0]//20+1)*20,box[2],20):
        d.line([((x-box[0])*2,0),((x-box[0])*2,im.height)],fill='#555555',width=1)
        d.text(((x-box[0])*2,0),str(x),font=font,fill='yellow',stroke_width=1,stroke_fill='black')
    for y in range((box[1]//20+1)*20,box[3],20):
        d.line([(0,(y-box[1])*2),(im.width,(y-box[1])*2)],fill='#555555',width=1)
        d.text((0,(y-box[1])*2),str(y),font=font,fill='yellow',stroke_width=1,stroke_fill='black')
    im.save(root/(no+'-detail.png'))
