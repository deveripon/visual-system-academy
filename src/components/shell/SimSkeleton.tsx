export function SimSkeleton() {
  return (
    <div className="relative z-10 grid h-full place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-10 w-10">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--mode-user)] opacity-30" />
          <span className="absolute inset-[30%] rounded-full bg-[var(--mode-user)]" />
        </div>
        <p className="instrument-label">booting simulator…</p>
      </div>
    </div>
  );
}
