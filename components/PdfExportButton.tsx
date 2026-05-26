"use client";

type PDFExportButtonProps = {
  label?: string;
  className?: string;
};

export default function PDFExportButton({
  label = "Export PDF",
  className = "",
}: PDFExportButtonProps) {
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