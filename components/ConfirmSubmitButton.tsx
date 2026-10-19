"use client";

import type { ReactNode } from "react";
import { flowConfirm } from "./ConfirmProvider";

// Drop-in submit button for a <form action={serverAction}> that should
// confirm before firing a destructive server action.
export default function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
}: {
  confirmMessage: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        const form = e.currentTarget.form;
        flowConfirm(confirmMessage).then((ok) => {
          if (ok) form?.requestSubmit();
        });
      }}
    >
      {children}
    </button>
  );
}
