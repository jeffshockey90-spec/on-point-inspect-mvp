import Nav from "../../components/Nav";

export default function SchedulePage() {
  return (
    <>
      <Nav />

      <main className="min-h-screen bg-black p-6 text-white">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-4xl font-bold text-teal-400">
            Inspection Schedule
          </h1>

          <p className="mt-3 text-zinc-400">
            Upcoming inspections will show here.
          </p>

          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-zinc-300">
              Schedule page created. Next we can connect this to your inspections table and show inspection date, time, address, client, realtor, and status.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}