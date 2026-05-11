import { useState } from "react";
import clsx from "clsx";

type Props = {
  src?: string | null;
  firstName?: string;
  lastName?: string;
  email?: string;
  size?: number;
  className?: string;
};

function initialsFor(firstName?: string, lastName?: string, email?: string): string {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  if (f || l) {
    return ((f[0] ?? "") + (l[0] ?? "")).toUpperCase() || "?";
  }
  const e = (email ?? "").trim();
  return e ? e[0].toUpperCase() : "?";
}

export function Avatar({ src, firstName, lastName, email, size = 60, className }: Props) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  const apiBase = import.meta.env.VITE_API_URL as string;
  const resolvedSrc =
    src && src.startsWith("/") ? `${apiBase}${src}` : (src ?? undefined);

  if (showImage) {
    return (
      <img
        src={resolvedSrc}
        width={size}
        height={size}
        alt=""
        onError={() => setErrored(true)}
        className={clsx("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full bg-purple-tertiary text-white font-semibold",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initialsFor(firstName, lastName, email)}
    </div>
  );
}
