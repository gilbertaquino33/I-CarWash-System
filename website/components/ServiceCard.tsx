import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function ServiceCard({
  href,
  title,
  description,
  image,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  image: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white transition duration-300 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-lift"
    >
      <div className="relative h-52 w-full overflow-hidden">
        <Image
          src={image}
          alt={title}
          fill
          sizes="(min-width: 1024px) 33vw, 100vw"
          className="object-cover transition duration-500 group-hover:scale-[1.07]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/55 via-transparent to-transparent" />
        {badge && (
          <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-ink-900 backdrop-blur">
            {badge}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-display text-lg font-semibold text-ink-950">{title}</h3>
        <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-500">
          {description}
        </p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
          Learn more
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}
