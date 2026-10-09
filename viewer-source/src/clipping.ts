export type ClipCoordinate = [longitude: number, latitude: number];

export function readSavedClipping(storageKey: string): ClipCoordinate[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (coordinate): coordinate is ClipCoordinate =>
        Array.isArray(coordinate) &&
        coordinate.length === 2 &&
        coordinate.every(Number.isFinite)
    );
  } catch {
    return [];
  }
}
