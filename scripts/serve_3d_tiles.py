from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class TilesHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".json": "application/json; charset=utf-8",
        ".b3dm": "model/vnd.b3dm",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".bin": "application/octet-stream",
    }

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range, Content-Type")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "public, max-age=3600")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Cesium 3D Tiles locally.")
    parser.add_argument(
        "--root",
        default=r"D:\Work\3D\20260810_\terra_b3dms",
        help="Folder containing the top-level tileset.json.",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8789, type=int)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not (root / "tileset.json").is_file():
        raise SystemExit(f"tileset.json not found under {root}")

    handler = partial(TilesHandler, directory=str(root))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving {root}")
    print(f"Tileset URL: http://{args.host}:{args.port}/tileset.json")
    server.serve_forever()


if __name__ == "__main__":
    main()
