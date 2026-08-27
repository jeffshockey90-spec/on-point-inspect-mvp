"use client";

import { useId } from "react";

type SettingsToggleProps = {
  name?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
};

export default function SettingsToggle({
  name,
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  id,
  ariaLabel,
  className = "",
}: SettingsToggleProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const controlled = typeof checked === "boolean";

  return (
    <span className={`inline-flex shrink-0 ${className}`}>
      <input
        id={inputId}
        name={name}
        type="checkbox"
        checked={controlled ? checked : undefined}
        defaultChecked={!controlled ? defaultChecked : undefined}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange?.(event.target.checked)}
        className="peer sr-only"
      />

      <label
        htmlFor={inputId}
        className="relative block h-7 w-12 cursor-pointer rounded-full border border-[#232b38] bg-[#1a212c] transition duration-200 after:absolute after:left-1 after:top-1 after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 after:content-[''] peer-checked:border-teal-300 peer-checked:bg-teal-500 peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-300 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
      />
    </span>
  );
}
