"use client";

import { useEffect, useState } from "react";

type Props = {
  title: string;
  observation: string;
  inspectorId: string;
  onUseTemplate: (template: any) => void;
};

export default function AITemplateSuggestions({
  title,
  observation,
  inspectorId,
  onUseTemplate,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    if (!title && !observation) return;

    const timeout = setTimeout(() => {
      findMatches();
    }, 1200);

    return () => clearTimeout(timeout);
  }, [title, observation]);

  async function findMatches() {
    try {
      setLoading(true);

      const res = await fetch(
        "/api/ai-template-match",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            title,
            observation,
            inspectorId,
          }),
        }
      );

      const data = await res.json();

      setMatches(data.matches || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (!title && !observation) return null;

  return (
    <div className="mt-5 rounded-2xl border border-cyan-700 bg-cyan-950/20 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-cyan-300">
            AI Template Suggestions
          </h3>

          <p className="mt-1 text-sm text-[#8a93a3]">
            AI searched your reusable findings library for matching narratives.
          </p>
        </div>

        {loading && (
          <p className="text-sm text-cyan-300">
            Searching...
          </p>
        )}
      </div>

      {!loading && matches.length === 0 && (
        <div className="rounded-xl border border-[#232b38] bg-[#131923] p-4 text-sm text-[#8a93a3]">
          No close template matches found yet.
        </div>
      )}

      <div className="space-y-3">
        {matches.map((match, index) => (
          <div
            key={index}
            className="rounded-xl border border-[#232b38] bg-[#131923] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-bold text-white">
                  {match.title}
                </h4>

                <p className="mt-1 text-sm text-[#8a93a3]">
                  {match.section} • {match.severity}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  onUseTemplate(match)
                }
                className="rounded-xl bg-cyan-500 px-4 py-2 font-bold text-black hover:bg-cyan-400"
              >
                Use Template
              </button>
            </div>

            {match.observation && (
              <p className="mt-3 text-sm text-[#8a93a3]">
                {match.observation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
