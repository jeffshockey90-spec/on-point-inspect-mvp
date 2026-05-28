"use client";

export default function ReportFindingsSortable({
  groupedFindings,
}: any) {
  return (
    <div className="space-y-6">
      {(groupedFindings || []).map((group: any) => (
        <section
          key={group.section}
          className="rounded-2xl border border-slate-700 bg-[#0f172a] overflow-hidden"
        >
          <div className="border-b border-slate-700 px-6 py-4">
            <h2 className="text-2xl font-bold text-teal-400">
              {group.section}
            </h2>
          </div>

          <div className="space-y-5 p-5">
            {(group.findings || []).length === 0 && (
              <div className="text-slate-400">
                No findings added yet.
              </div>
            )}

            {(group.findings || []).map((finding: any) => (
              <article
                key={finding.id}
                className="rounded-2xl border border-slate-700 bg-[#071224] overflow-hidden"
              >
                {finding.image_url && (
                  <img
                    src={finding.image_url}
                    alt="Finding"
                    className="w-full max-h-[500px] object-contain bg-black"
                  />
                )}

                <div className="p-5">
                  <div className="mb-3">
                    <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-300">
                      {finding.severity || "Recommended Repair"}
                    </span>
                  </div>

                  <h3 className="text-2xl font-black text-white mb-4">
                    {finding.title || "Untitled Finding"}
                  </h3>

                  {finding.observation && (
                    <div className="mb-4">
                      <h4 className="font-bold text-teal-300 mb-2">
                        Observation
                      </h4>

                      <p className="text-slate-200 whitespace-pre-wrap">
                        {finding.observation}
                      </p>
                    </div>
                  )}

                  {finding.implication && (
                    <div className="mb-4">
                      <h4 className="font-bold text-yellow-300 mb-2">
                        Implication
                      </h4>

                      <p className="text-slate-200 whitespace-pre-wrap">
                        {finding.implication}
                      </p>
                    </div>
                  )}

                  {finding.recommendation && (
                    <div>
                      <h4 className="font-bold text-red-300 mb-2">
                        Recommendation
                      </h4>

                      <p className="text-slate-200 whitespace-pre-wrap">
                        {finding.recommendation}
                      </p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
