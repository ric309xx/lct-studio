type ParcelSource = { groupKey?: string; tilesetPath?: string };

/** A fresh document releases the prior dense model's outstanding WebGL/height
 * requests. Keep same-group navigation in-place and all legacy sources intact. */
export function needsFreshShuanglingDocument(previous: ParcelSource | undefined, next: ParcelSource): boolean {
  return previous?.tilesetPath === '1013-v2/tileset.json' && next.tilesetPath === previous.tilesetPath &&
    Boolean(previous.groupKey && next.groupKey && previous.groupKey !== next.groupKey);
}
