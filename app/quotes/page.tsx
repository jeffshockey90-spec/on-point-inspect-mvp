"use client";

import { useMemo, useState } from "react";
import Navbar from "../../components/Nav";
import { Card } from "../../components/Card";

export default function QuotePage() {
  const [sqft, setSqft] = useState(2500);
  const [travelFee, setTravelFee] = useState(0);
  const [radon, setRadon] = useState(false);
  const [mold, setMold] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [creating, setCreating] = useState(false);

  const quote = useMemo(() => {
    const base = 500;

    // $50 added for every 1000 sqft after the first 1000 sqft
    const extraThousands =
  sqft >= 2000 ? Math.floor(sqft / 1000) - 1 : 0;

    const sqftFee = extraThousands * 50;

    const radonFee = radon ? 175 : 0;
    const moldFee = mold ? 0 : 0;

    const subtotal =
      base + sqftFee + travelFee + radonFee + moldFee;

    const total = Math.max(0, subtotal - discount);

    return {
      base,
      sqftFee,
      radonFee,
      moldFee,
      subtotal,
      total,
    };
  }, [sqft, travelFee, radon, mold, discount]);

  const message = `Hi, this is Jeff with On Point Home Inspections. For this property, the home inspection quote is $${quote.total}. This includes a thorough visual inspection and a clear digital report. Add-ons selected: ${
    radon || mold
      ? `${radon ? "Radon " : ""}${mold ? "Mold sampling " : ""}`
      : "None"
  }.`;

  async function copyQuote() {
    await navigator.clipboard.writeText(message);
    alert("Quote message copied");
  }

  async function convertToInspection() {
    try {
      setCreating(true);

      const res = await fetch("/api/create-inspection-from-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          square_feet: sqft,
          price: quote.total,
          radon,
          mold,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to create inspection");
        return;
      }

      window.location.href = `/inspections/${data.id}`;
    } catch (err) {
      console.error(err);
      alert("Error creating inspection");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black text-white p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <h1 className="text-3xl font-bold">Quote Calculator</h1>

          <Card title="Build Quote">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span>Square Footage</span>

                <input
                  className="w-full rounded-lg bg-black border border-zinc-700 p-3 text-white"
                  type="number"
                  value={sqft}
                  onChange={(e) => setSqft(Number(e.target.value))}
                />
              </label>

              <label className="space-y-2">
                <span>Travel Fee</span>

                <input
                  className="w-full rounded-lg bg-black border border-zinc-700 p-3 text-white"
                  type="number"
                  value={travelFee}
                  onChange={(e) => setTravelFee(Number(e.target.value))}
                />
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-black p-4">
                <input
                  type="checkbox"
                  checked={radon}
                  onChange={(e) => setRadon(e.target.checked)}
                />

                <span>Radon add-on</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-black p-4">
                <input
                  type="checkbox"
                  checked={mold}
                  onChange={(e) => setMold(e.target.checked)}
                />

                <span>Mold sampling add-on</span>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span>Discount</span>

                <input
                  className="w-full rounded-lg bg-black border border-zinc-700 p-3 text-white"
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                />
              </label>
            </div>
          </Card>

          <Card title="Quote Summary">
            <div className="space-y-2 text-slate-200">
              <p>Base inspection: ${quote.base}</p>

              <p>Square footage fee: ${quote.sqftFee}</p>

              <p>Radon: ${quote.radonFee}</p>

              <p>Mold sampling: ${quote.moldFee}</p>

              <p>Travel fee: ${travelFee}</p>

              <p>Discount: -${discount}</p>

              <p className="text-2xl font-bold text-teal-400">
                Total: ${quote.total}
              </p>
            </div>

            <textarea
              className="mt-4 h-32 w-full rounded-lg bg-black border border-zinc-700 p-3 text-white"
              value={message}
              readOnly
            />

            <div className="mt-4 flex flex-wrap gap-4">
              <button
                onClick={copyQuote}
                className="rounded-xl bg-teal-500 px-6 py-3 font-bold text-black hover:bg-teal-400"
              >
                Copy Quote Message
              </button>

              <button
                onClick={convertToInspection}
                disabled={creating}
                className="rounded-xl bg-white px-6 py-3 font-bold text-black hover:bg-zinc-200 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Convert To Inspection"}
              </button>
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}