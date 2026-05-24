"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function CommentLibrary({
  onUseComment,
}: {
  onUseComment: (comment: any) => void;
}) {
  const [comments, setComments] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadComments();
  }, []);

  async function loadComments() {
    const { data, error } = await supabase
      .from("comment_library")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setComments(data || []);
  }

  const filtered = comments.filter((comment) => {
    const text = `
      ${comment.title || ""}
      ${comment.section || ""}
      ${comment.severity || ""}
      ${comment.observation || ""}
      ${comment.implication || ""}
      ${comment.recommendation || ""}
      ${comment.tags || ""}
    `.toLowerCase();

    return text.includes(search.toLowerCase());
  });

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#0f172a] p-5">
      <h2 className="mb-3 text-2xl font-bold text-teal-400">
        Comment Library
      </h2>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search saved comments..."
        className="mb-4 w-full rounded-xl border border-slate-700 bg-black p-3 text-white"
      />

      {filtered.length === 0 ? (
        <p className="text-slate-400">No saved comments yet.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((comment) => (
            <div
              key={comment.id}
              className="rounded-xl border border-slate-700 bg-black p-4"
            >
              <p className="font-bold text-white">{comment.title}</p>

              <p className="mt-1 text-sm text-slate-400">
                {comment.section} • {comment.severity}
              </p>

              <button
                onClick={() => onUseComment(comment)}
                className="mt-3 rounded-lg bg-teal-500 px-4 py-2 text-sm font-bold text-black hover:bg-teal-400"
              >
                Use Comment
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}