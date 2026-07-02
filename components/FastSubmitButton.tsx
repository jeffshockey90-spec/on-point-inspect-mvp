"use client";

import { useFormStatus } from "react-dom";

type FastSubmitButtonProps = {
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
};

export default function FastSubmitButton({
  children,
  loadingText = "Working...",
  className = "",
  disabled = false,
  name,
  value,
}: FastSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={isDisabled}
      aria-busy={pending}
      data-fast-click="true"
      className={`${className} inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl transition duration-150 active:scale-[0.98] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-70 [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`}
    >
      {pending ? (
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      <span>{pending ? loadingText : children}</span>
    </button>
  );
}
