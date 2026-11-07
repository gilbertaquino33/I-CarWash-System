import Image from "next/image";

// Top banner for the public list pages (Services, Shops): a cover photo with a
// soft dark overlay so the white text stays readable.
export function PageHero({
  eyebrow,
  title,
  description,
  image,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-ink-100 bg-ink-900">
      <Image src={image} alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950/80 via-ink-950/55 to-ink-950/20" />

      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur">
          {eyebrow}
        </span>
        <h1 className="mt-6 max-w-2xl font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-white/80">{description}</p>
        {children}
      </div>
    </section>
  );
}
