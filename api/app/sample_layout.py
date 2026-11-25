"""Geometry of the schematic heart in samples/heart-lecture.pdf.

Shared by the sample-PDF generator and the demo fixture so that the
"show on diagram" highlight lines up with the drawn shapes.
Coordinates are in diagram space (origin top-left of the figure frame).
"""

FRAME = (60.0, 150.0, 475.0, 420.0)  # x, y, w, h on the PDF page (points)

# id -> (x, y, w, h, label, label_anchor)
SHAPES: dict[str, tuple[float, float, float, float]] = {
    "superior_vena_cava": (80, 6, 40, 100),
    "inferior_vena_cava": (6, 150, 34, 170),
    "right_atrium": (40, 105, 145, 105),
    "tricuspid_valve": (80, 208, 70, 14),
    "right_ventricle": (40, 222, 195, 150),
    "pulmonary_valve": (195, 200, 40, 12),
    "pulmonary_artery": (195, 20, 40, 180),
    "left_atrium": (295, 110, 130, 98),
    "pulmonary_veins": (425, 128, 44, 62),
    "mitral_valve": (320, 208, 70, 14),
    "left_ventricle": (245, 222, 180, 175),
    "aortic_valve": (245, 200, 40, 12),
    "aorta": (245, 6, 40, 194),
    "interventricular_septum": (235, 222, 10, 150),
}


def normalised_bbox(structure_id: str) -> list[float] | None:
    shape = SHAPES.get(structure_id)
    if not shape:
        return None
    _, _, fw, fh = FRAME
    x, y, w, h = shape
    return [round(x / fw, 4), round(y / fh, 4), round(w / fw, 4), round(h / fh, 4)]
