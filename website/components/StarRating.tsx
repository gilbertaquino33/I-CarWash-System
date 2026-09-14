import { Star } from "lucide-react";

export function StarRating({
  rating,
  size = 15,
}: {
  rating: number;
  size?: number;
}) {
  const rounded = Math.round(rating);
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={
            i < rounded
              ? "fill-brand-500 text-brand-500"
              : "fill-ink-100 text-ink-100"
          }
        />
      ))}
    </span>
  );
}
