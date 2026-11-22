"""3D-printable enclosure for the SuperMini carrier (TP4056 revision).

Coordinate frame = PCB data frame (mil converted to mm): X right, Y "down"
(the connector edge y=0 is the top edge), Z up from the case back.

Board  : 30.734 x 50.8 mm, 1.0 mm thick, top-side parts only.
Case   : bottom tub (floor 2.0, rim 11.2) + screw-on lid (1.2) => 12.4 mm tall.
Screws : 4x M2 self-tapping (PCB NPTH 2.2 mm), through lid + board.
"""

from __future__ import annotations

import math
from pathlib import Path

import cadquery as cq

OUT = Path(__file__).resolve().parent

# ---------------------------------------------------------------- dimensions
BX0, BX1 = -0.254, 30.48          # board outline (mm)
BY0, BY1 = 0.0, 50.8
BOARD_T = 1.0                      # nominal; openings are sized for both 1.0 and 1.6 mm boards

GAP = 0.3                          # cavity clearance around the board
WALL = 2.0
FLOOR = 2.0
BOSS_H = 1.0                       # board bottom = FLOOR + BOSS_H = 3.0
ABOVE = 7.2                        # cavity height above the board (USB-C 插头包胶)
R_OUT, R_IN = 5.0, 3.0

BOARD_Z0 = FLOOR + BOSS_H          # 3.0
BOARD_Z1 = BOARD_Z0 + BOARD_T      # 4.0
RIM = BOARD_Z1 + ABOVE             # 11.2
LID_T = 1.2
TOTAL_H = RIM + LID_T              # 12.4

IX0, IX1 = BX0 - GAP, BX1 + GAP
IY0, IY1 = BY0 - GAP, BY1 + GAP
OX0, OX1 = IX0 - WALL, IX1 + WALL
OY0, OY1 = IY0 - WALL, IY1 + WALL
IW, ID = IX1 - IX0, IY1 - IY0
OW, OD = OX1 - OX0, OY1 - OY0
CX, CY = (OX0 + OX1) / 2, (OY0 + OY1) / 2

SCREWS = [(2.794, 2.794), (2.032, 25.654), (28.194, 33.528), (28.194, 48.768)]
SCREW_CLEAR = 2.4
SCREW_HEAD = 4.2
SCREW_CB_DEPTH = 0.8
PILOT_D = 1.6
PILOT_DEPTH = 2.2
BOSS_D = 4.6

# Module opening on the LEFT wall (USB-C end after the 2026-11-18 180° rotation).
# It must clear both the USB-C connector and the module PCB overhang (x≈-1.27),
# so it spans the full module width; z top stays below the rim to keep the lid seat.
USB_Y0, USB_Y1 = 31.0, 50.3
USB_Z0, USB_Z1 = 3.2, 9.2
# Antenna window on the RIGHT wall.  The two right-hand screw bosses occupy
# z=2.0..3.0, so the window starts at z=3.2.  Top is 7.0 to cover the ceramic
# antenna (6.6) and U.FL (6.8) of the 1.6 mm board frame; the 1.0 mm frame is lower.
ANT_Y0, ANT_Y1 = 31.0, 50.3
ANT_Z0, ANT_Z1 = 3.2, 7.0

# Carrier USB-C (J1) and battery connector (J2) ports in the top wall.
# Openings are sized for both 1.0 mm and 1.6 mm boards (worst case = higher
# top-seated parts in the 1.6 mm frame): J1 3.0..8.1, J2 3.3..9.7.
J1_X0, J1_X1, J1_Z0, J1_Z1 = 10.47, 20.01, 3.0, 8.1
J2_X0, J2_X1, J2_Z0, J2_Z1 = 21.4, 30.6, 3.3, 9.7

# SW1 is a THT switch: with a 1.0 mm board its pins reach z=1.4, so cut a
# 1.0 mm-deep relief in the floor under the switch; the 1.6 mm board clears too.
SW1_RELIEF = (26.0, 30.2, 23.0, 31.0, 1.0, 2.0)

SW_X, SW_Y = 28.05, 27.18
SW_SLOT_W, SW_SLOT_L = 3.4, 6.0


def rprism(w: float, d: float, h: float, r: float) -> cq.Workplane:
    """Rounded-corner box centred on (0,0), bottom at z=0."""
    box = cq.Workplane("XY").box(w, d, h)
    if r > 0:
        box = box.edges("|Z").fillet(r)
    return box.translate((0, 0, h / 2))


def box_at(x0, x1, y0, y1, z0, z1) -> cq.Workplane:
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0).translate(
        ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    )


def bottom_shell() -> cq.Workplane:
    tub = rprism(OW, OD, RIM, R_OUT).translate((CX, CY, 0))
    cavity = rprism(IW, ID, RIM - FLOOR + 1.0, R_IN).translate((CX, CY, FLOOR))
    part = tub.cut(cavity)

    for hx, hy in SCREWS:
        boss = cq.Workplane("XY").circle(BOSS_D / 2).extrude(BOSS_H).translate(
            (hx, hy, FLOOR)
        )
        part = part.union(boss)

    part = part.cut(box_at(J1_X0, J1_X1, OY0 - 1, IY0 + 1, J1_Z0, J1_Z1))
    part = part.cut(box_at(J2_X0, J2_X1, OY0 - 1, IY0 + 1, J2_Z0, J2_Z1))
    part = part.cut(box_at(OX0 - 1, IX0 + 1.2, USB_Y0, USB_Y1, USB_Z0, USB_Z1))
    part = part.cut(box_at(IX1 - 1.2, OX1 + 1, ANT_Y0, ANT_Y1, ANT_Z0, ANT_Z1))
    part = part.cut(box_at(*SW1_RELIEF))

    for hx, hy in SCREWS:
        pilot = cq.Workplane("XY").circle(PILOT_D / 2).extrude(PILOT_DEPTH).translate(
            (hx, hy, BOARD_Z0 - PILOT_DEPTH)
        )
        part = part.cut(pilot)
    return part


def lid() -> cq.Workplane:
    part = rprism(OW, OD, LID_T, R_OUT).translate((CX, CY, RIM))
    lip = rprism(IW - 0.2, ID - 0.2, 0.4, R_IN).translate((CX, CY, RIM - 0.4))
    part = part.union(lip)

    for hx, hy in SCREWS:
        through = cq.Workplane("XY").circle(SCREW_CLEAR / 2).extrude(LID_T + 2).translate(
            (hx, hy, RIM - 1)
        )
        cb = cq.Workplane("XY").circle(SCREW_HEAD / 2).extrude(
            SCREW_CB_DEPTH + 1
        ).translate((hx, hy, RIM + LID_T - SCREW_CB_DEPTH))
        part = part.cut(through).cut(cb)

    slot = rprism(SW_SLOT_W, SW_SLOT_L, LID_T + 2, 1.5).translate(
        (SW_X, SW_Y, RIM - 1)
    )
    part = part.cut(slot)
    return part


def main() -> None:
    bottom = bottom_shell()
    top = lid()

    cq.exporters.export(bottom, str(OUT / "case_bottom.step"))
    cq.exporters.export(top, str(OUT / "case_top.step"))
    cq.exporters.export(
        bottom, str(OUT / "case_bottom.stl"), tolerance=0.05, angularTolerance=0.3
    )
    cq.exporters.export(
        top, str(OUT / "case_top.stl"), tolerance=0.05, angularTolerance=0.3
    )

    bb = bottom.val().BoundingBox()
    print(
        "bottom bbox",
        [round(v, 2) for v in (bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax)],
    )
    bb = top.val().BoundingBox()
    print(
        "top    bbox",
        [round(v, 2) for v in (bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax)],
    )
    print("outer", round(OW, 2), "x", round(OD, 2), "x", round(TOTAL_H, 2), "mm")


if __name__ == "__main__":
    main()
