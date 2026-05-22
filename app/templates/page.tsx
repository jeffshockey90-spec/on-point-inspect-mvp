export default function SchedulePage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-5xl font-bold text-cyan-400 mb-3">
          Inspection Schedule
        </h1>

        <p className="text-gray-400 mb-10">
          Upcoming inspections will show here.
        </p>

        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 shadow-lg">
          <p className="text-lg text-gray-200 leading-8">
            Schedule page created. Next we can connect this to your inspections
            table and show inspection date, time, address, client, realtor, and
            status.
          </p>
        </div>
      </div>
    </main>
  );
}