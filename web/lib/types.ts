export type Evidence = "labelled" | "visible_unlabelled" | "inferred_from_text";
export type Confidence = "high" | "medium" | "low";

export interface Connection { to: string; via?: string | null; direction: "in" | "out" }
export interface Structure {
  id: string; name: string; evidence: Evidence; confidence: Confidence;
  location: string; function: string; adjacent_to: string[]; connections: Connection[];
  source_quote?: string | null; bbox?: number[] | null; flags?: string[]; reviewed?: boolean;
}
export interface ProcessStep { text: string; structure_ids: string[] }
export interface Process { id: string; name: string; steps: ProcessStep[] }
export interface QuizItem {
  id: string; question: string; options: string[]; answer: number; explanation: string;
  structure_ids: string[]; flags?: string[]; reviewed?: boolean;
}
export interface DiagramContent {
  title: string; overview: string; orientation_note: string; visible_labels: string[];
  structures: Structure[]; processes: Process[]; quiz: QuizItem[]; generated_by: string; ai_note?: string;
}
export interface User { id: number; name: string; email: string; role: "teacher" | "student"; institution: string; prefs: Partial<Prefs> }
export interface Prefs { textScale: number; contrast: "default" | "high" | "dark"; speechRate: number; verbosity: "brief" | "full"; reduceMotion: boolean; screenReader: boolean; listenLanguage: string }
export interface Progress { structures_viewed: string[]; steps_completed: number; best_score: number | null; quiz_total: number | null; last_opened_at?: string }
export interface Resource {
  id: number; title: string; subject: string; topic: string; audience: string; filename: string;
  status: "uploaded" | "processing" | "needs_review" | "approved" | "published" | "failed";
  progress_step: string; error: string; created_at: string; updated_at: string; published_at: string | null;
  teacher: string; unresolved_flags?: number; structure_count?: number; progress?: Progress;
}
export interface ResourceDetail extends Resource {
  diagrams: { id: number; page: number; caption: string; found_labels: string[]; has_content: boolean }[];
  history: { action: string; note: string; created_at: string }[];
  text_excerpt: string;
}
export interface LessonDiagram { id: number; page: number; caption: string; content: DiagramContent }
export interface Lesson {
  id: number; title: string; subject: string; topic: string; audience: string; teacher: string; status: string;
  published_at: string | null; lecture_text: string; diagrams: LessonDiagram[]; progress: Progress | null; preview: boolean;
}
export interface ChatMsg { role: "student" | "companion"; text: string; grounding?: string; cited_structure_ids?: string[] }
