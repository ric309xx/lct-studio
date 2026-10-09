export type Point2 = { x: number; y: number };

export function traceOccupiedBoundaries(grid: boolean[][]): Point2[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const edges = new Map<string, Point2[]>();
  const add = (a: Point2, b: Point2) => {
    const key = `${a.x},${a.y}`;
    const list = edges.get(key) ?? [];
    list.push(b);
    edges.set(key, list);
  };
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
    if (!grid[y][x]) continue;
    if (!grid[y - 1]?.[x]) add({ x, y }, { x: x + 1, y });
    if (!grid[y]?.[x + 1]) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (!grid[y + 1]?.[x]) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
    if (!grid[y]?.[x - 1]) add({ x, y: y + 1 }, { x, y });
  }
  const loops: Point2[][] = [];
  while (edges.size) {
    const first = edges.keys().next().value as string;
    const [x, y] = first.split(',').map(Number);
    const loop: Point2[] = [{ x, y }];
    let key = first;
    for (let guard = 0; guard < rows * cols * 8; guard += 1) {
      const next = edges.get(key)?.pop();
      if (!next) { edges.delete(key); break; }
      if (!edges.get(key)?.length) edges.delete(key);
      if (next.x === x && next.y === y) break;
      loop.push(next);
      key = `${next.x},${next.y}`;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
}

export function traceOccupiedBoundary(grid: boolean[][]): Point2[] {
  return traceOccupiedBoundaries(grid)[0] ?? [];
}

export function simplifyOrthogonal(points: Point2[]): Point2[] {
  return points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return !((previous.x === point.x && point.x === next.x) ||
      (previous.y === point.y && point.y === next.y));
  });
}

export function limitVertices(points: Point2[], maximum = 10): Point2[] {
  const result = [...points];
  while (result.length > maximum) {
    let removeIndex = 0;
    let smallest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < result.length; index += 1) {
      const a = result[(index - 1 + result.length) % result.length];
      const b = result[index];
      const c = result[(index + 1) % result.length];
      const importance = Math.abs(
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
      );
      if (importance < smallest) { smallest = importance; removeIndex = index; }
    }
    result.splice(removeIndex, 1);
  }
  return result;
}

export function splitPolygon(points: Point2[], firstIndex: number, secondIndex: number): [Point2[], Point2[]] | null {
  const a = Math.min(firstIndex, secondIndex);
  const b = Math.max(firstIndex, secondIndex);
  const first = points.slice(a, b + 1);
  const second = points.slice(b).concat(points.slice(0, a + 1));
  return first.length >= 3 && second.length >= 3 ? [first, second] : null;
}

export function area(points: Point2[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}
