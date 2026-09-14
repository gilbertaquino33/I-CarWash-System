export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 ${className}`}
    >
      {/* Camera aperture + water droplet: computer vision meets car care. */}
      <svg viewBox="0 0 24 24" fill="none" className="h-[62%] w-[62%] text-white">
        <circle cx="12" cy="12" r="7.2" stroke="currentColor" strokeWidth="1.7" opacity="0.55" />
        <path
          d="M12 6.4c2.1 2.6 3.3 4.4 3.3 5.9a3.3 3.3 0 1 1-6.6 0c0-1.5 1.2-3.3 3.3-5.9z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

export function Logo({
  className = "",
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span
          className={`font-display text-[17px] font-bold tracking-tight ${
            tone === "light" ? "text-white" : "text-ink-950"
          }`}
        >
          I-CarWash
        </span>
        <span
          className={`mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] ${
            tone === "light" ? "text-white/60" : "text-ink-400"
          }`}
        >
          Smart Monitoring
        </span>
      </span>
    </span>
  );
}
