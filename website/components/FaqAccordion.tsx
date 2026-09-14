"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

export interface FaqItem {
  question: string;
  answer: string;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={item.question}
            className={`overflow-hidden rounded-2xl border transition ${
              isOpen
                ? "border-brand-200 bg-white shadow-card"
                : "border-ink-100 bg-white hover:border-ink-200"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              // Form-filler / grammar browser extensions inject attributes
              // (e.g. fdprocessedid) onto controls before React hydrates.
              suppressHydrationWarning
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
            >
              <span className="font-display text-sm font-semibold text-ink-950 sm:text-base">
                {item.question}
              </span>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition duration-300 ${
                  isOpen
                    ? "rotate-45 bg-brand-500 text-white"
                    : "bg-ink-50 text-ink-500"
                }`}
              >
                <Plus size={15} />
              </span>
            </button>

            <div
              className={`grid transition-all duration-300 ease-out ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-ink-500 sm:px-6 sm:pb-6">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
