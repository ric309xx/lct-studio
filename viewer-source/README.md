# 3D Viewer source snapshot

Editable source for the viewer reviewed on 2026-10-09. Generated project definitions are preserved in `src/projects.ts`.

Install dependencies with `pnpm install --frozen-lockfile`. Set `VITE_CESIUM_ION_ACCESS_TOKEN` in a local `.env` using the existing project's authorized token; credentials are not included here.

Run `pnpm test` and `pnpm build`. For production paths set `VITE_BASE_PATH=/3d-viewer/` before building. Copy the generated entry JS and CSS to `../3d-viewer/assets/viewer.js` and `viewer.css`, plus generated dynamic chunks using their original filenames. Keep the existing access gate and project entry HTML files. Overlay data lives in `public/overlays`.

This version preserves middle-button orbit and wheel zoom. A left click centers the picked model/ground position and selects the next orbit pivot. Collision correction is disabled for the Taoyuan inspection project to allow close inspection. The information panel can collapse to the right. Occupancy uses the original classification plus hole-fill underlay; the reviewed dripline excludes the right-hand spike and reports 36.27 m² (7.25%). The review is an interpretation of the model and reference screenshot, not a new cadastral survey.
