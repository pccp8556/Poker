#!/usr/bin/env python3
"""Independent check of src/data/ranges.json against a raster render of the PDF.

extract_ranges.py reads vector objects.  This script takes another path: it
rasterises every range page with `pdftoppm` (poppler) and samples the pixel
colour inside each grid cell, then checks that it matches the legend colour of
the action stored in the JSON.  It also writes side-by-side images (PDF grid
vs. grid redrawn from the JSON) for visual review.

Usage:  python3 scripts/verify_ranges.py [--images OUT_DIR]
Requires: pdfplumber, Pillow, poppler-utils (pdftoppm)
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import pdfplumber
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data" / "ranges.json"
DPI = 100
SCALE = DPI / 72
TOLERANCE = 18  # max per-channel difference (anti-aliasing margin)


def hex_rgb(h: str) -> tuple[int, int, int]:
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def main() -> int:
    images_dir = None
    if "--images" in sys.argv:
        images_dir = Path(sys.argv[sys.argv.index("--images") + 1])
        images_dir.mkdir(parents=True, exist_ok=True)

    doc = json.loads(DATA.read_text(encoding="utf-8"))
    pdf_path = ROOT / doc["source"]["file"]
    errors = 0
    checked = 0
    with tempfile.TemporaryDirectory() as tmp, pdfplumber.open(pdf_path) as pdf:
        for rng in doc["ranges"]:
            page_no = rng["source"]["page"]
            prefix = Path(tmp) / f"p{page_no}"
            subprocess.run(
                ["pdftoppm", "-f", str(page_no), "-l", str(page_no), "-r", str(DPI),
                 "-png", "-singlefile", str(pdf_path), str(prefix)],
                check=True,
            )
            img = Image.open(f"{prefix}.png").convert("RGB")
            page = pdf.pages[page_no - 1]
            words = page.extract_words()
            colors = {a["id"]: hex_rgb(a["sourceColor"]) for a in rng["actions"]}
            cells = [r for r in page.rects if round(r["width"]) == 33 and round(r["height"]) == 27]
            redraw = img.copy()
            draw = ImageDraw.Draw(redraw)
            for cell in cells:
                cx, cy = (cell["x0"] + cell["x1"]) / 2, (cell["top"] + cell["bottom"]) / 2
                label = next(
                    w["text"] for w in words
                    if cell["x0"] <= (w["x0"] + w["x1"]) / 2 <= cell["x1"]
                    and cell["top"] <= (w["top"] + w["bottom"]) / 2 <= cell["bottom"]
                )
                (action, freq), = rng["hands"][label].items()
                expected = colors[action]
                # Sample a 3x3 block in the upper-left area of the cell, away
                # from the centred label and from the rounded corner.
                px, py = int((cell["x0"] + 6) * SCALE), int((cell["top"] + 6) * SCALE)
                samples = [img.getpixel((px + dx, py + dy)) for dx in (0, 1, 2) for dy in (0, 1, 2)]
                actual = tuple(sorted(s[i] for s in samples)[4] for i in range(3))
                checked += 1
                if max(abs(a - e) for a, e in zip(actual, expected)) > TOLERANCE:
                    errors += 1
                    print(f"MISMATCH p{page_no} {rng['id']} {label}: raster {actual} vs {action} {expected}")
                box = [int(cell["x0"] * SCALE) + 2, int(cell["top"] * SCALE) + 2,
                       int(cell["x1"] * SCALE) - 2, int(cell["bottom"] * SCALE) - 2]
                draw.rectangle(box, fill=expected)
                draw.text((box[0] + 4, box[1] + 6), label, fill=(0, 0, 0))
            if images_dir:
                left = img.crop((0, int(150 * SCALE), int(500 * SCALE), img.height))
                right = redraw.crop((0, int(150 * SCALE), int(500 * SCALE), img.height))
                both = Image.new("RGB", (left.width * 2 + 10, left.height), "white")
                both.paste(left, (0, 0))
                both.paste(right, (left.width + 10, 0))
                both.save(images_dir / f"compare-p{page_no:02d}-{rng['id']}.png")
    print(f"{checked} cells checked against the raster render, {errors} mismatch(es)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
