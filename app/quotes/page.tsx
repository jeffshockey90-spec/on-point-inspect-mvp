"use client";

import { useMemo, useState } from "react";
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

    let sqftFee = 0;

    if (sqft >= 2000) {
      sqftFee = (Math.floor((sqft - 2000) / 1000) + 1) * 50;
    }

    const radonFee = radon ? 175 : 0;
    const moldFee = mold ? 150 : 0;
    const subtotal = base + sqftFee + travelFee + radonFee + moldFee;
    const total = Math.max(0, subtotal - discount);

    return { base, sqftFee, radonFee, moldFee, subtotal, total };
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
    <main className="min-h-screen bg-[#050816] px-4 pb-24 pt-6 text-white md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-zinc-800 bg-[#0b1220] p-6 md:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-teal-400">
            On Point Home Inspections
          </p>

          <h1 className="mt-2 text-4xl font-black md:text-5xl">
            Quote Calculator
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
            Generate inspection pricing, build quote messages, and convert
            quotes into inspections.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card title="Build Quote">
            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label="Square Footage"
                value={sqft}
                onChange={setSqft}
              />

              <Input
                label="Travel Fee"
                value={travelFee}
                onChange={setTravelFee}
              />

              <ToggleCard
                title="Radon Add-On"
                price="+$175"
                checked={radon}
                onChange={setRadon}
              />

              <ToggleCard
                title="Mold Sampling"
                price="+$150"
                checked={mold}
                onChange={setMold}
              />

              <div className="md:col-span-2">
                <Input
                  label="Discount"
                  value={discount}
                  onChange={setDiscount}
                />
              </div>
            </div>
          </Card>

          <Card title="Quote Summary">
            <div className="space-y-3 text-zinc-300">
              <SummaryLine label="Base Inspection" value={quote.base} />
              <SummaryLine label="Square Footage Fee" value={quote.sqftFee} />
              <SummaryLine label="Radon" value={quote.radonFee} />
              <SummaryLine label="Mold Sampling" value={quote.moldFee} />
              <SummaryLine label="Travel Fee" value={travelFee} />
              <SummaryLine label="Discount" value={-discount} />

              <div className="mt-5 rounded-2xl border border-teal-700 bg-teal-500/10 p-5">
                <p className="text-sm font-bold uppercase tracking-wide text-zinc-400">
                  Total Quote
                </p>

                <p className="mt-1 text-5xl font-black text-teal-400">
                  ${quote.total}
                </p>
              </div>
            </div>
          </Card>
        </section>

        <Card title="Quote Message">
          <textarea
            className="h-36 w-full rounded-2xl border border-zinc-700 bg-black p-4 text-white"
            value={message}
            readOnly
          />

          <div className="mt-5 flex flex-wrap gap-4">
            <button
              onClick={copyQuote}
              className="rounded-2xl bg-teal-500 px-6 py-4 font-bold text-black transition hover:bg-teal-400"
            >
              Copy Quote Message
            </button>

            <button
              onClick={convertToInspection}
              disabled={creating}
              className="rounded-2xl bg-white px-6 py-4 font-bold text-black transition hover:bg-zinc-200 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Convert To Inspection"}
            </button>
          </div>
        </Card>
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-zinc-300">{label}</span>

      <input
        className="w-full rounded-xl border border-zinc-700 bg-black p-3 text-white"
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ToggleCard({
  title,
  price,
  checked,
  onChange,
}: {
  title: string;
  price: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-zinc-700 bg-black p-4">
      <div>
        <p className="font-bold text-white">{title}</p>
        <p className="text-sm text-zinc-400">{price}</p>
      </div>

      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
      <span>{label}</span>
      <span className="font-bold">${value}</span>
    </div>
  );
}
