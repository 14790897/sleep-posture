import bpy
from mathutils import Vector
from pathlib import Path

OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    return m


M_BOT = mat("bottom", (0.85, 0.42, 0.12))
M_TOP = mat("top", (0.16, 0.22, 0.30))
M_GROUND = mat("ground", (0.75, 0.75, 0.75), rough=0.9)


def add_stl(name, path, z, material):
    bpy.ops.wm.stl_import(filepath=str(path))
    obj = bpy.context.selected_objects[0]
    obj.name = name
    obj.location.z += z
    obj.data.materials.append(material)
    return obj


bottom = add_stl("bottom", OUT / "case_bottom.stl", 0.0, M_BOT)
top = add_stl("top", OUT / "case_top.stl", 26.0, M_TOP)

bpy.ops.mesh.primitive_plane_add(size=400, location=(15, 25, -0.05))
ground = bpy.context.object
ground.data.materials.append(M_GROUND)

world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.72, 0.74, 0.78, 1)
bg.inputs[1].default_value = 0.45

bpy.ops.object.light_add(type="AREA", location=(80, -60, 120))
key = bpy.context.object
key.data.energy = 300
key.data.size = 70

bpy.ops.object.light_add(type="AREA", location=(-90, 30, 80))
fill = bpy.context.object
fill.data.energy = 110
fill.data.size = 110

bpy.ops.object.light_add(type="AREA", location=(30, 90, 70))
rim = bpy.context.object
rim.data.energy = 160
rim.data.size = 80

cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 60
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render(name, loc, target):
    cam.location = Vector(loc)
    look_at(cam, Vector(target))
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200
    scene.render.filepath = str(OUT / name)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


render("preview_iso.png", (120, -95, 105), (15, 25, 13))
render("preview_ports.png", (40, -72, 34), (18, 4, 7))
render("preview_right.png", (90, 18, 55), (26, 40, 7))
render("preview_usb.png", (-90, 18, 55), (4, 40, 7))
print("done")
