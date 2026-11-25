"""Step 1-2: document extraction and diagram detection (PyMuPDF)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf as fitz

MIN_IMAGE_PX = 200
MIN_DRAWINGS = 15


@dataclass
class FoundDiagram:
    page: int
    image_path: Path
    caption: str = ""
    page_text: str = ""
    labels: list[str] = field(default_factory=list)


@dataclass
class Extraction:
    full_text: str
    diagrams: list[FoundDiagram]


CAPTION_RE = re.compile(r"^\s*(fig(ure)?\.?\s*\d+)", re.I)


def _caption(page: fitz.Page, below: fitz.Rect | None) -> str:
    blocks = page.get_text("blocks")
    caps = [b for b in blocks if CAPTION_RE.match(b[4] or "")]
    if below is not None:
        caps.sort(key=lambda b: abs(b[1] - below.y1))
    return " ".join(caps[0][4].split()) if caps else ""


def _labels_in(page: fitz.Page, clip: fitz.Rect) -> list[str]:
    """Text physically inside the figure = its labels (digital PDFs only).

    Spans on one line that are far apart are separate labels; a block whose
    lines each hold one fragment is a single wrapped label ("Superior / vena cava").
    """
    by_line: dict[tuple[int, int], list[tuple[float, float, float, str]]] = {}
    for x0, y0, x1, _y1, word, bno, lno, _wno in page.get_text("words", clip=clip):
        by_line.setdefault((bno, lno), []).append((x0, x1, y0, word))
    # fragments: [x0, y0, text]; words closer than 8pt belong together
    frags: list[list] = []
    for _key, words in sorted(by_line.items()):
        words.sort()
        last_x1 = None
        for x0, x1, y0, word in words:
            if last_x1 is not None and x0 - last_x1 < 8:
                frags[-1][2] += " " + word
            else:
                frags.append([x0, y0, word])
            last_x1 = x1
    # a fragment directly under another, left-aligned, continues it ("Superior" / "vena cava")
    frags.sort(key=lambda f: (f[1], f[0]))
    merged: list[list] = []
    for f in frags:
        prev = next((m for m in reversed(merged) if abs(m[0] - f[0]) < 6 and 0 < f[1] - m[3] < 13), None)
        if prev:
            prev[2] += " " + f[2]
            prev[3] = f[1]
        else:
            merged.append([f[0], f[1], f[2], f[1]])
    labels: list[str] = []
    for _x, _y, text, _last in merged:
        text = " ".join(text.split())
        if text and len(text) <= 60 and not CAPTION_RE.match(text):
            labels.append(text)
    return labels


def extract_pdf(path: Path, out_dir: Path) -> Extraction:
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(path)
    texts: list[str] = []
    diagrams: list[FoundDiagram] = []
    for pno, page in enumerate(doc, start=1):
        page_text = page.get_text("text")
        texts.append(f"[Page {pno}]\n{page_text.strip()}")

        # a) embedded raster images
        for img in page.get_images(full=True):
            xref = img[0]
            rects = page.get_image_rects(xref)
            pix = fitz.Pixmap(doc, xref)
            if pix.width < MIN_IMAGE_PX or pix.height < MIN_IMAGE_PX:
                continue
            if pix.n - pix.alpha >= 4:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            target = out_dir / f"p{pno}-x{xref}.png"
            pix.save(target)
            rect = rects[0] if rects else None
            diagrams.append(
                FoundDiagram(pno, target, _caption(page, rect), page_text,
                             _labels_in(page, rect) if rect else [])
            )

        # b) vector drawings (common for exported lecture slides / textbook figures)
        drawings = page.get_drawings()
        if len(drawings) >= MIN_DRAWINGS:
            rect = fitz.Rect()
            for d in drawings:
                rect |= d["rect"]
            rect = (rect + (-4, -4, 4, 4)) & page.rect
            if rect.width > 120 and rect.height > 120:
                target = out_dir / f"p{pno}-vector.png"
                page.get_pixmap(clip=rect, dpi=160).save(target)
                diagrams.append(
                    FoundDiagram(pno, target, _caption(page, rect), page_text, _labels_in(page, rect))
                )
    return Extraction("\n\n".join(texts), diagrams)


def extract_image(path: Path, out_dir: Path) -> Extraction:
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"upload{path.suffix.lower()}"
    if path.suffix.lower() not in (".png", ".jpg", ".jpeg"):
        pix = fitz.Pixmap(str(path))
        target = out_dir / "upload.png"
        pix.save(target)
    else:
        target.write_bytes(path.read_bytes())
    return Extraction("", [FoundDiagram(1, target)])
