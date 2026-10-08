#!/usr/bin/env python3
"""Build the browser GeoJSON used by the Taoyuan cadastral viewer project."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

import analyze_obj_cadastral_occupancy as occupancy


def twd97_to_wgs84(x: float, y: float) -> list[float]:
    a = 6378137.0
    b = 6356752.314245
    longitude0 = math.radians(121.0)
    k0 = 0.9999
    dx = 250000.0
    e = math.sqrt(1.0 - (b / a) ** 2)
    e2 = e * e / (1.0 - e * e)
    x = x - dx
    meridian = y / k0
    mu = meridian / (a * (1 - e**2 / 4 - 3 * e**4 / 64 - 5 * e**6 / 256))
    e1 = (1 - math.sqrt(1 - e**2)) / (1 + math.sqrt(1 - e**2))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
        + 151 * e1**3 / 96 * math.sin(6 * mu)
        + 1097 * e1**4 / 512 * math.sin(8 * mu)
    )
    c1 = e2 * math.cos(phi1) ** 2
    t1 = math.tan(phi1) ** 2
    n1 = a / math.sqrt(1 - e**2 * math.sin(phi1) ** 2)
    r1 = a * (1 - e**2) / (1 - e**2 * math.sin(phi1) ** 2) ** 1.5
    d = x / (n1 * k0)
    latitude = phi1 - (n1 * math.tan(phi1) / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * e2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * e2 - 3 * c1**2) * d**6 / 720
    )
    longitude = longitude0 + (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * e2 + 24 * t1**2) * d**5 / 120
    ) / math.cos(phi1)
    return [round(math.degrees(longitude), 9), round(math.degrees(latitude), 9)]


def signed_area(points: list[tuple[float, float]]) -> float:
    return sum(
        points[index][0] * points[(index + 1) % len(points)][1]
        - points[(index + 1) % len(points)][0] * points[index][1]
        for index in range(len(points))
    ) / 2


def simplify(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    if len(points) <= 3:
        return points
    start, end = np.asarray(points[0]), np.asarray(points[-1])
    segment = end - start
    if np.linalg.norm(segment) == 0:
        distances = np.linalg.norm(np.asarray(points[1:-1]) - start, axis=1)
    else:
        vectors = np.asarray(points[1:-1]) - start
        distances = np.abs(np.cross(segment, vectors) / np.linalg.norm(segment))
    if len(distances) == 0 or float(distances.max()) <= tolerance:
        return [points[0], points[-1]]
    index = int(distances.argmax()) + 1
    return simplify(points[: index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def mask_outer_ring(mask: np.ndarray, min_x: float, min_y: float, resolution: float) -> list[tuple[float, float]]:
    edges: dict[tuple[tuple[int, int], tuple[int, int]], tuple[tuple[int, int], tuple[int, int]]] = {}
    for row, col in np.argwhere(mask):
        corners = [
            (int(col), int(row)),
            (int(col + 1), int(row)),
            (int(col + 1), int(row + 1)),
            (int(col), int(row + 1)),
        ]
        for start, end in zip(corners, corners[1:] + corners[:1]):
            key = tuple(sorted((start, end)))
            if key in edges:
                del edges[key]
            else:
                edges[key] = (start, end)
    outgoing: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for start, end in edges.values():
        outgoing.setdefault(start, []).append(end)
    rings: list[list[tuple[int, int]]] = []
    while outgoing:
        start = next(iter(outgoing))
        ring = [start]
        current = start
        while True:
            choices = outgoing.get(current, [])
            if not choices:
                break
            following = choices.pop()
            if not choices:
                del outgoing[current]
            ring.append(following)
            current = following
            if current == start:
                break
        if len(ring) >= 4 and ring[-1] == start:
            rings.append(ring)
    if not rings:
        raise ValueError("Could not trace confirmed building mask")
    world_rings = [
        [(min_x + col * resolution, min_y + row * resolution) for col, row in ring]
        for ring in rings
    ]
    ring = max(world_rings, key=lambda item: abs(signed_area(item)))
    open_ring = ring[:-1]
    anchor = min(range(len(open_ring)), key=lambda index: (open_ring[index][0], open_ring[index][1]))
    rotated = open_ring[anchor:] + open_ring[:anchor] + [open_ring[anchor]]
    result = simplify(rotated, 0.15)
    return result if result[0] == result[-1] else result + [result[0]]


def feature(feature_id: str, kind: str, coordinates, properties: dict) -> dict:
    return {
        "type": "Feature",
        "id": feature_id,
        "properties": {"kind": kind, **properties},
        "geometry": {"type": "Polygon", "coordinates": [coordinates]},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--las-dir", type=Path, required=True)
    parser.add_argument("--dem", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    parcels = occupancy.read_dxf_polygons(args.input / "1007.dxf")
    target = next(parcel for parcel in parcels if parcel["id"] == "parcel-2")
    all_points = np.vstack([parcel["points"] for parcel in parcels])
    resolution = 0.1
    min_x = float(all_points[:, 0].min() - 3)
    min_y = float(all_points[:, 1].min() - 3)
    max_x = float(all_points[:, 0].max() + 3)
    max_y = float(all_points[:, 1].max() + 3)
    width = int(math.ceil((max_x - min_x) / resolution))
    height = int(math.ceil((max_y - min_y) / resolution))
    x_centers = min_x + (np.arange(width) + 0.5) * resolution
    y_centers = min_y + (np.arange(height) + 0.5) * resolution
    grid_x, grid_y = np.meshgrid(x_centers, y_centers)
    surface, _, _ = occupancy.rasterize_las(
        sorted(args.las_dir.glob("*.las")), min_x, min_y, width, height, resolution
    )
    dem, dem_transform = occupancy.load_dem(args.dem)
    ground = occupancy.sample_dem(dem, dem_transform, grid_x, grid_y)
    structure = np.isfinite(surface) & ((surface - ground) >= 2.0)
    structure = occupancy.binary_erode(occupancy.binary_dilate(structure, 1), 1)
    structure = occupancy.remove_small_components(structure, 100)
    target_mask = occupancy.points_in_polygon(grid_x, grid_y, target["points"])
    confirmed = occupancy.largest_component_mask(structure & target_mask)
    building_ring = mask_outer_ring(confirmed, min_x, min_y, resolution)

    parcel_ring = target["points"].tolist()
    if parcel_ring[0] != parcel_ring[-1]:
        parcel_ring.append(parcel_ring[0])
    parcel_wgs84 = [twd97_to_wgs84(x, y) for x, y in parcel_ring]
    building_wgs84 = [twd97_to_wgs84(x, y) for x, y in building_ring]
    common = {
        "parcelKey": "sanzuwu-jiushe-102-45",
        "parcelNo": "102-45",
        "county": "桃園市",
        "sectionName": "三座屋段舊社小段",
        "crs": "TWD97 二度 TM（EPSG:3826）",
        "cadastralAreaM2": 268.762,
        "occupiedAreaM2": 36.67,
        "occupancyPercent": 13.64,
    }
    data = {
        "type": "FeatureCollection",
        "name": "taoyuan-building-overlay",
        "features": [
            feature(
                "parcel-102-45-fill",
                "cadastral-fill",
                parcel_wgs84,
                {**common, "fill": "#ef626c", "fill-opacity": 0.25, "stroke": "#ffbf47", "stroke-width": 3},
            ),
            {
                "type": "Feature",
                "id": "parcel-102-45-boundary",
                "properties": {**common, "kind": "cadastral-boundary", "stroke": "#ffbf47", "stroke-width": 3},
                "geometry": {"type": "LineString", "coordinates": parcel_wgs84},
            },
            feature(
                "parcel-102-45-building",
                "occupancy-building",
                building_wgs84,
                {**common, "fill": "#30e67e", "fill-opacity": 0.55, "stroke": "#b9ffd4", "stroke-width": 2},
            ),
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "parcel_centroid": twd97_to_wgs84(float(target["points"][:, 0].mean()), float(target["points"][:, 1].mean())),
        "building_vertices": len(building_wgs84),
        "confirmed_area_m2": round(float(np.count_nonzero(confirmed) * resolution * resolution), 2),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
