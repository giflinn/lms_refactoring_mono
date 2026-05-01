import clsx from "clsx";
import coverDefault from "../../../assets/product-cover/cover-default.png";
import coverActive from "../../../assets/product-cover/cover-active.png";
import type { ProductCoverKind } from "../api";

type Props = {
  title: string;
  // Short caption shown under the title on the cover overlay (e.g. "23-24 Марта").
  subtitle: string;
  buttonText: string;
  categoryName: string | null;
  coverKind: ProductCoverKind;
  // Either a remote URL (existing product) or an object-URL (just-picked file).
  coverImageSrc: string | null;
  size?: number;
};

// Live preview of how the product card looks in the mobile app. Empty title
// keeps the preset illustration; the moment the admin types a title we swap
// to the active background and overlay the real values on top.
export function ProductPreviewCard({
  title,
  subtitle,
  buttonText,
  categoryName,
  coverKind,
  coverImageSrc,
  size = 312,
}: Props) {
  const hasTitle = title.trim().length > 0;
  const isCustomFull = coverKind === "custom_full" && coverImageSrc;
  const isCustomBg = coverKind === "custom_bg" && coverImageSrc;
  // Empty form (no title typed) → preset placeholder. Once typing starts, even
  // in 'preset' mode, we swap to the active illustration so the admin sees
  // real-looking content.
  const showOverlay = !isCustomFull && hasTitle;
  const bgSrc = isCustomBg
    ? coverImageSrc
    : isCustomFull
      ? coverImageSrc
      : hasTitle
        ? coverActive
        : coverDefault;

  const buttonLabel = buttonText.trim() || "Подробнее";
  const chipLabel = categoryName ?? "Категория";

  return (
    <div
      className="relative overflow-hidden rounded-[24px] border border-[rgba(102,112,133,0.3)] bg-white"
      style={{ width: size, height: size }}
    >
      <img
        src={bgSrc}
        alt=""
        className={clsx(
          "absolute inset-0 h-full w-full",
          isCustomBg || isCustomFull ? "object-cover" : "object-cover",
        )}
      />
      {showOverlay && (
        <>
          <div className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/10 px-3 py-1 text-[13px] font-medium text-white backdrop-blur-sm">
            {chipLabel}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-3">
            <div className="flex flex-col gap-1 text-white">
              <p
                className="text-[26px] font-medium leading-tight"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {title}
              </p>
              {subtitle.trim() && (
                <p className="text-[15px] leading-tight text-purple-tertiary">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled
              className="flex h-[42px] w-full items-center justify-center rounded-[12px] bg-gradient-to-b from-yellow-gradient-top to-yellow-gradient-bottom text-[14px] font-medium text-purple-gradient-bottom"
            >
              {buttonLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
