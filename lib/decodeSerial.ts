export function estimateEquipmentAge(manufactureYear?: string | number) {
  if (!manufactureYear) return "Unknown";

  const year = Number(manufactureYear);
  const currentYear = new Date().getFullYear();

  if (!year || year < 1950 || year > currentYear) {
    return "Unknown";
  }

  return currentYear - year;
}

export function decodeGoodmanSerial(serial?: string) {
  if (!serial || serial.length < 2) return null;

  const yearPrefix = serial.substring(0, 2);
  const year = Number(`20${yearPrefix}`);

  if (year < 1990 || year > new Date().getFullYear()) {
    return null;
  }

  return year;
}

export function decodeEquipmentSerial(manufacturer?: string, serial?: string) {
  if (!manufacturer || !serial) return null;

  const brand = manufacturer.toLowerCase();

  if (brand.includes("goodman") || brand.includes("amana")) {
    return decodeGoodmanSerial(serial);
  }

  return null;
}