// Dedicated data-plate read for equipment scans. The main equipment call does
// five jobs at once (identify, judge condition, write client text in the
// inspector's voice, follow notes, fill a long form) on the FAST model, and
// that's where small plate text gets misread ("Alumacool" for "Goodman").
// This pass has ONE job — read the label text exactly — on the smartest
// vision model at full image detail. It runs IN PARALLEL with the main call,
// so it adds no wait; its identification values then override the main
// call's. Model: OPENAI_PLATE_MODEL, else OPENAI_VISION_MODEL, else the
// smart model.

export type PlateRead = {
  brand: string;
  manufacturer_text: string;
  model: string;
  serial: string;
  manufacture_date: string;
  capacity: string;
  refrigerant: string;
  fuel: string;
  equipment_type: string;
};

const EMPTY: PlateRead = {
  brand: "",
  manufacturer_text: "",
  model: "",
  serial: "",
  manufacture_date: "",
  capacity: "",
  refrigerant: "",
  fuel: "",
  equipment_type: "",
};

export const PLATE_READ_PROMPT = `You are reading equipment labels and data plates in these photos. Your ONLY job is to transcribe identification text exactly as printed — do not describe condition, do not write report text.

Read slowly. Zoom in mentally on small print. Compare characters that are easy to confuse (0/O, 1/I/L, 5/S, 8/B, 2/Z, 6/G) using the surrounding format.

Return ONLY JSON:
{"brand":"","manufacturer_text":"","model":"","serial":"","manufacture_date":"","capacity":"","refrigerant":"","fuel":"","equipment_type":""}

- brand: the consumer brand on the cabinet badge or logo (e.g. "Goodman", "Rheem"). If only the plate's company name is legible, give the brand that company name contains (e.g. "Goodman Manufacturing Company, L.P." -> "Goodman"). Never guess a brand from appearance.
- manufacturer_text: the legal manufacturer line exactly as printed on the plate, if any.
- model / serial: exactly as printed, characters only from the label (keep dashes). The model is labeled MODEL / M/N / MOD; the serial is labeled SERIAL / S/N / SER.
- manufacture_date: only if the plate PRINTS a date (e.g. "MFG DATE 05/2020"). Do NOT derive a date from the serial number.
- capacity (e.g. "36,000 BTU", "3 ton", "50 gal"), refrigerant (e.g. "R-410A"), fuel (gas / electric / oil / propane): only if printed.
- equipment_type: what the label says the unit is, if stated (e.g. "air handler", "heat pump", "gas water heater").
- Leave any field "" when it is not clearly legible. Never invent.`;

const clean = (v: unknown, max = 120) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const isUnknown = (v: string) => !v || /^(unknown|n\/?a|none|not visible|unreadable|-+)$/i.test(v);

export function parsePlateRead(raw: string): PlateRead {
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    return { ...EMPTY };
  }
  const out = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as Array<keyof PlateRead>) {
    const value = clean(parsed?.[key]);
    out[key] = isUnknown(value) ? "" : value;
  }
  // Serial/model: keep only label characters.
  out.model = out.model.replace(/[^A-Za-z0-9\-/.]/g, "");
  out.serial = out.serial.replace(/[^A-Za-z0-9\-/.]/g, "");
  return out;
}

/** True when the read found anything worth using. */
export function hasPlateData(plate: PlateRead | null | undefined): plate is PlateRead {
  return Boolean(plate && (plate.brand || plate.model || plate.serial || plate.manufacturer_text));
}

/** A printed 4-digit year in the plate's date text (e.g. "05/2020" -> 2020), or null. */
export function plateYear(plate: PlateRead): number | null {
  const m = /\b(19[5-9]\d|20\d\d)\b/.exec(plate.manufacture_date || "");
  return m ? Number(m[1]) : null;
}

/**
 * Put the plate read's identification values onto the main analysis. The
 * plate read wins for brand/model/serial/printed date/capacity/refrigerant/
 * fuel; everything else (condition, wording, severity…) stays the main call's.
 * The old brand name is swapped out of the written text so it doesn't
 * contradict the corrected brand.
 */
export function mergePlateRead<T extends Record<string, any>>(analysis: T, plate: PlateRead | null | undefined): T {
  if (!hasPlateData(plate)) return analysis;
  const out: Record<string, any> = { ...analysis };
  const oldBrand = clean(analysis.manufacturer);
  const newBrand = plate.brand || plate.manufacturer_text;

  if (newBrand) out.manufacturer = newBrand;
  if (plate.model) out.model = plate.model;
  if (plate.serial) out.serial = plate.serial;
  const year = plateYear(plate);
  if (year) out.manufactureYear = year;
  if (plate.capacity) out.capacity = plate.capacity;
  if (plate.refrigerant) out.refrigerant = plate.refrigerant;
  if (plate.fuel) out.fuelType = plate.fuel;
  if (!clean(out.equipmentType) && plate.equipment_type) out.equipmentType = plate.equipment_type;

  if (newBrand && oldBrand && !isUnknown(oldBrand) && oldBrand.toLowerCase() !== newBrand.toLowerCase()) {
    const pattern = new RegExp(oldBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    for (const field of ["clientSummary", "observation", "notes", "aiReasoning", "condition"]) {
      if (typeof out[field] === "string") out[field] = out[field].replace(pattern, newBrand);
    }
  }
  return out as T;
}

export function getPlateReaderModel(fallback: string): string {
  return process.env.OPENAI_PLATE_MODEL || process.env.OPENAI_VISION_MODEL || fallback;
}

/** Reasoning-style / newer models (o-series, gpt-5, gpt-6…) reject a custom temperature. */
export function acceptsTemperature(model: string): boolean {
  return !/^(o\d|gpt-[5-9])/i.test(String(model || "").trim());
}

/**
 * Run the plate read. Never throws: on any failure (timeout, bad JSON, model
 * error) it returns null and the scan carries on with the main call alone.
 */
export async function readDataPlate(input: {
  images: Array<{ mimeType: string; base64: string }>;
  model: string;
  timeoutMs?: number;
}): Promise<PlateRead | null> {
  if (!input.images.length || !process.env.OPENAI_API_KEY) return null;
  try {
    // Loaded lazily so the pure helpers above stay importable without an API key.
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create(
      {
        model: input.model,
        // No temperature: newer models (gpt-6.x, o-series, gpt-5) reject a
        // custom one, and a transcription task doesn't need it.
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PLATE_READ_PROMPT },
              ...input.images.map((image) => ({
                type: "image_url" as const,
                image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: "high" as const },
              })),
            ],
          },
        ],
      },
      { timeout: input.timeoutMs ?? 25_000 },
    );
    return parsePlateRead(response.choices[0]?.message?.content || "{}");
  } catch (error) {
    console.warn("Data plate read failed; using the main scan only:", (error as any)?.message || error);
    return null;
  }
}
