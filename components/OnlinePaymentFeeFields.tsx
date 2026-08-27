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
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
          Fee Type
        </p>
        <select
          name="online_payment_fee_type"
          value={feeType}
          onChange={(event) => setFeeType(event.target.value)}
          className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-teal-400"
        >
          <option value="percentage">Percentage of balance</option>
          <option value="flat">Flat dollar amount</option>
          <option value="stripe_fee">Cover Stripe's fee (2.9% + $0.30)</option>
        </select>
      </label>

      <label className="block min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
          Fee Amount
        </p>

        {isStripeFee ? (
          <>
            <div className="flex w-full min-w-0 items-center rounded-xl border border-dashed border-[#232b38] bg-[#131923] p-3 text-[#59626f]">
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
            className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-teal-400"
          />
        )}

        <p className="mt-1 text-xs text-[#59626f]">
          {isStripeFee
            ? "Your payout will always match the invoice balance exactly - the client's card covers the rest."
            : 'Enter a percent (e.g. 3.95) if Fee Type is Percentage, or a dollar amount (e.g. 15) if Fee Type is Flat.'}
        </p>
      </label>
    </>
  );
}
