const LABEL: Record<string, string> = {
  uploaded: "Uploaded", processing: "Processing", needs_review: "Needs review", approved: "Approved, not published",
  published: "Published", failed: "Processing failed",
};
export default function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{LABEL[status] ?? status}</span>;
}
