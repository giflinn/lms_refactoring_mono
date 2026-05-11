import "react-international-phone/style.css";
import { PhoneInput as RIPhoneInput } from "react-international-phone";
import type { CSSProperties } from "react";

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
  "--react-international-phone-flag-width": "20px",
  "--react-international-phone-flag-height": "14px",
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
