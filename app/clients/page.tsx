import { createClient } from "../../utils/supabase/server";
import ClientForm from "./client-form";
import DeleteClientButton from "./delete-client-button";

export default async function ClientsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("inspector_id", user?.id)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold text-teal-400">
          Clients
        </h1>

        <p className="mt-2 text-slate-400">
          Manage client information and connect clients to reports.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[400px_1fr]">
          <ClientForm userId={user?.id || ""} />

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-xl font-semibold">
              Client List
            </h2>

            <div className="mt-4 space-y-3">
              {clients && clients.length > 0 ? (
                clients.map((client) => (
                  <div
                    key={client.id}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-white">
                          {client.name}
                        </h3>

                        {client.email && (
                          <p className="text-sm text-slate-400">
                            Email: {client.email}
                          </p>
                        )}

                        {client.phone && (
                          <p className="text-sm text-slate-400">
                            Phone: {client.phone}
                          </p>
                        )}

                        {client.address && (
                          <p className="text-sm text-slate-400">
                            Address: {client.address}
                          </p>
                        )}

                        {client.notes && (
                          <p className="mt-2 text-sm text-slate-500">
                            {client.notes}
                          </p>
                        )}
                      </div>

                      <DeleteClientButton clientId={client.id} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-500">
                  No clients added yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}