from __future__ import annotations

import argparse
import json
import math
import struct
import xml.etree.ElementTree as ET
from collections import Counter, deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def read_origin(metadata_path: Path) -> np.ndarray:
    root = ET.parse(metadata_path).getroot()
    text = root.findtext("SRSOrigin")
    if not text:
        raise ValueError(f"SRSOrigin missing in {metadata_path}")
    return np.asarray([float(value) for value in text.split(",")], dtype=float)


def read_dxf_polygons(dxf_path: Path) -> list[dict]:
    lines = dxf_path.read_text(encoding="cp950", errors="replace").splitlines()
    pairs = [(lines[index].strip(), lines[index + 1].strip()) for index in range(0, len(lines) - 1, 2)]

    in_entities = False
    entities: list[dict] = []
    current = None
    for code, value in pairs:
        if code == "2" and value == "ENTITIES":
            in_entities = True
            continue
        if in_entities and code == "0" and value == "ENDSEC":
            break
        if not in_entities:
            continue
        if code == "0":
            current = {"type": value, "pairs": []}
            entities.append(current)
        elif current is not None:
            current["pairs"].append((code, value))

    polygons: list[dict] = []
    active = None
    for entity in entities:
        if entity["type"] == "POLYLINE":
            active = {
                "layer": next((value for code, value in entity["pairs"] if code == "8"), ""),
                "points": [],
            }
            polygons.append(active)
        elif entity["type"] == "VERTEX" and active is not None:
            values = {code: value for code, value in entity["pairs"]}
            active["points"].append((float(values.get("10", 0)), float(values.get("20", 0))))
        elif entity["type"] == "SEQEND":
            active = None

    result = []
    for index, polygon in enumerate(polygons, start=1):
        points = np.asarray(polygon["points"], dtype=float)
        if len(points) > 1 and np.allclose(points[0], points[-1]):
            points = points[:-1]
        if len(points) < 3:
            continue
        result.append({"id": f"parcel-{index}", "layer": polygon["layer"], "points": points})
    if not result:
        raise ValueError(f"No closed POLYLINE parcels found in {dxf_path}")
    return result


def polygon_area(points: np.ndarray) -> float:
    shifted = np.roll(points, -1, axis=0)
    return abs(float(np.sum(points[:, 0] * shifted[:, 1] - shifted[:, 0] * points[:, 1]))) / 2.0


def points_in_polygon(xs: np.ndarray, ys: np.ndarray, polygon: np.ndarray) -> np.ndarray:
    result = np.zeros(xs.shape, dtype=bool)
    previous = polygon[-1]
    for current in polygon:
        x1, y1 = previous
        x2, y2 = current
        crosses = (y1 > ys) != (y2 > ys)
        x_intersection = (x2 - x1) * (ys - y1) / (y2 - y1 + 1e-300) + x1
        result ^= crosses & (xs < x_intersection)
        previous = current
    return result


def read_obj(path: Path, origin: np.ndarray) -> dict:
    vertices = []
    texcoords = []
    faces = []
    face_texcoords = []
    face_materials = []
    current_material = "0"
    with path.open("r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if line.startswith("v "):
                values = np.fromstring(line[2:], sep=" ", dtype=float)
                vertices.append(values + origin)
            elif line.startswith("vt "):
                texcoords.append(np.fromstring(line[3:], sep=" ", dtype=float)[:2])
            elif line.startswith("usemtl "):
                current_material = line[7:].strip()
            elif line.startswith("f "):
                tokens = [token.split("/") for token in line[2:].split()]
                indices = [int(token[0]) - 1 for token in tokens]
                texture_indices = [int(token[1]) - 1 if len(token) > 1 and token[1] else -1 for token in tokens]
                for index in range(1, len(indices) - 1):
                    faces.append((indices[0], indices[index], indices[index + 1]))
                    face_texcoords.append((texture_indices[0], texture_indices[index], texture_indices[index + 1]))
                    face_materials.append(current_material)

    material_textures = {}
    material_library = path.with_suffix(".mtl")
    if material_library.exists():
        active_material = None
        for line in material_library.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("newmtl "):
                active_material = line[7:].strip()
            elif line.startswith("map_Kd ") and active_material is not None:
                material_textures[active_material] = path.parent / line[7:].strip()

    return {
        "vertices": np.asarray(vertices, dtype=float),
        "texcoords": np.asarray(texcoords, dtype=float),
        "faces": np.asarray(faces, dtype=np.int64),
        "face_texcoords": np.asarray(face_texcoords, dtype=np.int64),
        "face_materials": np.asarray(face_materials),
        "material_textures": material_textures,
    }


def rasterize_mesh(
    vertices: np.ndarray,
    faces: np.ndarray,
    min_x: float,
    min_y: float,
    width: int,
    height: int,
    resolution: float,
) -> np.ndarray:
    raster = np.full((height, width), np.nan, dtype=np.float32)
    triangles = vertices[faces]
    bounds_min = triangles[:, :, :2].min(axis=1)
    bounds_max = triangles[:, :, :2].max(axis=1)
    keep = (
        (bounds_max[:, 0] >= min_x)
        & (bounds_min[:, 0] <= min_x + width * resolution)
        & (bounds_max[:, 1] >= min_y)
        & (bounds_min[:, 1] <= min_y + height * resolution)
    )

    for triangle in triangles[keep]:
        px0 = max(0, int(math.floor((triangle[:, 0].min() - min_x) / resolution)))
        px1 = min(width - 1, int(math.floor((triangle[:, 0].max() - min_x) / resolution)))
        py0 = max(0, int(math.floor((triangle[:, 1].min() - min_y) / resolution)))
        py1 = min(height - 1, int(math.floor((triangle[:, 1].max() - min_y) / resolution)))
        if px1 < px0 or py1 < py0:
            continue

        x_values = min_x + (np.arange(px0, px1 + 1) + 0.5) * resolution
        y_values = min_y + (np.arange(py0, py1 + 1) + 0.5) * resolution
        grid_x, grid_y = np.meshgrid(x_values, y_values)

        x1, y1, z1 = triangle[0]
        x2, y2, z2 = triangle[1]
        x3, y3, z3 = triangle[2]
        denominator = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
        if abs(denominator) < 1e-12:
            continue
        w1 = ((y2 - y3) * (grid_x - x3) + (x3 - x2) * (grid_y - y3)) / denominator
        w2 = ((y3 - y1) * (grid_x - x3) + (x1 - x3) * (grid_y - y3)) / denominator
        w3 = 1.0 - w1 - w2
        inside = (w1 >= -1e-7) & (w2 >= -1e-7) & (w3 >= -1e-7)
        if not inside.any():
            continue
        values = w1 * z1 + w2 * z2 + w3 * z3
        view = raster[py0 : py1 + 1, px0 : px1 + 1]
        replace = inside & (np.isnan(view) | (values > view))
        view[replace] = values[replace]
    return raster


def rasterize_textured_mesh(
    mesh: dict,
    min_x: float,
    min_y: float,
    width: int,
    height: int,
    resolution: float,
) -> tuple[np.ndarray, np.ndarray]:
    vertices = mesh["vertices"]
    faces = mesh["faces"]
    texcoords = mesh["texcoords"]
    face_texcoords = mesh["face_texcoords"]
    face_materials = mesh["face_materials"]
    textures = {
        material: np.asarray(Image.open(path).convert("RGB"))
        for material, path in mesh["material_textures"].items()
        if path.exists()
    }
    raster = np.zeros((height, width, 3), dtype=np.uint8)
    z_buffer = np.full((height, width), -np.inf, dtype=np.float32)
    triangles = vertices[faces]
    bounds_min = triangles[:, :, :2].min(axis=1)
    bounds_max = triangles[:, :, :2].max(axis=1)
    keep_indices = np.flatnonzero(
        (bounds_max[:, 0] >= min_x)
        & (bounds_min[:, 0] <= min_x + width * resolution)
        & (bounds_max[:, 1] >= min_y)
        & (bounds_min[:, 1] <= min_y + height * resolution)
    )

    for face_index in keep_indices:
        triangle = triangles[face_index]
        texture = textures.get(face_materials[face_index])
        uv_indices = face_texcoords[face_index]
        if texture is None or np.any(uv_indices < 0):
            continue
        triangle_uv = texcoords[uv_indices]
        px0 = max(0, int(math.floor((triangle[:, 0].min() - min_x) / resolution)))
        px1 = min(width - 1, int(math.floor((triangle[:, 0].max() - min_x) / resolution)))
        py0 = max(0, int(math.floor((triangle[:, 1].min() - min_y) / resolution)))
        py1 = min(height - 1, int(math.floor((triangle[:, 1].max() - min_y) / resolution)))
        if px1 < px0 or py1 < py0:
            continue
        x_values = min_x + (np.arange(px0, px1 + 1) + 0.5) * resolution
        y_values = min_y + (np.arange(py0, py1 + 1) + 0.5) * resolution
        grid_x, grid_y = np.meshgrid(x_values, y_values)
        x1, y1, z1 = triangle[0]
        x2, y2, z2 = triangle[1]
        x3, y3, z3 = triangle[2]
        denominator = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
        if abs(denominator) < 1e-12:
            continue
        w1 = ((y2 - y3) * (grid_x - x3) + (x3 - x2) * (grid_y - y3)) / denominator
        w2 = ((y3 - y1) * (grid_x - x3) + (x1 - x3) * (grid_y - y3)) / denominator
        w3 = 1.0 - w1 - w2
        inside = (w1 >= -1e-7) & (w2 >= -1e-7) & (w3 >= -1e-7)
        values = w1 * z1 + w2 * z2 + w3 * z3
        z_view = z_buffer[py0 : py1 + 1, px0 : px1 + 1]
        replace = inside & (values > z_view)
        if not replace.any():
            continue
        uv = w1[..., None] * triangle_uv[0] + w2[..., None] * triangle_uv[1] + w3[..., None] * triangle_uv[2]
        texture_height, texture_width = texture.shape[:2]
        texture_x = np.clip(np.rint(uv[..., 0] * (texture_width - 1)), 0, texture_width - 1).astype(int)
        texture_y = np.clip(np.rint((1.0 - uv[..., 1]) * (texture_height - 1)), 0, texture_height - 1).astype(int)
        color_view = raster[py0 : py1 + 1, px0 : px1 + 1]
        sampled = texture[texture_y, texture_x]
        z_view[replace] = values[replace]
        color_view[replace] = sampled[replace]
    return raster, z_buffer


def rasterize_las(
    las_paths: list[Path],
    min_x: float,
    min_y: float,
    width: int,
    height: int,
    resolution: float,
) -> tuple[np.ndarray, np.ndarray, list[dict]]:
    surface_flat = np.full(height * width, -np.inf, dtype=np.float32)
    ground_parts = []
    stats = []
    max_x = min_x + width * resolution
    max_y = min_y + height * resolution

    for path in las_paths:
        with path.open("rb") as handle:
            header = handle.read(375)
        if header[:4] != b"LASF":
            raise ValueError(f"Not a LAS file: {path}")
        header_size = struct.unpack_from("<H", header, 94)[0]
        point_offset = struct.unpack_from("<I", header, 96)[0]
        point_format = header[104] & 0x3F
        record_length = struct.unpack_from("<H", header, 105)[0]
        legacy_count = struct.unpack_from("<I", header, 107)[0]
        point_count = struct.unpack_from("<Q", header, 247)[0] if header_size >= 255 else 0
        point_count = point_count or legacy_count
        scale = np.asarray(struct.unpack_from("<3d", header, 131))
        offset = np.asarray(struct.unpack_from("<3d", header, 155))
        classification_offset = 16 if point_format >= 6 else 15
        dtype = np.dtype({
            "names": ["x", "y", "z", "classification"],
            "formats": ["<i4", "<i4", "<i4", "u1"],
            "offsets": [0, 4, 8, classification_offset],
            "itemsize": record_length,
        })
        points = np.memmap(path, dtype=dtype, mode="r", offset=point_offset, shape=(point_count,))
        class_histogram = np.zeros(256, dtype=np.int64)
        roi_histogram = np.zeros(256, dtype=np.int64)
        roi_count = 0
        for start in range(0, point_count, 1_000_000):
            chunk = points[start : min(point_count, start + 1_000_000)]
            class_histogram += np.bincount(chunk["classification"], minlength=256)
            x = chunk["x"].astype(np.float64) * scale[0] + offset[0]
            y = chunk["y"].astype(np.float64) * scale[1] + offset[1]
            inside = (x >= min_x) & (x < max_x) & (y >= min_y) & (y < max_y)
            if not inside.any():
                continue
            selected = chunk[inside]
            selected_x = x[inside]
            selected_y = y[inside]
            selected_z = selected["z"].astype(np.float64) * scale[2] + offset[2]
            selected_class = selected["classification"]
            roi_count += int(len(selected))
            roi_histogram += np.bincount(selected_class, minlength=256)
            cols = np.floor((selected_x - min_x) / resolution).astype(np.int64)
            rows = np.floor((selected_y - min_y) / resolution).astype(np.int64)
            flat_indices = rows * width + cols
            np.maximum.at(surface_flat, flat_indices, selected_z.astype(np.float32))
            ground = selected_class == 2
            if ground.any():
                ground_parts.append(np.column_stack((selected_x[ground], selected_y[ground], selected_z[ground])))
        stats.append({
            "name": path.name,
            "version": f"{header[24]}.{header[25]}",
            "point_format": int(point_format),
            "points": int(point_count),
            "classes": {str(index): int(value) for index, value in enumerate(class_histogram) if value},
            "roi_points": roi_count,
            "roi_classes": {str(index): int(value) for index, value in enumerate(roi_histogram) if value},
        })
        del points

    surface = surface_flat.reshape((height, width))
    surface[~np.isfinite(surface)] = np.nan
    ground_points = np.vstack(ground_parts) if ground_parts else np.empty((0, 3), dtype=float)
    return surface, ground_points, stats


def fit_ground_points(points: np.ndarray, grid_x: np.ndarray, grid_y: np.ndarray) -> tuple[np.ndarray, dict]:
    if len(points) < 10:
        raise ValueError("LAS has insufficient Class 2 ground points in the analysis extent")
    reference_x = float(np.mean(points[:, 0]))
    reference_y = float(np.mean(points[:, 1]))
    design = np.column_stack((points[:, 0] - reference_x, points[:, 1] - reference_y, np.ones(len(points))))
    selection = np.ones(len(points), dtype=bool)
    coefficients = np.linalg.lstsq(design, points[:, 2], rcond=None)[0]
    for _ in range(5):
        residual = points[:, 2] - design @ coefficients
        median = np.median(residual[selection])
        mad = np.median(np.abs(residual[selection] - median))
        tolerance = max(0.08, 3.0 * 1.4826 * mad)
        selection = np.abs(residual - median) <= tolerance
        coefficients = np.linalg.lstsq(design[selection], points[selection, 2], rcond=None)[0]
    ground = (
        coefficients[0] * (grid_x - reference_x)
        + coefficients[1] * (grid_y - reference_y)
        + coefficients[2]
    )
    final_residual = points[:, 2] - design @ coefficients
    return ground, {
        "source": "LAS classification 2",
        "reference_twd97": [round(reference_x, 3), round(reference_y, 3)],
        "height_at_reference_m": round(float(coefficients[2]), 4),
        "slope_x_m_per_m": round(float(coefficients[0]), 8),
        "slope_y_m_per_m": round(float(coefficients[1]), 8),
        "ground_points": int(np.count_nonzero(selection)),
        "median_absolute_residual_m": round(float(np.median(np.abs(final_residual[selection]))), 4),
    }


def load_dem(dem_path: Path) -> tuple[np.ndarray, tuple[float, float, float, float]]:
    world_path = dem_path.with_suffix(".tfw")
    if not world_path.exists():
        raise ValueError(f"World file missing for DEM: {world_path}")
    world = [float(value.strip()) for value in world_path.read_text(encoding="utf-8").splitlines() if value.strip()]
    if len(world) != 6 or world[1] != 0 or world[2] != 0:
        raise ValueError("Only north-up, unrotated DEM world files are supported")
    pixel_x, pixel_y, center_x, center_y = world[0], world[3], world[4], world[5]
    data = np.asarray(Image.open(dem_path), dtype=np.float64)
    data[data <= -9990] = np.nan
    return data, (pixel_x, pixel_y, center_x, center_y)


def sample_dem(
    data: np.ndarray,
    transform: tuple[float, float, float, float],
    xs: np.ndarray,
    ys: np.ndarray,
) -> np.ndarray:
    pixel_x, pixel_y, center_x, center_y = transform
    cols = (xs - center_x) / pixel_x
    rows = (ys - center_y) / pixel_y
    col0 = np.floor(cols).astype(np.int64)
    row0 = np.floor(rows).astype(np.int64)
    col1 = col0 + 1
    row1 = row0 + 1
    valid = (col0 >= 0) & (row0 >= 0) & (col1 < data.shape[1]) & (row1 < data.shape[0])
    output = np.full(xs.shape, np.nan, dtype=np.float64)
    if not valid.any():
        return output
    dx = cols[valid] - col0[valid]
    dy = rows[valid] - row0[valid]
    q00 = data[row0[valid], col0[valid]]
    q10 = data[row0[valid], col1[valid]]
    q01 = data[row1[valid], col0[valid]]
    q11 = data[row1[valid], col1[valid]]
    values = (
        q00 * (1 - dx) * (1 - dy)
        + q10 * dx * (1 - dy)
        + q01 * (1 - dx) * dy
        + q11 * dx * dy
    )
    output[valid] = values
    return output


def binary_dilate(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    result = mask.copy()
    for _ in range(iterations):
        padded = np.pad(result, 1, constant_values=False)
        result = np.zeros_like(result)
        for dy in range(3):
            for dx in range(3):
                result |= padded[dy : dy + mask.shape[0], dx : dx + mask.shape[1]]
    return result


def binary_erode(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    result = mask.copy()
    for _ in range(iterations):
        padded = np.pad(result, 1, constant_values=False)
        next_result = np.ones_like(result)
        for dy in range(3):
            for dx in range(3):
                next_result &= padded[dy : dy + mask.shape[0], dx : dx + mask.shape[1]]
        result = next_result
    return result


def remove_small_components(mask: np.ndarray, minimum_pixels: int) -> np.ndarray:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    output = np.zeros_like(mask, dtype=bool)
    for row, col in np.argwhere(mask):
        if visited[row, col]:
            continue
        queue = deque([(int(row), int(col))])
        visited[row, col] = True
        component = []
        while queue:
            current_row, current_col = queue.popleft()
            component.append((current_row, current_col))
            for delta_row, delta_col in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                next_row = current_row + delta_row
                next_col = current_col + delta_col
                if (
                    0 <= next_row < height
                    and 0 <= next_col < width
                    and mask[next_row, next_col]
                    and not visited[next_row, next_col]
                ):
                    visited[next_row, next_col] = True
                    queue.append((next_row, next_col))
        if len(component) >= minimum_pixels:
            rows, cols = zip(*component)
            output[np.asarray(rows), np.asarray(cols)] = True
    return output


def component_stats(mask: np.ndarray, min_x: float, min_y: float, resolution: float) -> list[dict]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    components = []
    for row, col in np.argwhere(mask):
        if visited[row, col]:
            continue
        queue = deque([(int(row), int(col))])
        visited[row, col] = True
        cells = []
        while queue:
            current_row, current_col = queue.popleft()
            cells.append((current_row, current_col))
            for delta_row, delta_col in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                next_row = current_row + delta_row
                next_col = current_col + delta_col
                if (
                    0 <= next_row < height
                    and 0 <= next_col < width
                    and mask[next_row, next_col]
                    and not visited[next_row, next_col]
                ):
                    visited[next_row, next_col] = True
                    queue.append((next_row, next_col))
        rows = np.asarray([cell[0] for cell in cells])
        cols = np.asarray([cell[1] for cell in cells])
        components.append({
            "area_m2": round(len(cells) * resolution * resolution, 3),
            "centroid_twd97": [
                round(float(min_x + (cols.mean() + 0.5) * resolution), 3),
                round(float(min_y + (rows.mean() + 0.5) * resolution), 3),
            ],
            "bounds_twd97": [
                round(float(min_x + cols.min() * resolution), 3),
                round(float(min_y + rows.min() * resolution), 3),
                round(float(min_x + (cols.max() + 1) * resolution), 3),
                round(float(min_y + (rows.max() + 1) * resolution), 3),
            ],
        })
    return sorted(components, key=lambda component: component["area_m2"], reverse=True)


def largest_component_mask(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    largest = []
    for row, col in np.argwhere(mask):
        if visited[row, col]:
            continue
        queue = deque([(int(row), int(col))])
        visited[row, col] = True
        cells = []
        while queue:
            current_row, current_col = queue.popleft()
            cells.append((current_row, current_col))
            for delta_row, delta_col in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                next_row = current_row + delta_row
                next_col = current_col + delta_col
                if (
                    0 <= next_row < height
                    and 0 <= next_col < width
                    and mask[next_row, next_col]
                    and not visited[next_row, next_col]
                ):
                    visited[next_row, next_col] = True
                    queue.append((next_row, next_col))
        if len(cells) > len(largest):
            largest = cells
    output = np.zeros_like(mask, dtype=bool)
    if largest:
        rows, cols = zip(*largest)
        output[np.asarray(rows), np.asarray(cols)] = True
    return output


def fit_ground_plane(xs: np.ndarray, ys: np.ndarray, heights: np.ndarray) -> tuple[np.ndarray, float]:
    valid = np.isfinite(heights)
    sample_x = xs[valid]
    sample_y = ys[valid]
    sample_z = heights[valid]
    if len(sample_z) < 10:
        raise ValueError("Not enough mesh samples to estimate ground")

    selection = sample_z <= np.percentile(sample_z, 45)
    design = np.column_stack((sample_x, sample_y, np.ones_like(sample_x)))
    coefficients = np.linalg.lstsq(design[selection], sample_z[selection], rcond=None)[0]
    for _ in range(4):
        residual = sample_z - design @ coefficients
        selection = residual <= np.percentile(residual, 55)
        coefficients = np.linalg.lstsq(design[selection], sample_z[selection], rcond=None)[0]
    residual = sample_z - design @ coefficients
    return coefficients, float(np.median(np.abs(residual[selection])))


def colorize_height(height: np.ndarray, valid: np.ndarray) -> np.ndarray:
    low, high = np.nanpercentile(height[valid], [2, 98])
    normalized = np.clip((height - low) / max(high - low, 1e-6), 0, 1)
    red = np.clip(1.8 * normalized - 0.25, 0, 1)
    green = np.clip(1.7 - 2.0 * np.abs(normalized - 0.55), 0, 1)
    blue = np.clip(1.15 - 1.6 * normalized, 0, 1)
    rgb = np.stack((red, green, blue), axis=-1)
    rgb[~valid] = (0.08, 0.09, 0.1)
    return (rgb * 255).astype(np.uint8)


def draw_polygon(draw: ImageDraw.ImageDraw, polygon: np.ndarray, transform, color: tuple[int, int, int], width: int):
    points = [transform(x, y) for x, y in polygon]
    draw.line(points + [points[0]], fill=color, width=width, joint="curve")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--resolution", type=float, default=0.10)
    parser.add_argument("--las-dir", type=Path)
    parser.add_argument("--dem", type=Path)
    parser.add_argument("--display-threshold", type=float, default=2.0)
    parser.add_argument("--confirmed-parcel")
    parser.add_argument("--parcel-label")
    args = parser.parse_args()

    input_dir = args.input
    output_dir = args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    origin = read_origin(input_dir / "terra_obj" / "metadata.xml")
    parcels = read_dxf_polygons(input_dir / "1007.dxf")

    all_points = np.vstack([parcel["points"] for parcel in parcels])
    margin = 3.0
    min_x = float(all_points[:, 0].min() - margin)
    min_y = float(all_points[:, 1].min() - margin)
    max_x = float(all_points[:, 0].max() + margin)
    max_y = float(all_points[:, 1].max() + margin)
    resolution = args.resolution
    width = int(math.ceil((max_x - min_x) / resolution))
    height = int(math.ceil((max_y - min_y) / resolution))

    surface = np.full((height, width), np.nan, dtype=np.float32)
    orthophoto = np.zeros((height, width, 3), dtype=np.uint8)
    orthophoto_z = np.full((height, width), -np.inf, dtype=np.float32)
    obj_paths = sorted((input_dir / "terra_obj").glob("*/*.obj"))
    mesh_stats = []
    for obj_path in obj_paths:
        mesh = read_obj(obj_path, origin)
        vertices = mesh["vertices"]
        faces = mesh["faces"]
        model_surface = rasterize_mesh(vertices, faces, min_x, min_y, width, height, resolution)
        replace = np.isfinite(model_surface) & (np.isnan(surface) | (model_surface > surface))
        surface[replace] = model_surface[replace]
        model_orthophoto, model_orthophoto_z = rasterize_textured_mesh(
            mesh, min_x, min_y, width, height, resolution
        )
        texture_replace = model_orthophoto_z > orthophoto_z
        orthophoto_z[texture_replace] = model_orthophoto_z[texture_replace]
        orthophoto[texture_replace] = model_orthophoto[texture_replace]
        mesh_stats.append({
            "name": obj_path.name,
            "vertices": int(len(vertices)),
            "triangles": int(len(faces)),
            "bounds": {"min": vertices.min(axis=0).tolist(), "max": vertices.max(axis=0).tolist()},
        })

    x_centers = min_x + (np.arange(width) + 0.5) * resolution
    y_centers = min_y + (np.arange(height) + 0.5) * resolution
    grid_x, grid_y = np.meshgrid(x_centers, y_centers)
    las_stats = []
    if args.las_dir:
        las_paths = sorted(args.las_dir.glob("*.las"))
        if not las_paths:
            raise ValueError(f"No LAS files found in {args.las_dir}")
        surface, ground_points, las_stats = rasterize_las(
            las_paths, min_x, min_y, width, height, resolution
        )
        if args.dem:
            dem, dem_transform = load_dem(args.dem)
            ground = sample_dem(dem, dem_transform, grid_x, grid_y)
            validation_values = sample_dem(
                dem, dem_transform, ground_points[:, 0], ground_points[:, 1]
            )
            validation = np.isfinite(validation_values)
            difference = ground_points[validation, 2] - validation_values[validation]
            ground_details = {
                "source": "DEM GeoTIFF",
                "path": str(args.dem),
                "resolution_m": [abs(dem_transform[0]), abs(dem_transform[1])],
                "las_class_2_validation_points": int(np.count_nonzero(validation)),
                "las_minus_dem_median_m": round(float(np.median(difference)), 4),
                "las_minus_dem_mad_m": round(float(np.median(np.abs(difference - np.median(difference)))), 4),
            }
            status = "LAS DSM minus DEM DTM preliminary estimate"
        else:
            ground, ground_details = fit_ground_points(ground_points, grid_x, grid_y)
            status = "LAS ground-classified preliminary estimate"
    else:
        coefficients, ground_mad = fit_ground_plane(grid_x, grid_y, surface)
        ground = coefficients[0] * grid_x + coefficients[1] * grid_y + coefficients[2]
        ground_details = {
            "source": "OBJ lower-envelope plane",
            "z": f"{coefficients[0]:.12f} * x + {coefficients[1]:.12f} * y + {coefficients[2]:.6f}",
            "median_absolute_residual_m": round(ground_mad, 4),
        }
        status = "model-derived preliminary estimate"
    valid = np.isfinite(surface)
    normalized_height = surface - ground

    parcel_masks = [points_in_polygon(grid_x, grid_y, parcel["points"]) for parcel in parcels]
    parcel_union = np.logical_or.reduce(parcel_masks)
    sensitivity = []
    selected_mask = None
    for threshold in (1.5, 2.0, 2.5, 3.0):
        structure = valid & (normalized_height >= threshold)
        structure = binary_erode(binary_dilate(structure, 1), 1)
        structure = remove_small_components(structure, max(1, int(round(1.0 / (resolution * resolution)))))
        rows = []
        for parcel, parcel_mask in zip(parcels, parcel_masks):
            cadastral_area = polygon_area(parcel["points"])
            occupied_area = float(np.count_nonzero(structure & parcel_mask) * resolution * resolution)
            rows.append({
                "parcel_id": parcel["id"],
                "cadastral_area_m2": round(cadastral_area, 3),
                "occupied_area_m2": round(occupied_area, 3),
                "occupancy_percent": round(occupied_area / cadastral_area * 100, 2),
                "components": component_stats(
                    structure & parcel_mask, min_x, min_y, resolution
                ),
            })
        sensitivity.append({"threshold_m": threshold, "parcels": rows})
        if threshold == args.display_threshold:
            selected_mask = structure

    assert selected_mask is not None
    confirmed_mask = np.zeros_like(selected_mask, dtype=bool)
    confirmed_selection = None
    if args.confirmed_parcel:
        parcel_index = next(
            (index for index, parcel in enumerate(parcels) if parcel["id"] == args.confirmed_parcel),
            None,
        )
        if parcel_index is None:
            raise ValueError(f"Unknown confirmed parcel: {args.confirmed_parcel}")
        confirmed_mask = largest_component_mask(selected_mask & parcel_masks[parcel_index])
        cadastral_area = polygon_area(parcels[parcel_index]["points"])
        occupied_area = float(np.count_nonzero(confirmed_mask) * resolution * resolution)
        confirmed_selection = {
            "parcel_id": args.confirmed_parcel,
            "parcel_label": args.parcel_label or args.confirmed_parcel,
            "selection_rule": "largest connected elevated component inside parcel",
            "height_threshold_m": args.display_threshold,
            "cadastral_area_m2": round(cadastral_area, 3),
            "occupied_area_m2": round(occupied_area, 3),
            "occupancy_percent": round(occupied_area / cadastral_area * 100, 2),
            "review_status": "user-confirmed target component",
        }

    result = {
        "status": status,
        "crs": "EPSG:3826+8904",
        "resolution_m": resolution,
        "ground_plane": ground_details,
        "mesh": mesh_stats,
        "las": las_stats,
        "parcel_total_area_m2": round(sum(polygon_area(parcel["points"]) for parcel in parcels), 3),
        "confirmed_selection": confirmed_selection,
        "sensitivity": sensitivity,
        "limitations": ([
            "The supplied DEM is treated as the bare-earth terrain model and cross-checked against LAS Class 2 points.",
        ] if args.las_dir and args.dem else [
            "Bare-earth elevation is derived from LAS Class 2 ground points.",
        ] if args.las_dir else [
            "DSM and DTM were not supplied; ground and structure heights are inferred from the OBJ surface mesh.",
        ]) + [
            "Height and LAS classification alone cannot distinguish buildings from trees, vehicles, or other elevated objects.",
            "Results require orthophoto review and manual footprint confirmation before engineering use.",
        ],
    }
    (output_dir / "occupancy-results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    scale = 2
    base_rgb = colorize_height(surface, valid)
    overlay = base_rgb.copy()
    overlay[selected_mask & parcel_union] = (
        0.35 * overlay[selected_mask & parcel_union] + 0.65 * np.asarray([255, 61, 89])
    ).astype(np.uint8)
    overlay[confirmed_mask] = (
        0.25 * overlay[confirmed_mask] + 0.75 * np.asarray([48, 230, 126])
    ).astype(np.uint8)
    overlay = np.flipud(overlay)
    image = Image.fromarray(overlay).resize((width * scale, height * scale), Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(image)

    def transform(x_value: float, y_value: float) -> tuple[int, int]:
        x_pixel = int(round((x_value - min_x) / resolution * scale))
        y_pixel = int(round((max_y - y_value) / resolution * scale))
        return x_pixel, y_pixel

    colors = [(255, 211, 92), (91, 225, 255), (160, 255, 125), (255, 171, 245)]
    for index, parcel in enumerate(parcels):
        draw_polygon(draw, parcel["points"], transform, colors[index % len(colors)], max(2, scale * 2))
        centroid = parcel["points"].mean(axis=0)
        draw.text(transform(*centroid), str(index + 1), fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0), anchor="mm")
    draw.rectangle((10, 10, 570, 76), fill=(0, 0, 0, 190))
    draw.text(
        (22, 20),
        f"Red = candidates >= {args.display_threshold:.1f} m; Green = confirmed building",
        fill=(255, 255, 255),
    )
    draw.text((22, 45), "Yellow/Cyan = DXF parcel boundaries", fill=(255, 255, 255))
    image.save(output_dir / "occupancy-review.png")

    photo = Image.fromarray(np.flipud(orthophoto)).resize(
        (width * scale, height * scale), Image.Resampling.NEAREST
    )
    photo_draw = ImageDraw.Draw(photo)
    for index, parcel in enumerate(parcels):
        draw_polygon(photo_draw, parcel["points"], transform, colors[index % len(colors)], max(2, scale * 2))
        centroid = parcel["points"].mean(axis=0)
        photo_draw.text(
            transform(*centroid),
            str(index + 1),
            fill=(255, 255, 255),
            stroke_width=2,
            stroke_fill=(0, 0, 0),
            anchor="mm",
        )
    photo.save(output_dir / "textured-top-view.png")

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
