"use client";

import { useState } from "react";

interface Props {
  imageUrl: string;
  reportId?: string;
}

export default function AIFindingSuggestions({
  imageUrl,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [finding, setFinding] = useState<any>(null);

  async function analyzeImage() {
    try {
      setLoading(true);

      const res = await fetch("/api/ai-suggest-finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl,
        }),
      });

      const data = await res.json();

      setFinding(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-teal-700 bg-[#131923] p-4">
      <button
        onClick={analyzeImage}
        className="rounded-xl bg-teal-600 px-4 py-2 text-white hover:bg-teal-500"
      >
        {loading ? "Analyzing..." : "AI Suggest Finding"}
      </button>

      {finding && (
        <div className="mt-4 space-y-3 text-sm text-[#e8ecf3]">
          <div>
            <strong>Section:</strong> {finding.section}
          </div>

          <div>
            <strong>Title:</strong> {finding.title}
          </div>

          <div>
            <strong>Severity:</strong> {finding.severity}
          </div>

          <div>
            <strong>Observation:</strong> {finding.observation}
          </div>

          <div>
            <strong>Implication:</strong> {finding.implication}
          </div>

          <div>
            <strong>Recommendation:</strong> {finding.recommendation}
          </div>
        </div>
      )}
    </div>
  );
}
