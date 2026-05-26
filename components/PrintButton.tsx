"use client";

type PrintButtonProps = {
  label?: string;
  className?: string;
};

export default function PrintButton({
  label = "Print / Save PDF",
  className = "",
}: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={className}
    >
      {label}
    </button>
  );
}