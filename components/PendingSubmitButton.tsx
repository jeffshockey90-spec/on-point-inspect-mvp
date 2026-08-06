"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  // Optional confirm dialog shown before the form submits. If the user cancels,
  // submission is prevented.
  confirmMessage?: string;
  // Extra disable condition on top of the form's pending state.
  disabled?: boolean;
};

/**
 * A submit button for server-action <form>s that gives instant click feedback.
 * Uses useFormStatus() (so it MUST render inside the <form action={...}>) to
 * disable itself and show a spinner + pending label the moment the action is
 * in flight. This fixes the "top buttons feel dead/unresponsive" problem where
 * a server action round-trips for a second with no visible acknowledgement.
 */
export default function PendingSubmitButton({
  children,
  className = "",
  pendingLabel = "Working...",
  confirmMessage,
  disabled = false,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      data-fast-click="true"
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      className={`${className} ${
        pending ? "cursor-wait opacity-80" : ""
      } inline-flex items-center justify-center gap-2`}
    >
      {pending ? (
        <>
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
