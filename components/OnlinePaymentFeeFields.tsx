"use client";

import { useState } from "react";

export default function OnlinePaymentFeeFields({
  defaultFeeType,
  defaultFeeAmount,
}: {
  defaultFeeType: string;
  defaultFeeAmount: number;
}) {
  const [feeType, setFeeType] = useState(defaultFeeType);
  const isStripeFee = feeType === "stripe_fee";

  return (
    <>
      <label className="block min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
          Fee Type
        </p>
        <select
          name="online_payment_fee_type"
          value={feeType}
          onChange={(event) => setFeeType(event.target.value)}
          className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
        >
          <option value="percentage">Percentage of balance</option>
          <option value="flat">Flat dollar amount</option>
          <option value="stripe_fee">Cover Stripe's fee (2.9% + $0.30)</option>
        </select>
      </label>

      <label className="block min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
          Fee Amount
        </p>

        {isStripeFee ? (
          <>
            <div className="flex w-full min-w-0 items-center rounded-xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-[var(--fl-faint)]">
              Calculated automatically
            </div>
            <input type="hidden" name="online_payment_fee_amount" value={defaultFeeAmount} />
          </>
        ) : (
          <input
            name="online_payment_fee_amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={String(defaultFeeAmount)}
            placeholder="e.g. 3.95 for 3.95%, or 15 for $15 flat"
            className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
          />
        )}

        <p className="mt-1 text-xs text-[var(--fl-faint)]">
          {isStripeFee
            ? "Your payout will always match the invoice balance exactly - the client's card covers the rest."
            : 'Enter a percent (e.g. 3.95) if Fee Type is Percentage, or a dollar amount (e.g. 15) if Fee Type is Flat.'}
        </p>
      </label>
    </>
  );
}
