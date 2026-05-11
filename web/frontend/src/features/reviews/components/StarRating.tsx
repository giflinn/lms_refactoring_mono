import clsx from "clsx";
import { Star } from "lucide-react";

type Props = {
  rating: number;
  size?: number;
  className?: string;
};

export function StarRating({ rating, size = 16, className }: Props) {
  const clamped = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className={clsx("flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= clamped;
        return (
          <Star
            key={i}
            size={size}
            strokeWidth={1.5}
            className={
              filled
                ? "fill-[#FFB800] text-[#FFB800]"
                : "fill-transparent text-[#D0D5DD]"
            }
          />
        );
      })}
    </div>
  );
}
