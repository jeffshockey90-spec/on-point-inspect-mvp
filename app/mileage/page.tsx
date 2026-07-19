"use client";

import MileageControls from "../../components/time-location/MileageControls";

export default function MileagePage() {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Mileage Tracker</h1>
        <p className="mt-1 text-sm text-gray-600">
          Track business mileage for inspections and other work trips.
        </p>
      </div>

      <MileageControls />
    </main>
  );
}
