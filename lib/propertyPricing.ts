export function calculateHomeInspectionPrice(squareFeet: number | string): number {
  const sqft = Number(squareFeet) || 0;
  if (sqft <= 0) return 500;
  if (sqft <= 2000) return 500;
  return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
}
