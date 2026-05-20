export function calculateInspectionQuote({
  squareFeet,
  travelFee,
  radon,
  moldSamples,
  waterTesting,
  drone,
  discount
}: {
  squareFeet: number;
  travelFee: number;
  radon: boolean;
  moldSamples: number;
  waterTesting: boolean;
  drone: boolean;
  discount: number;
}) {
  const base = 500;
  const extraThousands = Math.max(0, Math.ceil((squareFeet - 3000) / 1000));
  const squareFootageFee = extraThousands * 50;
  const radonFee = radon ? 175 : 0;
  const moldFee = Math.max(0, moldSamples) * 75;
  const waterFee = waterTesting ? 150 : 0;
  const droneFee = drone ? 75 : 0;
  const subtotal = base + squareFootageFee + travelFee + radonFee + moldFee + waterFee + droneFee;
  const total = Math.max(0, subtotal - discount);

  return { base, squareFootageFee, radonFee, moldFee, waterFee, droneFee, travelFee, discount, subtotal, total };
}
