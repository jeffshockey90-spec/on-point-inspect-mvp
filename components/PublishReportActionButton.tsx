"use client";

import { useFormStatus } from "react-dom";

function SubmitButton({ published }: { published: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || published}
      aria-busy={pending}
      className={`min-w-[154px] rounded-xl px-5 py-3 font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 [touch-action:manipulation] ${
        published
          ? "bg-green-700 text-white"
          : "bg-green-500 text-slate-950 hover:bg-green-400"
      }`}
    >
      {pending
        ? "Publishing..."
        : published
          ? "Report Published"
          : "Publish Report"}
    </button>
  );
}

export default function PublishReportActionButton({
  action,
  inspectionId,
  published,
}: {
  action: (formData: FormData) => void | Promise<void>;
  inspectionId: string;
  published: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (published) {
          event.preventDefault();
          return;
        }

        const confirmed = window.confirm(
          "Publish this report and email it to all report recipients?",
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <SubmitButton published={published} />
    </form>
  );
}