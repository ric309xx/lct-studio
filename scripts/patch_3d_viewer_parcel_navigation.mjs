import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = resolve(process.argv[2] ?? '.codex-tmp/viewer-build-20260927');
const file = join(root, 'src/App.tsx');
let text = readFileSync(file,'utf8');
function replace(before,after) {
  if(!text.includes(before)) throw new Error('Navigation source anchor missing: '+before.slice(0,80));
  text=text.replace(before,after);
}
if (!text.includes('let disposeParcelNavigation:')) {
  text=text.replace('    let viewer: Viewer | null = null;', '    let viewer: Viewer | null = null;\n    let disposeParcelNavigation: (() => void) | undefined;');
  text=text.replace('if (project.id === "taoyuan-building-overlay") tuneParcelNavigation(viewer);', 'if (project.id === "taoyuan-building-overlay") disposeParcelNavigation = tuneParcelNavigation(viewer, () => parcelOrbitTargetRef.current);');
  text=text.replace('      cancelled = true;', '      cancelled = true;\n      disposeParcelNavigation?.();');
  writeFileSync(file,text);
}
if(!text.includes('import { focusParcelOrbit')) {
  text='import { focusParcelOrbit, tuneParcelNavigation } from "./parcelNavigation";\n'+text;
  replace('  const viewerRef = useRef<Viewer | null>(null);', '  const parcelOrbitTargetRef = useRef<Cartesian3 | null>(null);\n  const viewerRef = useRef<Viewer | null>(null);');
  replace('        viewerRef.current = viewer;', `        viewerRef.current = viewer;
        if (project.id === "taoyuan-building-overlay") tuneParcelNavigation(viewer);`);
  replace('                const toGroundPosition = (position: Cartesian3) => {', `                if (project.id === "taoyuan-building-overlay") {
                  const focus = cadastralConfig!.parcels[0].focus!;
                  parcelOrbitTargetRef.current = Cartesian3.fromDegrees(focus.longitude, focus.latitude, groundHeight);
                }
                const toGroundPosition = (position: Cartesian3) => {`);
  replace('          project.camera\n        );', '          project.camera,\n          parcelOrbitTargetRef.current ?? undefined\n        );');
  replace('        cameraPresetRef.current ?? undefined\n      );', '        cameraPresetRef.current ?? undefined,\n        parcelOrbitTargetRef.current ?? undefined\n      );');
  replace('focusModels(viewer, [], parcel.focus);', 'focusModels(viewer, [], parcel.focus, parcelOrbitTargetRef.current ?? undefined);');
  replace('  preset?: CameraPreset\n): void {', `  preset?: CameraPreset,
  orbitTarget?: Cartesian3
): void {
  if (orbitTarget) {
    focusParcelOrbit(viewer, orbitTarget);
    return;
  }`);
  // Top/north commands must preserve the same parcel origin as mouse orbit.
  replace('    const sphere = getCombinedBoundingSphere(tilesets);\n    viewer.camera.flyToBoundingSphere', `    if (parcelOrbitTargetRef.current) {
      focusParcelOrbit(viewer, parcelOrbitTargetRef.current, 0, -90, 85);
      return;
    }
    const sphere = getCombinedBoundingSphere(tilesets);
    viewer.camera.flyToBoundingSphere`);
  replace('    const sphere = getCombinedBoundingSphere(tilesets);\n    const range = Math.max(', `    if (parcelOrbitTargetRef.current) {
      focusParcelOrbit(viewer, parcelOrbitTargetRef.current, 0, CesiumMath.toDegrees(viewer.camera.pitch),
        Math.max(25, Cartesian3.distance(viewer.camera.positionWC, parcelOrbitTargetRef.current)));
      return;
    }
    const sphere = getCombinedBoundingSphere(tilesets);
    const range = Math.max(`);
  replace('      cadastralDataSourceRef.current = null;', '      parcelOrbitTargetRef.current = null;\n      cadastralDataSourceRef.current = null;');
  writeFileSync(file,text);
}
text = text.replace('tuneParcelNavigation(viewer, () => parcelOrbitTargetRef.current);', 'tuneParcelNavigation(viewer, () => parcelOrbitTargetRef.current, () => !measurementHandlerRef.current && !clippingHandlerRef.current && !calibrationPickEnabledRef.current && !landmarkEditEnabledRef.current);');
writeFileSync(file,text);
copyFileSync(resolve('scripts/viewer/parcelNavigation.ts'),join(root,'src/parcelNavigation.ts'));
copyFileSync(resolve('scripts/viewer/parcelNavigation.test.ts'),join(root,'src/parcelNavigation.test.ts'));
console.log('Parcel navigation source installed.');
