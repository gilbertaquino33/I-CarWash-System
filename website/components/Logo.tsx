import Image from "next/image";
import logo from "@/app/logo.png";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ${className}`}
    >
      <Image src={logo} alt="I-CarWash logo" fill sizes="48px" className="object-contain" priority />
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
