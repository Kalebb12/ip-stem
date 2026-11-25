"""Generate samples/heart-lecture.pdf: two pages of lecture notes and a labelled,
schematic heart diagram drawn as vector shapes. Original artwork, no licence issues.

Run:  .venv/bin/python scripts/make_sample_pdf.py
"""
from pathlib import Path
import sys

import pymupdf as fitz

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.sample_layout import FRAME, SHAPES  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "samples" / "heart-lecture.pdf"

BLUE_FILL = (0.80, 0.87, 0.97)
RED_FILL = (0.98, 0.84, 0.84)
BLUE_VESSEL = (0.55, 0.68, 0.92)
RED_VESSEL = (0.92, 0.55, 0.55)
VALVE = (0.25, 0.25, 0.25)
INK = (0.1, 0.1, 0.12)

FILLS = {
    "superior_vena_cava": BLUE_VESSEL,
    "inferior_vena_cava": BLUE_VESSEL,
    "pulmonary_artery": BLUE_VESSEL,
    "right_atrium": BLUE_FILL,
    "right_ventricle": BLUE_FILL,
    "aorta": RED_VESSEL,
    "pulmonary_veins": RED_VESSEL,
    "left_atrium": RED_FILL,
    "left_ventricle": RED_FILL,
    "tricuspid_valve": VALVE,
    "pulmonary_valve": VALVE,
    "mitral_valve": VALVE,
    "aortic_valve": VALVE,
    "interventricular_septum": (0.45, 0.35, 0.35),
}

# label text, position in diagram space, optional leader-line end
LABELS = [
    ("Right atrium", (62, 145), None),
    ("Left atrium", (322, 150), None),
    ("Right ventricle", (88, 300), None),
    ("Left ventricle", (300, 315), None),
    ("Superior\nvena cava", (126, 66), (120, 74)),
    ("Pulmonary\nartery", (130, 22), (195, 30)),
    ("Aorta", (292, 40), (285, 44)),
    ("Pulmonary veins", (352, 102), (430, 128)),
    ("Inferior\nvena cava", (4, 334), None),
    ("Tricuspid valve", (56, 240), (95, 222)),
    ("Mitral valve", (318, 240), (335, 222)),
    ("Pulmonary valve", (118, 196), (195, 206)),
    ("Aortic valve", (300, 196), (285, 206)),
    ("Interventricular\nseptum", (150, 392), (240, 372)),
]

ARROWS_BLUE = [((100, 20), (100, 120)), ((140, 200), (140, 252)), ((215, 260), (215, 40))]
ARROWS_RED = [((465, 160), (400, 160)), ((380, 195), (380, 252)), ((265, 300), (265, 20))]


def to_page(x: float, y: float) -> fitz.Point:
    return fitz.Point(FRAME[0] + x, FRAME[1] + y)


def arrow(page: fitz.Page, a, b, color) -> None:
    p, q = to_page(*a), to_page(*b)
    page.draw_line(p, q, color=color, width=1.6)
    d = q - p
    length = (d.x**2 + d.y**2) ** 0.5 or 1
    ux, uy = d.x / length, d.y / length
    left = fitz.Point(q.x - 7 * ux + 4 * uy, q.y - 7 * uy - 4 * ux)
    right = fitz.Point(q.x - 7 * ux - 4 * uy, q.y - 7 * uy + 4 * ux)
    page.draw_polyline([left, q, right, left], color=color, fill=color, width=1)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open()

    # ---- page 1: intro + figure ------------------------------------------------
    page = doc.new_page(width=595, height=842)
    page.insert_text((60, 70), "Human Anatomy 201 - Lecture 4", fontsize=10, color=(0.4, 0.4, 0.4))
    page.insert_text((60, 98), "The Human Heart", fontsize=22, fontname="hebo", color=INK)
    page.insert_textbox(
        fitz.Rect(60, 108, 535, 146),
        "The heart is a muscular pump with four chambers. Its right side moves "
        "deoxygenated blood to the lungs; its left side moves oxygenated blood to the body.",
        fontsize=10, color=INK,
    )

    fx, fy, fw, fh = FRAME
    page.draw_rect(fitz.Rect(fx, fy, fx + fw, fy + fh), color=(0.85, 0.85, 0.85), width=0.5)
    order = [k for k in SHAPES if FILLS[k] not in (VALVE,)] + [k for k in SHAPES if FILLS[k] == VALVE]
    for key in order:
        x, y, w, h = SHAPES[key]
        page.draw_rect(fitz.Rect(to_page(x, y), to_page(x + w, y + h)), color=INK, fill=FILLS[key], width=0.8)
    for a, b in ARROWS_BLUE:
        arrow(page, a, b, (0.1, 0.25, 0.65))
    for a, b in ARROWS_RED:
        arrow(page, a, b, (0.7, 0.1, 0.15))
    for text, (x, y), leader in LABELS:
        lines = text.split("\n")
        for i, line in enumerate(lines):
            page.insert_text(to_page(x, y + i * 9), line, fontsize=8, fontname="hebo", color=INK)
        if leader:
            start = to_page(x + (len(max(lines, key=len)) * 4.1 if leader[0] > x else -2), y - 3)
            page.draw_line(start, to_page(*leader), color=(0.3, 0.3, 0.3), width=0.5)

    page.insert_textbox(
        fitz.Rect(60, fy + fh + 10, 535, fy + fh + 50),
        "Figure 1. Schematic anterior view of the human heart. Blue shows deoxygenated "
        "blood and red shows oxygenated blood. Arrows show the direction of blood flow.",
        fontsize=9, fontname="heit", color=(0.3, 0.3, 0.3),
    )

    # ---- page 2: lecture notes -----------------------------------------------
    notes = doc.new_page(width=595, height=842)
    notes.insert_text((60, 80), "Lecture notes", fontsize=16, fontname="hebo", color=INK)
    body = (
        "Chambers. The right atrium receives deoxygenated blood from the body through the "
        "superior and inferior venae cavae. The right ventricle pumps this blood through the "
        "pulmonary valve into the pulmonary artery, which carries it to the lungs. The left "
        "atrium receives oxygenated blood from the lungs through the pulmonary veins. The left "
        "ventricle has the thickest muscular wall because it pumps blood through the aortic "
        "valve into the aorta and on to the whole body.\n\n"
        "Valves. Four valves keep blood moving in one direction. The tricuspid valve lies between "
        "the right atrium and right ventricle. The mitral (bicuspid) valve lies between the left "
        "atrium and left ventricle. The atrioventricular valves are anchored to the ventricle walls "
        "by the chordae tendineae, which stop the valve flaps turning inside out when the "
        "ventricles contract. The pulmonary and aortic valves are semilunar valves.\n\n"
        "Septum. The interventricular septum is a thick muscular wall that separates the right "
        "and left ventricles, so oxygenated and deoxygenated blood do not mix.\n\n"
        "Orientation. Anatomical diagrams are drawn as if you are facing the patient. The "
        "patient's left side therefore appears on the right of the page.\n\n"
        "Pathway of blood. Body -> venae cavae -> right atrium -> tricuspid valve -> right "
        "ventricle -> pulmonary valve -> pulmonary artery -> lungs -> pulmonary veins -> left "
        "atrium -> mitral valve -> left ventricle -> aortic valve -> aorta -> body."
    )
    notes.insert_textbox(fitz.Rect(60, 100, 535, 800), body, fontsize=10.5, color=INK, lineheight=1.4)

    doc.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
