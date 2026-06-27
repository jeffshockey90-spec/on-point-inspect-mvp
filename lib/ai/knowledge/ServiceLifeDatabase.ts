export type ServiceLifeRecord = {
  category: string;
  typicalYears: number;
  minimumYears: number;
  maximumYears: number;
  maintenance: string[];
};

const SERVICE_LIFE: Record<string, ServiceLifeRecord> = {
  furnace: {
    category: "Heating",
    typicalYears: 20,
    minimumYears: 15,
    maximumYears: 25,
    maintenance: [
      "Replace filter regularly",
      "Annual professional service",
      "Keep venting unobstructed",
    ],
  },
  "air conditioner": {
    category: "Cooling",
    typicalYears: 15,
    minimumYears: 12,
    maximumYears: 20,
    maintenance: [
      "Clean condenser coil",
      "Replace filter",
      "Annual service",
    ],
  },
  "heat pump": {
    category: "Heating/Cooling",
    typicalYears: 15,
    minimumYears: 10,
    maximumYears: 20,
    maintenance: [
      "Clean outdoor unit",
      "Annual service",
    ],
  },
  "water heater": {
    category: "Plumbing",
    typicalYears: 10,
    minimumYears: 8,
    maximumYears: 15,
    maintenance: [
      "Flush tank annually",
      "Test TPR valve",
      "Inspect anode rod",
    ],
  },
  roof: {
    category: "Roof",
    typicalYears: 25,
    minimumYears: 20,
    maximumYears: 30,
    maintenance: [
      "Keep gutters clean",
      "Replace damaged shingles",
      "Inspect flashing",
    ],
  },
};

export class ServiceLifeDatabase {
  find(name?: string) {
    if (!name) return null;
    const key = name.toLowerCase().trim();
    return SERVICE_LIFE[key] ?? null;
  }

  estimateRemaining(age: number, equipment: string) {
    const record = this.find(equipment);
    if (!record) return null;

    return {
      expectedLife: record.typicalYears,
      estimatedRemaining: Math.max(0, record.typicalYears - age),
      maintenance: record.maintenance,
    };
  }

  all() {
    return SERVICE_LIFE;
  }
}

export const serviceLifeDatabase = new ServiceLifeDatabase();
