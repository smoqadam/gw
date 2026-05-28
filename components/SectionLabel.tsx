export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <span className="font-ui text-xs font-semibold uppercase tracking-[0.16em] text-accent">
        {children}
      </span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
