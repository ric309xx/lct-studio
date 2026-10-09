import { describe, expect, it } from 'vitest';
import { area, limitVertices, simplifyOrthogonal, splitPolygon, traceOccupiedBoundaries, traceOccupiedBoundary } from './section-outline';

describe('section outline', () => {
  it('traces the largest occupied island', () => {
    const outline = simplifyOrthogonal(traceOccupiedBoundary([
      [true, true, false, false],
      [true, true, false, false],
      [false, false, false, false],
      [false, false, false, true]
    ]));
    expect(outline).toHaveLength(4);
    expect(Math.abs(area(outline))).toBe(4);
  });
  it('limits noisy outlines to the requested number of editable points', () => {
    const points = Array.from({ length: 24 }, (_, index) => ({ x: index, y: index % 3 }));
    expect(limitVertices(points, 10)).toHaveLength(10);
  });
  it('keeps separate occupied islands as separate shapes', () => {
    const outlines = traceOccupiedBoundaries([
      [true, true, false, false],
      [true, true, false, true],
      [false, false, false, true]
    ]);
    expect(outlines).toHaveLength(2);
    expect(outlines.map((outline) => Math.abs(area(outline)))).toEqual([4, 2]);
  });
  it('splits one polygon between two non-adjacent boundary points', () => {
    const shape = [{x:0,y:0},{x:2,y:0},{x:3,y:1},{x:2,y:2},{x:0,y:2},{x:-1,y:1}];
    const split = splitPolygon(shape, 0, 3);
    expect(split).not.toBeNull();
    expect(split?.map((part) => part.length)).toEqual([4, 4]);
    expect(splitPolygon(shape, 0, 1)).toBeNull();
  });
});
