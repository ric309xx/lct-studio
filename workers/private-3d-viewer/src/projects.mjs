export const DEFAULT_PROJECT = 'nanya';
// Server-owned allowlist: never accept a bucket key or prefix from the client.
export const PROJECTS = Object.freeze({
  nanya: Object.freeze({
    id: 'nanya', name: '南雅奇岩模型', date: '2026-08-10',
    prefix: '20260810/terra_b3dms/',
    landmarksKey: 'settings/nanya/landmarks-v1.json',
    camera: { longitude: 121.89251409, latitude: 25.11970394, height: 69.3, heading: 56.958, pitch: -39.588, roll: 0 }
  }),
  'longteng-20260906': Object.freeze({
    id: 'longteng-20260906', name: '龍騰斷橋模型', date: '2026-09-06',
    prefix: 'projects/longteng/20260906-v1/terra_b3dms/',
    landmarksKey: 'settings/longteng-20260906/landmarks-v1.json',
    // Relative to the transformed tileset bounding sphere, so the framing stays
    // stable if the source tileset is republished at the same site.
    camera: { heading: 90, pitch: -34.379, rangeFactor: 1.05 }
  }),
  'heping-seawall-20260922': Object.freeze({
    id: 'heping-seawall-20260922', name: '和平海堤模型', date: '2026-09-22',
    prefix: 'projects/heping-seawall/20260922-v1/terra_b3dms/',
    coverKey: 'projects/heping-seawall/20260922-v1/media/cover.jpg',
    landmarksKey: 'settings/heping-seawall-20260922/landmarks-v1.json',
    landmarks: false,
    measurementOnly: true,
    camera: {
      position: [-3062344.449672097, 4944636.656337088, 2609222.143359909],
      direction: [0.3084858529252217, -0.6912913202779974, 0.6534162448648654],
      up: [-0.386751771063612, 0.5364279311847955, 0.7501120864403932]
    }
  })
});

export function getProject(id = DEFAULT_PROJECT) {
  return Object.hasOwn(PROJECTS, id) ? PROJECTS[id] : null;
}
