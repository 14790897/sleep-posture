"""Interference check: PCB/module/plugs vs the two printed case parts."""

from __future__ import annotations

from pathlib import Path

import trimesh
from shapely.geometry import box as shp_box

OUT = Path(__file__).resolve().parent

B = trimesh.load(OUT / "case_bottom.stl")
T = trimesh.load(OUT / "case_top.stl")


def rounded_board(x0, x1, y0, y1, z0, z1, r=3.0):
    poly = shp_box(x0 + r, y0 + r, x1 - r, y1 - r).buffer(r, resolution=32)
    m = trimesh.creation.extrude_polygon(poly, z1 - z0)
    m.apply_translation((0, 0, z0))
    return m


BOXES = {
    # Worst-case envelopes for both 1.0 mm and 1.6 mm boards.
    # Module + plug after the 180° PCB rotation: USB-C end now on the LEFT.
    "module": (-1.27, 21.43, 31.64, 49.64, 4.0, 5.8),
    "module_usb_conn": (-2.67, 4.68, 36.14, 45.14, 5.1, 8.72),
    "module_plug_shell": (-9.32, -2.67, 36.47, 44.81, 5.2, 9.06),
    "module_plug_overmold": (-20.07, -9.32, 34.94, 46.34, 3.58, 10.68),
    "J1_body": (10.77, 19.71, -1.24, 6.66, 3.0, 7.85),
    "J1_plug_shell": (11.07, 19.41, -6.15, 0.6, 3.0, 7.9),
    "J1_overmold": (9.24, 21.24, -16.0, -6.15, 2.4, 9.5),
    "J2_body": (22.09, 29.99, 2.0, 13.0, 4.0, 10.1),
    "J2_plug": (22.3, 29.7, -3.6, 6.0, 3.3, 9.5),
    "SW1_body": (26.12, 30.02, 22.78, 31.58, 4.4, 7.33),
    "SW1_pins": (27.9, 28.2, 24.4, 29.9, 1.4, 5.0),
    "SW1_lever": (26.5, 29.6, 24.0, 30.4, 5.2, 10.8),
    "SW1_nub": (27.32, 28.82, 25.43, 26.93, 11.2, 11.5),
}


def box_mesh(b):
    x0, x1, y0, y1, z0, z1 = b
    m = trimesh.creation.box((x1 - x0, y1 - y0, z1 - z0))
    m.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    return m


for name, b in BOXES.items():
    m = box_mesh(b)
    row = []
    for part_name, part in (("bottom", B), ("top", T)):
        try:
            vol = m.intersection(part).volume
        except Exception as exc:  # noqa: BLE001
            row.append(f"{part_name}:ERR({exc})")
            continue
        row.append(f"{part_name}:{vol:.3f}mm3")
    print(f"{name:22s} " + "  ".join(row))

for board_name, board in (
    ("board_1.0mm", rounded_board(-0.254, 30.48, 0.0, 50.8, 3.0, 4.0)),
    ("board_1.6mm", rounded_board(-0.254, 30.48, 0.0, 50.8, 3.0, 4.6)),
):
    for part_name, part in (("bottom", B), ("top", T)):
        print(f"{board_name:14s} {part_name}:{board.intersection(part).volume:.3f}mm3")
