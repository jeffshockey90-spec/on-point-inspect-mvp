import { createClient } from "../../utils/supabase/server";

export default async function RepairRequestPage() {
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("repair_requests")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold text-teal-400">
          Repair Requests
        </h1>

        <p className="mt-2 text-slate-400">
          Buyer requested repairs and negotiation items.
        </p>

        <div className="mt-8 space-y-4">
          {requests && requests.length > 0 ? (
            requests.map((request) => (
              <div
                key={request.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">
                      Finding ID:
                    </h2>

                    <p className="text-sm text-slate-400">
                      {request.finding_id}
                    </p>
                  </div>

                  <div className="rounded-full bg-teal-500/20 px-3 py-1 text-sm text-teal-400">
                    {request.status}
                  </div>
                </div>

                {request.notes && (
                  <p className="mt-4 text-slate-300">
                    {request.notes}
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-500">
              No repair requests yet.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}