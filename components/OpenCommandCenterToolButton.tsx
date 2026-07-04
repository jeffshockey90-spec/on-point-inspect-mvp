"use client";

import type { ReactNode } from "react";

export default function OpenCommandCenterToolButton({
  toolTitle,
  className = "",
  children,
}: {
  toolTitle: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("opi:open-command-center-tool", {
            detail: { title: toolTitle },
          })
        );
      }}
      className={className}
    >
      {children}
    </button>
  );
}
