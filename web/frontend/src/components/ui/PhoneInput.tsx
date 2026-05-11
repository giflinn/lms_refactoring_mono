import "react-international-phone/style.css";
import {
  PhoneInput as RIPhoneInput,
  defaultCountries,
  parseCountry,
} from "react-international-phone";
import type { CSSProperties } from "react";

// The lib defaults to a Twemoji PNG sprite. We swap to system emoji
// (Apple/Win/Noto) by handing each country an inline-SVG src whose <text>
// node falls back to the OS emoji font. Built once at module load.
function isoToFlagEmoji(iso2: string): string {
  const A = 0x1f1e6;
  const aChar = "a".charCodeAt(0);
  return iso2
    .toLowerCase()
    .split("")
    .map((c) => String.fromCodePoint(A + (c.charCodeAt(0) - aChar)))
    .join("");
}

function emojiSvgDataUrl(iso2: string): string {
  const emoji = isoToFlagEmoji(iso2);
  // viewBox 24x18 mirrors the rectangle proportions our CSS vars set; the
  // glyph is centered horizontally and pushed down a hair (y=14) to sit on
  // the baseline. font-family chain prefers the OS emoji font.
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 18'>` +
    `<text x='12' y='14' text-anchor='middle' font-size='16' ` +
    `font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">` +
    `${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const emojiFlags = defaultCountries.map((c) => {
  const { iso2 } = parseCountry(c);
  return { iso2, src: emojiSvgDataUrl(iso2) };
});

type Props = {
  label: string;
  // E.164 string (e.g. "+77081234567"). Empty string for blank field.
  value: string;
  onChange: (e164: string) => void;
  error?: string;
  disabled?: boolean;
};

// Match ui/Input.tsx chrome (h-9, rounded-[8px], grey border, purple focus,
// red on error). The lib draws its own internal flexbox of country button +
// input — we only override colors/sizing through CSS variables and shadow
// the focus ring with a focus-within outline on the wrapper.
const baseVars = {
  "--react-international-phone-height": "36px",
  "--react-international-phone-background-color": "#ffffff",
  "--react-international-phone-text-color": "#1f2937",
  "--react-international-phone-font-size": "14px",
  "--react-international-phone-border-radius": "8px",
  "--react-international-phone-border-color": "rgba(102,112,133,0.3)",
  // Square-ish to give the emoji glyph room — the SVG renders the flag
  // emoji centered, so cropped landscape sizing chops the glyph.
  "--react-international-phone-flag-width": "20px",
  "--react-international-phone-flag-height": "20px",
  "--react-international-phone-country-selector-arrow-color": "rgba(102,112,133,0.6)",
  "--react-international-phone-country-selector-background-color-hover": "#f4f4f5",
  width: "100%",
} as CSSProperties;

const errorVars = {
  ...baseVars,
  "--react-international-phone-border-color": "#ef4444",
} as CSSProperties;

const disabledVars = {
  ...baseVars,
  "--react-international-phone-background-color": "rgb(245,245,245)",
  "--react-international-phone-disabled-background-color": "rgb(245,245,245)",
  "--react-international-phone-disabled-text-color": "rgba(102,112,133,0.7)",
  "--react-international-phone-border-color": "rgba(102,112,133,0.2)",
} as CSSProperties;

export function PhoneInput({
  label,
  value,
  onChange,
  error,
  disabled,
}: Props) {
  return (
    <label className="flex w-full flex-col gap-1">
      {label && (
        <span className="py-1 text-[14px] font-medium text-grey-dark">
          {label}
        </span>
      )}
      <RIPhoneInput
        defaultCountry="kz"
        value={value}
        onChange={onChange}
        disabled={disabled}
        flags={emojiFlags}
        // Always render the dial code (e.g. "+7") in the input so the user
        // never types the prefix themselves — eliminates the "+7+244..."
        // duplication failure mode.
        forceDialCode
        style={disabled ? disabledVars : error ? errorVars : baseVars}
      />
      {error && (
        <span className="text-[12px] leading-tight text-red-500">{error}</span>
      )}
    </label>
  );
}
