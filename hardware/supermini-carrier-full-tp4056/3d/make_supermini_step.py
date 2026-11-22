"""Simple 3D envelope of the ESP32-C3 SuperMini Plus V2 module.

22.5 x 18.0 mm PCB, 1.6 mm thick, USB-C receptacle at the +X end,
antenna end at -X. Origin = module centre, bottom at z=0, units mm.
"""

from pathlib import Path

import cadquery as cq

OUT = Path(__file__).resolve().parent

L, W, T = 22.5, 18.0, 1.6

body = cq.Workplane("XY").box(L, W, T, centered=(True, True, False))

# USB-C receptacle at +X end: 8.94 wide (Y), 3.26 tall, 7.35 deep, sits on top
usb_w, usb_h, usb_d = 8.94, 3.26, 7.35
usb = (
    cq.Workplane("XY")
    .box(usb_d, usb_w, usb_h, centered=(True, True, False))
    .translate((L / 2 - usb_d / 2, 0, T))
)

# antenna keep-out end: a low block to make the antenna end obvious
ant = (
    cq.Workplane("XY")
    .box(4.0, 6.0, 0.8, centered=(True, True, False))
    .translate((-L / 2 + 2.0, 0, T))
)

module = body.union(usb).union(ant)

cq.exporters.export(module, str(OUT / "esp32c3-supermini.step"))
bb = module.val().BoundingBox()
print(
    "bbox",
    [round(v, 2) for v in (bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax)],
)
