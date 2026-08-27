"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const sections = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

const components: Record<string, Record<string, string[]>> = {
  "Inspection Details": {
    "In Attendance": ["Inspector", "Client", "Agent", "Buyer", "Seller"],
    Occupancy: ["Occupied", "Vacant", "Furnished", "Unfurnished"],
    Style: ["Ranch", "Colonial", "Split Level", "Contemporary", "Cape Cod"],
    Temperature: ["Below 32°F", "32-60°F", "60-80°F", "80°F+"],
    "Type of Building": ["Single Family", "Townhouse", "Condo", "Duplex"],
    "Weather Conditions": ["Clear", "Cloudy", "Rain", "Snow", "Windy"],
  },

  Exterior: {
    "Inspection Method": ["Visual"],
    "Siding Material": ["Vinyl", "Brick", "Wood", "Fiber Cement", "Stucco", "Stone"],
    "Exterior Entry Door": ["Steel", "Wood", "Fiberglass", "Glass"],
    "Deck/Porch Material": ["None", "Wood", "Composite", "Concrete", "Masonry"],
    "Driveway Material": ["Concrete", "Asphalt", "Gravel", "Pavers"],
  },

  Roof: {
    "Inspection Method": ["Drone", "Walked Roof", "Ground", "Ladder at Eaves"],
    "Roof Type/Style": ["Gable", "Hip", "Flat", "Mansard", "Shed", "Combination"],
    "Coverings Material": ["Asphalt", "Metal", "Slate", "Tile", "Rubber"],
    "Gutter Material": ["Aluminum", "Vinyl", "Copper", "Steel"],
    "Flashing Material": ["Aluminum", "Steel", "Copper", "Rubber Boot"],
  },

  "Basement, Foundation, Crawlspace & Structure": {
    "Inspection Method": ["Visual", "Limited", "Inaccessible"],
    "Foundation Material": ["Concrete", "Block", "Stone", "Brick", "Wood"],
    "Floor Structure": ["Wood Joists", "Engineered I-Joists", "Concrete Slab", "Inaccessible"],
    "Sub-floor": ["OSB", "Plywood", "Concrete", "Inaccessible"],
  },

  Heating: {
    Brand: ["Carrier", "Goodman", "Trane", "Lennox", "Rheem", "York", "Unknown"],
    "Energy Source": ["Electric", "Gas", "Oil", "Propane"],
    "Heat Type": ["Heat Pump", "Forced Air", "Boiler", "Baseboard", "Furnace"],
    "Responds To Normal Controls": ["Yes", "No", "Not Tested"],
    Ductwork: ["Insulated", "Uninsulated", "Inaccessible"],
  },

  Cooling: {
    Brand: ["Carrier", "Goodman", "Trane", "Lennox", "Rheem", "York", "Unknown"],
    "Energy Source/Type": ["Heat Pump", "Central Air Conditioner", "Electric"],
    Location: ["Left of Front", "Right of Front", "Rear", "Side Yard"],
    "SEER Rating": ["Unknown", "13 SEER", "14 SEER", "15 SEER", "16+ SEER"],
    "Responds To Normal Controls": ["Yes", "No", "Not Tested"],
  },

  Plumbing: {
    "Water Source": ["Public", "Private Well", "Unknown"],
    "Main Water Shut-off Location": ["Basement", "Crawlspace", "Garage", "Utility Room", "Unknown"],
    "Drain Material": ["PVC", "ABS", "Cast Iron", "Copper", "Unknown"],
    "Water Supply Material": ["Copper", "PEX", "CPVC", "PVC", "Unknown"],
    "Water Heater Manufacturer": ["Rheem", "AO Smith", "Bradford White", "State", "Unknown"],
    "Water Heater Power Source": ["Electric", "Gas", "Propane"],
    "Water Heater Capacity": ["30 gallons", "40 gallons", "50 gallons", "75 gallons", "Unknown"],
  },

  Electrical: {
    "Service Conductors": ["Below Ground", "Overhead"],
    "Main Panel Location": ["Garage", "Basement", "Exterior", "Utility Room"],
    "Panel Capacity": ["100 AMP", "150 AMP", "200 AMP", "Unknown"],
    "Panel Manufacturer": ["Square D", "Siemens", "Eaton", "GE", "Federal Pacific", "Zinsco", "Unknown"],
    "Panel Type": ["Circuit Breaker", "Fuse"],
    "Branch Wire": ["Copper", "Aluminum", "Mixed", "Unknown"],
    "Smoke Detector Present": ["Yes", "No"],
    "Carbon Monoxide Detector Present": ["Yes", "No"],
  },

  "Attic, Insulation & Ventilation": {
    "Attic Insulation Type": ["Loose-fill", "Fiberglass Batt", "Spray Foam", "Cellulose", "None"],
    "R-value": ["Unknown", "R-19", "R-30", "R-38", "R-49"],
    "Ventilation Type": ["Ridge Vents", "Soffit Vents", "Gable Vents", "Box Vents", "None Visible"],
    "Exhaust Fans": ["Fan Only", "Fan Vented Exterior", "Not Present"],
    "Dryer Vent": ["Metal Flex", "Rigid Metal", "Plastic", "Unknown"],
  },

  "Doors, Windows & Interior": {
    "Interior Doors": ["Hollow Core", "Solid Core", "Wood", "Unknown"],
    "Window Type": ["Double-hung", "Single-hung", "Casement", "Slider", "Fixed"],
    "Floor Coverings": ["Vinyl", "Carpet", "Hardwood", "Laminate", "Tile"],
    "Wall Material": ["Drywall", "Plaster", "Paneling"],
    "Ceiling Material": ["Drywall", "Plaster", "Drop Ceiling"],
    "Countertop Material": ["Laminate", "Granite", "Quartz", "Solid Surface"],
  },

  "Built-in Appliances": {
    Dishwasher: ["Whirlpool", "GE", "Samsung", "LG", "Frigidaire", "Unknown"],
    Refrigerator: ["Whirlpool", "GE", "Samsung", "LG", "Frigidaire", "Unknown"],
    "Range/Oven Brand": ["Whirlpool", "GE", "Samsung", "LG", "Frigidaire", "Unknown"],
    "Range/Oven Energy Source": ["Electric", "Gas", "Propane"],
    "Exhaust Hood Type": ["Re-circulate", "Vented Exterior", "Microwave Hood", "None"],
    "Garbage Disposal": ["Yes", "No"],
  },

  Garage: {
    "Garage Door Material": ["Metal", "Wood", "Fiberglass", "Unknown"],
    "Garage Door Type": ["Automatic", "Manual"],
    "Garage Floor": ["Concrete", "Epoxy Coated", "Unknown"],
    "Garage Walls": ["Drywall", "Unfinished", "Block", "Unknown"],
    "Garage Door Opener": ["Yes", "No"],
  },
};

export default function ReportBuilderPage() {
  const [section, setSection] = useState(sections[0]);
  const [component, setComponent] = useState(Object.keys(components[sections[0]])[0]);
  const [selectedValue, setSelectedValue] = useState(components[sections[0]][Object.keys(components[sections[0]])[0]][0]);

  const [tag, setTag] = useState("");
  const [title, setTitle] = useState("");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");

  const [savingItem, setSavingItem] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingFinding, setSavingFinding] = useState(false);

  function changeSection(value: string) {
    const firstComponent = Object.keys(components[value])[0];
    const firstValue = components[value][firstComponent][0];

    setSection(value);
    setComponent(firstComponent);
    setSelectedValue(firstValue);
  }

  function changeComponent(value: string) {
    setComponent(value);
    setSelectedValue(components[section][value][0]);
  }

  async function saveComponentInfo() {
    try {
      setSavingItem(true);

      const { error } = await supabase.from("report_items").insert([
        {
          section,
          component,
          selected_value: selectedValue,
        },
      ]);

      if (error) {
        alert(error.message);
        return;
      }

      alert("Component info saved.");
    } finally {
      setSavingItem(false);
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setUploadedImageUrl("");
  }

  async function uploadPhoto() {
    if (!photo) {
      alert("Please select a photo.");
      return "";
    }

    const fileExt = photo.name.split(".").pop() || "jpg";
    const filePath = `findings/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("inspection-photos")
      .upload(filePath, photo, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      alert(uploadError.message);
      return "";
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("inspection-photos").getPublicUrl(filePath);

    setUploadedImageUrl(publicUrl);
    return publicUrl;
  }

  async function analyzePhoto() {
    try {
      setAnalyzing(true);

      let imageUrl = uploadedImageUrl;

      if (!imageUrl) imageUrl = await uploadPhoto();

      if (!imageUrl) return;

      const response = await fetch("/api/ai/comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl,
          section,
          category: component,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "AI analysis failed.");
        return;
      }

      setTitle(data.title || "");
      setObservation(data.observation || "");
      setImplication(data.implication || "");
      setRecommendation(data.recommendation || "");
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveFinding() {
    try {
      setSavingFinding(true);

      let imageUrl = uploadedImageUrl;

      if (!imageUrl && photo) imageUrl = await uploadPhoto();

      const { error } = await supabase.from("findings").insert([
        {
          section,
          category: component,
          tag,
          title,
          observation,
          implication,
          recommendation,
          image_url: imageUrl || null,
        },
      ]);

      if (error) {
        alert(error.message);
        return;
      }

      alert("Finding saved successfully.");

      setTag("");
      setTitle("");
      setObservation("");
      setImplication("");
      setRecommendation("");
      setPhoto(null);
      setPhotoPreview(null);
      setUploadedImageUrl("");
    } finally {
      setSavingFinding(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--fl-surface-2)] p-6 text-[var(--fl-text)]">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-4xl font-bold text-[var(--fl-accent-text)]">Report Builder</h1>

        <div className="rounded-2xl border border-zinc-800 bg-[var(--fl-ground)] p-5 space-y-4">
          <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">Component Info</h2>

          <select value={section} onChange={(e) => changeSection(e.target.value)} className="w-full rounded border border-zinc-700 bg-[var(--fl-surface)] p-3">
            {sections.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select value={component} onChange={(e) => changeComponent(e.target.value)} className="w-full rounded border border-zinc-700 bg-[var(--fl-surface)] p-3">
            {Object.keys(components[section]).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select value={selectedValue} onChange={(e) => setSelectedValue(e.target.value)} className="w-full rounded border border-zinc-700 bg-[var(--fl-surface)] p-3">
            {components[section][component].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>

          <button onClick={saveComponentInfo} disabled={savingItem} className="rounded bg-teal-600 px-5 py-3 font-bold hover:bg-teal-700 disabled:bg-[var(--fl-line)]">
            {savingItem ? "Saving..." : "Save Component Info"}
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[var(--fl-ground)] p-5 space-y-4">
          <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">Finding / Defect</h2>

          <select value={tag} onChange={(e) => setTag(e.target.value)} className="w-full rounded border border-zinc-700 bg-[var(--fl-surface)] p-3">
            <option value="">No Tag</option>
            <option value="Maintenance Item">Maintenance Item</option>
            <option value="Recommendation">Recommendation</option>
            <option value="Safety Hazard">Safety Hazard</option>
            <option value="Monitor">Monitor</option>
            <option value="Qualified Professional">Qualified Professional</option>
          </select>

          <input type="file" accept="image/*" onChange={handlePhotoChange} className="w-full rounded border border-zinc-700 bg-[var(--fl-surface)] p-3" />

          {photoPreview && <img src={photoPreview} alt="Preview" className="max-h-[500px] w-full rounded border border-zinc-700 object-contain" />}

          <button onClick={analyzePhoto} disabled={!photo || analyzing} className="rounded bg-teal-600 px-5 py-3 font-bold hover:bg-teal-700 disabled:bg-[var(--fl-line)]">
            {analyzing ? "Analyzing..." : "Analyze Photo"}
          </button>

          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full rounded border border-zinc-700 bg-[var(--fl-surface)] p-3" />

          <textarea value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Observation" rows={4} className="w-full rounded border border-zinc-700 bg-[var(--fl-surface)] p-3" />

          <textarea value={implication} onChange={(e) => setImplication(e.target.value)} placeholder="Implication" rows={4} className="w-full rounded border border-zinc-700 bg-[var(--fl-surface)] p-3" />

          <textarea value={recommendation} onChange={(e) => setRecommendation(e.target.value)} placeholder="Recommendation" rows={4} className="w-full rounded border border-zinc-700 bg-[var(--fl-surface)] p-3" />

          <button onClick={saveFinding} disabled={savingFinding} className="rounded bg-teal-600 px-5 py-3 font-bold hover:bg-teal-700 disabled:bg-[var(--fl-line)]">
            {savingFinding ? "Saving..." : "Save Finding"}
          </button>
        </div>
      </div>
    </main>
  );
}