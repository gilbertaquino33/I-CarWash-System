import Image from "next/image";
import logo from "@/app/logo.png";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ${className}`}
    >
      {/* Fixed width/height (not `fill`): if the stylesheet ever fails to
          load, the logo stays small instead of covering the whole page. */}
      <Image
        src={logo}
        alt="I-CarWash logo"
        width={96}
        height={96}
        sizes="48px"
        className="h-full w-full object-contain"
        style={{ maxWidth: 64, maxHeight: 64 }}
        priority
      />
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
