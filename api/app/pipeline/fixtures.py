"""Demo-mode content for the sample heart lecture.

Used when no GROQ_API_KEY is configured (or the AI call fails and DEMO_MODE=1),
so the full journey can be demonstrated offline. One structure is deliberately
`inferred_from_text` so the teacher-review step has something real to resolve.
"""
from __future__ import annotations

from ..sample_layout import normalised_bbox
from ..schemas import DiagramContent

_S = [
    dict(
        id="right_atrium", name="Right atrium",
        location="Upper chamber on the patient's right side. On the page it is at the upper left.",
        function="Receives deoxygenated blood returning from the body.",
        adjacent_to=["left_atrium", "right_ventricle", "superior_vena_cava"],
        connections=[
            {"to": "superior_vena_cava", "direction": "in"},
            {"to": "inferior_vena_cava", "direction": "in"},
            {"to": "right_ventricle", "via": "tricuspid_valve", "direction": "out"},
        ],
        source_quote="The right atrium receives deoxygenated blood from the body through the superior and inferior venae cavae.",
    ),
    dict(
        id="right_ventricle", name="Right ventricle",
        location="Lower chamber on the patient's right side, directly below the right atrium. On the page it is at the lower left.",
        function="Pumps deoxygenated blood into the pulmonary artery, towards the lungs.",
        adjacent_to=["right_atrium", "interventricular_septum", "left_ventricle"],
        connections=[
            {"to": "right_atrium", "via": "tricuspid_valve", "direction": "in"},
            {"to": "pulmonary_artery", "via": "pulmonary_valve", "direction": "out"},
        ],
        source_quote="The right ventricle pumps this blood through the pulmonary valve into the pulmonary artery.",
    ),
    dict(
        id="left_atrium", name="Left atrium",
        location="Upper chamber on the patient's left side. On the page it is at the upper right.",
        function="Receives oxygenated blood returning from the lungs.",
        adjacent_to=["right_atrium", "left_ventricle", "pulmonary_veins"],
        connections=[
            {"to": "pulmonary_veins", "direction": "in"},
            {"to": "left_ventricle", "via": "mitral_valve", "direction": "out"},
        ],
        source_quote="The left atrium receives oxygenated blood from the lungs through the pulmonary veins.",
    ),
    dict(
        id="left_ventricle", name="Left ventricle",
        location="Lower chamber on the patient's left side, below the left atrium. It forms the pointed tip (apex) of the heart. On the page it is at the lower right.",
        function="Pumps oxygenated blood into the aorta and on to the whole body. It has the thickest muscular wall.",
        adjacent_to=["left_atrium", "interventricular_septum", "right_ventricle"],
        connections=[
            {"to": "left_atrium", "via": "mitral_valve", "direction": "in"},
            {"to": "aorta", "via": "aortic_valve", "direction": "out"},
        ],
        source_quote="The left ventricle has the thickest muscular wall because it pumps blood through the aortic valve into the aorta.",
    ),
    dict(
        id="superior_vena_cava", name="Superior vena cava",
        location="Large vein entering the top of the right atrium.",
        function="Returns deoxygenated blood from the head, neck and arms.",
        adjacent_to=["right_atrium", "pulmonary_artery"],
        connections=[{"to": "right_atrium", "direction": "out"}],
    ),
    dict(
        id="inferior_vena_cava", name="Inferior vena cava",
        location="Large vein entering the right atrium from below. On the page it is at the far left edge.",
        function="Returns deoxygenated blood from the lower body.",
        adjacent_to=["right_atrium"],
        connections=[{"to": "right_atrium", "direction": "out"}],
    ),
    dict(
        id="pulmonary_artery", name="Pulmonary artery",
        location="Vessel rising from the top of the right ventricle, near the centre of the diagram, just to the page-left of the aorta.",
        function="Carries deoxygenated blood from the right ventricle to the lungs.",
        adjacent_to=["aorta", "superior_vena_cava", "pulmonary_valve"],
        connections=[{"to": "right_ventricle", "via": "pulmonary_valve", "direction": "in"}],
    ),
    dict(
        id="pulmonary_veins", name="Pulmonary veins",
        location="Vessels entering the left atrium from the side. On the page they are at the far right edge.",
        function="Carry oxygenated blood from the lungs back to the left atrium.",
        adjacent_to=["left_atrium"],
        connections=[{"to": "left_atrium", "direction": "out"}],
    ),
    dict(
        id="aorta", name="Aorta",
        location="Large artery rising from the top of the left ventricle, near the centre of the diagram.",
        function="Carries oxygenated blood from the left ventricle to the whole body.",
        adjacent_to=["pulmonary_artery", "left_atrium", "aortic_valve"],
        connections=[{"to": "left_ventricle", "via": "aortic_valve", "direction": "in"}],
    ),
    dict(
        id="tricuspid_valve", name="Tricuspid valve",
        location="Between the right atrium and the right ventricle.",
        function="Lets blood flow from the right atrium into the right ventricle and stops it flowing back.",
        adjacent_to=["right_atrium", "right_ventricle"],
        source_quote="The tricuspid valve lies between the right atrium and right ventricle.",
    ),
    dict(
        id="mitral_valve", name="Mitral valve",
        location="Between the left atrium and the left ventricle.",
        function="Lets blood flow from the left atrium into the left ventricle and stops it flowing back. Also called the bicuspid valve.",
        adjacent_to=["left_atrium", "left_ventricle"],
        source_quote="The mitral (bicuspid) valve lies between the left atrium and left ventricle.",
    ),
    dict(
        id="pulmonary_valve", name="Pulmonary valve",
        location="At the exit of the right ventricle, where the pulmonary artery begins.",
        function="Opens to let blood leave the right ventricle for the lungs and closes to stop it flowing back.",
        adjacent_to=["right_ventricle", "pulmonary_artery"],
    ),
    dict(
        id="aortic_valve", name="Aortic valve",
        location="At the exit of the left ventricle, where the aorta begins.",
        function="Opens to let blood leave the left ventricle for the body and closes to stop it flowing back.",
        adjacent_to=["left_ventricle", "aorta"],
    ),
    dict(
        id="interventricular_septum", name="Interventricular septum",
        location="Thick muscular wall running down the middle, between the two ventricles.",
        function="Separates the right and left ventricles so oxygenated and deoxygenated blood do not mix.",
        adjacent_to=["right_ventricle", "left_ventricle"],
        source_quote="The interventricular septum is a thick muscular wall that separates the right and left ventricles.",
    ),
    dict(
        id="chordae_tendineae", name="Chordae tendineae",
        evidence="inferred_from_text", confidence="low",
        location="Not shown in this diagram. The lecture notes say they anchor the atrioventricular valves to the ventricle walls.",
        function="Stop the tricuspid and mitral valve flaps turning inside out when the ventricles contract.",
        adjacent_to=["tricuspid_valve", "mitral_valve"],
        source_quote="The atrioventricular valves are anchored to the ventricle walls by the chordae tendineae.",
    ),
]

_PROCESS_STEPS = [
    ("Deoxygenated blood from the body enters the right atrium through the superior and inferior venae cavae.", ["superior_vena_cava", "inferior_vena_cava", "right_atrium"]),
    ("The right atrium contracts and blood passes through the tricuspid valve.", ["right_atrium", "tricuspid_valve"]),
    ("Blood fills the right ventricle.", ["right_ventricle"]),
    ("The right ventricle contracts, pushing blood through the pulmonary valve.", ["right_ventricle", "pulmonary_valve"]),
    ("The pulmonary artery carries the blood to the lungs, where it picks up oxygen.", ["pulmonary_artery"]),
    ("Oxygenated blood returns from the lungs through the pulmonary veins into the left atrium.", ["pulmonary_veins", "left_atrium"]),
    ("The left atrium contracts and blood passes through the mitral valve.", ["left_atrium", "mitral_valve"]),
    ("Blood fills the left ventricle.", ["left_ventricle"]),
    ("The left ventricle contracts strongly, pushing blood through the aortic valve.", ["left_ventricle", "aortic_valve"]),
    ("The aorta carries oxygenated blood out to the whole body.", ["aorta"]),
]

_QUIZ = [
    dict(id="q1", question="Which chamber pumps oxygenated blood into the aorta?",
         options=["Right atrium", "Right ventricle", "Left atrium", "Left ventricle"], answer=3,
         explanation="The left ventricle pumps oxygenated blood through the aortic valve into the aorta.",
         structure_ids=["left_ventricle", "aorta"]),
    dict(id="q2", question="Which valve lies between the left atrium and the left ventricle?",
         options=["Tricuspid valve", "Mitral valve", "Pulmonary valve", "Aortic valve"], answer=1,
         explanation="The mitral, or bicuspid, valve separates the left atrium from the left ventricle.",
         structure_ids=["mitral_valve"]),
    dict(id="q3", question="Where does the pulmonary artery carry blood?",
         options=["To the lungs", "To the whole body", "Into the left atrium", "Into the right atrium"], answer=0,
         explanation="The pulmonary artery carries deoxygenated blood from the right ventricle to the lungs.",
         structure_ids=["pulmonary_artery"]),
    dict(id="q4", question="On a standard anatomical diagram, which side of the page shows the patient's left ventricle?",
         options=["The left side of the page", "The right side of the page"], answer=1,
         explanation="Diagrams are drawn as if you face the patient, so the patient's left appears on the right of the page.",
         structure_ids=["left_ventricle"]),
    dict(id="q5", question="What separates the right and left ventricles?",
         options=["The aorta", "The chordae tendineae", "The interventricular septum", "The pulmonary veins"], answer=2,
         explanation="The interventricular septum is the muscular wall between the two ventricles.",
         structure_ids=["interventricular_septum"]),
]

HEART_LABELS = [
    "Right atrium", "Left atrium", "Right ventricle", "Left ventricle", "Superior vena cava",
    "Pulmonary artery", "Aorta", "Pulmonary veins", "Inferior vena cava", "Tricuspid valve",
    "Mitral valve", "Pulmonary valve", "Aortic valve", "Interventricular septum",
]


def heart_fixture() -> DiagramContent:
    structures = []
    for s in _S:
        s = {"evidence": "labelled", "confidence": "high", **s}
        s["bbox"] = normalised_bbox(s["id"])
        structures.append(s)
    return DiagramContent.model_validate(
        dict(
            title="The Human Heart",
            overview=(
                "A schematic front view of the human heart. It shows the four chambers, two upper atria "
                "and two lower ventricles, the four valves between and above them, and the large blood "
                "vessels at the top. The right side of the heart is coloured blue for deoxygenated blood "
                "and the left side red for oxygenated blood. Arrows show blood flowing down through each "
                "side and up out of the ventricles."
            ),
            orientation_note=(
                "This diagram is drawn as if you are facing the patient. The patient's right side, the "
                "blue deoxygenated side, appears on the left of the page."
            ),
            visible_labels=HEART_LABELS,
            structures=structures,
            processes=[
                dict(id="circulation", name="Path of blood through the heart",
                     steps=[{"text": t, "structure_ids": ids} for t, ids in _PROCESS_STEPS]),
            ],
            quiz=_QUIZ,
            generated_by="demo-fixture",
        )
    )


def looks_like_heart(labels: list[str], text: str) -> bool:
    hay = (" ".join(labels) + " " + text).lower()
    hits = sum(1 for k in ("atrium", "ventricle", "aorta", "vena cava", "mitral", "tricuspid") if k in hay)
    return hits >= 3
