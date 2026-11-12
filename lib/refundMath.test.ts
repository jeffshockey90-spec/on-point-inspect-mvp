import { describe, it, expect } from "vitest";
import {
  computeAddOnCancellationRefund,
  inspectionServiceLines,
} from "./refundMath";

describe("computeAddOnCancellationRefund — bundle discount clawback", () => {
  // Home $500 + Radon $175 standalone = $675; $50 bundle discount -> paid $625.
  const bundled = {
    service_fees: { home_inspection: 500, radon: 175 },
    discount: 50,
    invoice_amount: 625,
    amount_paid: 625,
  };

  it("canceling the add-on refunds paid minus the home's STANDALONE price (claws back the discount)", () => {
    const r = computeAddOnCancellationRefund(bundled, ["radon"]);
    // Keep home at its $500 standalone -> refund 625 - 500 = 125 (not the $175 bundled add-on price).
    expect(r.refund).toBe(125);
    expect(r.forfeitedDiscount).toBe(50);
    expect(r.keptLabels).toEqual(["Home Inspection"]);
    expect(r.canceledLabels).toEqual(["Radon Testing"]);
  });

  it("canceling everything returns the full amount paid with nothing forfeited", () => {
    const r = computeAddOnCancellationRefund(bundled, ["home_inspection", "radon"]);
    expect(r.refund).toBe(625);
    expect(r.forfeitedDiscount).toBe(0);
    expect(r.keptLabels).toEqual([]);
  });

  it("canceling the home inspection keeps the add-on at its standalone price", () => {
    const r = computeAddOnCancellationRefund(bundled, ["home_inspection"]);
    // Keep radon at $175 standalone -> refund 625 - 175 = 450.
    expect(r.refund).toBe(450);
  });

  it("no bundle discount -> refund equals the canceled add-on's price (no clawback)", () => {
    const noDiscount = {
      service_fees: { home_inspection: 500, radon: 175 },
      invoice_amount: 675,
      amount_paid: 675,
    };
    const r = computeAddOnCancellationRefund(noDiscount, ["radon"]);
    expect(r.refund).toBe(175);
    expect(r.forfeitedDiscount).toBe(0);
    expect(r.bundleDiscount).toBe(0);
  });

  it("never refunds more than was paid and never goes negative", () => {
    const r = computeAddOnCancellationRefund(bundled, []);
    // Nothing canceled -> keep everything -> refund 625 - 625 = 0.
    expect(r.refund).toBe(0);
    expect(r.refund).toBeGreaterThanOrEqual(0);
  });

  it("lists the inspection's services at standalone prices, home first", () => {
    const lines = inspectionServiceLines(bundled);
    expect(lines.map((l) => l.key)).toEqual(["home_inspection", "radon"]);
    expect(lines[0].standalone).toBe(500);
    expect(lines[1].standalone).toBe(175);
  });
});
