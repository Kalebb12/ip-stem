export default function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 28 C 6 21, 2 15, 2 9.5 A 6.5 6.5 0 0 1 16 7 Z" fill="var(--venous)" />
      <path d="M16 28 C 26 21, 30 15, 30 9.5 A 6.5 6.5 0 0 0 16 7 Z" fill="var(--arterial)" />
      <circle cx="11" cy="14" r="1.7" fill="var(--surface)" /><circle cx="16" cy="18" r="1.7" fill="var(--surface)" /><circle cx="21" cy="14" r="1.7" fill="var(--surface)" />
    </svg>
  );
}
