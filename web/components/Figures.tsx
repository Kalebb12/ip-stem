"use client";
import layout from "@/lib/heart-layout.json";
import type { DiagramContent } from "@/lib/types";

const [, , FW, FH] = layout.frame as number[];
const SHAPES = layout.shapes as Record<string, number[]>;
const BLUE = new Set(["superior_vena_cava", "inferior_vena_cava", "pulmonary_artery", "right_atrium", "right_ventricle"]);
const VALVES = new Set(["tricuspid_valve", "mitral_valve", "pulmonary_valve", "aortic_valve"]);
const SHORT: Record<string, string> = {
  right_atrium: "RA", left_atrium: "LA", right_ventricle: "RV", left_ventricle: "LV",
};

/** Vector heart used on the landing page. Decorative twin of the text explorer. */
export function HeartSchematic({ highlight, onSelect, names }: { highlight: string[]; onSelect: (id: string) => void; names: Record<string, string> }) {
  const order = Object.keys(SHAPES).sort((a, b) => Number(VALVES.has(a)) - Number(VALVES.has(b)));
  return (
    <figure className="schematic" style={{ margin: 0 }}>
      <svg viewBox={`-4 -4 ${FW + 8} ${FH + 8}`} role="img" aria-label="Schematic heart. Its parts are listed in the explorer next to it.">
        {order.map((id) => {
          const [x, y, w, h] = SHAPES[id];
          const on = highlight.includes(id);
          const fill = VALVES.has(id) ? "var(--ink)" : id === "interventricular_septum" ? "var(--ink-2)" : BLUE.has(id) ? "var(--venous)" : "var(--arterial)";
          const soft = !VALVES.has(id) && id !== "interventricular_septum" && ["right_atrium", "right_ventricle", "left_atrium", "left_ventricle"].includes(id);
          return (
            <g key={id} onClick={() => onSelect(id)} style={{ cursor: "pointer" }}>
              <title>{names[id] ?? id}</title>
              <rect x={x} y={y} width={w} height={h} rx={VALVES.has(id) ? 3 : 10}
                fill={soft ? (BLUE.has(id) ? "var(--venous-soft)" : "var(--arterial-soft)") : fill}
                stroke={on ? "var(--ink)" : soft ? fill : "none"} strokeWidth={on ? 6 : 2.5} />
              {on && <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx={14} fill="none" stroke="var(--focus)" strokeWidth={5} />}
              {SHORT[id] && <text x={x + w / 2} y={y + h / 2 + 9} textAnchor="middle" fontSize="26" fontWeight="800" fill={BLUE.has(id) ? "var(--venous)" : "var(--arterial)"}>{SHORT[id]}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="small muted" style={{ marginTop: "0.5rem" }}>
        Facing the patient: their right side (blue, deoxygenated) is on the left of the picture.
      </figcaption>
    </figure>
  );
}

/** The real uploaded diagram, with highlight boxes drawn from each structure's bbox. */
export function DiagramFigure({ src, content, highlight, caption }: { src: string; content: DiagramContent; highlight: string[]; caption?: string }) {
  const boxes = content.structures.filter((s) => highlight.includes(s.id) && s.bbox && s.bbox.length === 4);
  const names = boxes.map((b) => b.name).join(", ");
  return (
    <figure style={{ margin: 0 }}>
      <div className="figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${content.title || "Diagram"}. The full description is in the explorer.`} />
        {boxes.map((s) => (
          <span key={s.id} className="hl" style={{ left: `${s.bbox![0] * 100}%`, top: `${s.bbox![1] * 100}%`, width: `${s.bbox![2] * 100}%`, height: `${s.bbox![3] * 100}%` }} />
        ))}
      </div>
      <figcaption className="small muted" style={{ marginTop: "0.5rem" }}>
        {caption}
        {names && <><br /><strong>Highlighted:</strong> {names}</>}
      </figcaption>
    </figure>
  );
}
