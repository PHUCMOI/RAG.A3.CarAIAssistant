export function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={{ flexShrink: 0, verticalAlign: 'middle' }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
