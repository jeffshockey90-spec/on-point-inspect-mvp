import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import PrintControls from "./PrintControls";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

const SECTION_ORDER = [
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
  "Disclaimers",
  "Garage",
];

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

function normalizeSection(section: string | null | undefined) {
  if (!section) return "Inspection Details";

  const clean = section.trim();

  const aliases: Record<string, string> = {
    General: "Inspection Details",
    Safety: "Inspection Details",
    "Basement/Foundation/Crawlspace & Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Basement, Foundation, Crawlspace and Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
    "Attic, Insulation and Ventilation": "Attic, Insulation & Ventilation",
    "Doors/Windows & Interior": "Doors, Windows & Interior",
    "Doors, Windows and Interior": "Doors, Windows & Interior",
    Appliances: "Built-in Appliances",
    "Built In Appliances": "Built-in Appliances",
  };

  return aliases[clean] || clean;
}

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";

  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);

  if (index === -1) return "";

  return decodeURIComponent(url.substring(index + marker.length));
}

function getSeverityClass(severity: string | null | undefined) {
  const value = String(severity || "").toLowerCase();

  if (
    value.includes("safety") ||
    value.includes("hazard") ||
    value.includes("major")
  ) {
    return "bg-red-700 text-white border-red-800";
  }

  if (
    value.includes("maintenance") ||
    value.includes("monitor") ||
    value.includes("minor")
  ) {
    return "bg-yellow-500 text-slate-950 border-yellow-600";
  }

  if (
    value.includes("information") ||
    value.includes("info") ||
    value.includes("client")
  ) {
    return "bg-blue-700 text-white border-blue-800";
  }

  return "bg-teal-700 text-white border-teal-800";
}


function groupChecklistRows(rows: any[]) {
  const grouped: Record<string, Record<string, any[]>> = {};

  (rows || []).forEach((row: any) => {
    if (!grouped[row.section]) grouped[row.section] = {};
    if (!grouped[row.section][row.group_title]) grouped[row.section][row.group_title] = [];
    grouped[row.section][row.group_title].push(row);
  });

  return grouped;
}

function groupLimitations(rows: any[], photosByLimitationId: Record<string, any[]>) {
  const grouped: Record<string, any[]> = {};

  (rows || []).forEach((row: any) => {
    if (!grouped[row.section]) grouped[row.section] = [];
    grouped[row.section].push({
      ...row,
      photos: photosByLimitationId[row.id] || [],
    });
  });

  return grouped;
}

async function createSignedUrl(supabase: any, filePath: string) {
  if (!filePath) return "";

  const { data } = await supabase.storage
    .from("inspection-photos")
    .createSignedUrl(filePath, 60 * 60 * 24 * 7);

  return data?.signedUrl || "";
}

export default async function PrintableReportPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .eq("inspector_id", user.id)
    .single();

  if (inspectionError || !inspection) redirect("/reports");

  const { data: findingsRaw } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  const findingIds = (findingsRaw || []).map((finding: any) => finding.id);

  const { data: photosRaw } =
    findingIds.length > 0
      ? await supabase.from("photos").select("*").in("finding_id", findingIds)
      : { data: [] };

  const photosWithUrls = await Promise.all(
    (photosRaw || []).map(async (photo: any) => {
      const filePath =
        photo.file_path ||
        photo.storage_path ||
        photo.photo_path ||
        getStoragePathFromUrl(photo.public_url) ||
        getStoragePathFromUrl(photo.image_url) ||
        getStoragePathFromUrl(photo.photo_url);

      if (!filePath) {
        return {
          ...photo,
          signed_url:
            photo.signed_url ||
            photo.public_url ||
            photo.image_url ||
            photo.photo_url ||
            null,
        };
      }

      const { data } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(filePath, 60 * 60 * 24 * 7);

      return {
        ...photo,
        signed_url:
          data?.signedUrl ||
          photo.signed_url ||
          photo.public_url ||
          photo.image_url ||
          photo.photo_url ||
          null,
      };
    })
  );

  const photosByFindingId = photosWithUrls.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.finding_id) return acc;
      if (!acc[photo.finding_id]) acc[photo.finding_id] = [];
      acc[photo.finding_id].push(photo);
      return acc;
    },
    {}
  );

  const findings = await Promise.all(
    (findingsRaw || []).map(async (finding: any) => {
      let signedImageUrl = finding.image_url || "";
      const oldImagePath = getStoragePathFromUrl(finding.image_url);

      if (oldImagePath) {
        const { data } = await supabase.storage
          .from("inspection-photos")
          .createSignedUrl(oldImagePath, 60 * 60 * 24 * 7);

        if (data?.signedUrl) signedImageUrl = data.signedUrl;
      }

      return {
        ...finding,
        section: normalizeSection(finding.section),
        image_url: signedImageUrl || finding.image_url || null,
        photos: photosByFindingId[finding.id] || [],
      };
    })
  );


  const { data: checklistRows } = await supabase
    .from("section_checklist_selections")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  const { data: limitationRows } = await supabase
    .from("section_limitations")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  const limitationIds = (limitationRows || []).map((item: any) => item.id);

  const { data: limitationPhotosRaw } =
    limitationIds.length > 0
      ? await supabase
          .from("limitation_photos")
          .select("*")
          .in("limitation_id", limitationIds)
      : { data: [] };

  const limitationPhotosWithUrls = await Promise.all(
    (limitationPhotosRaw || []).map(async (photo: any) => ({
      ...photo,
      signed_url:
        (await createSignedUrl(supabase, photo.file_path)) ||
        photo.public_url ||
        "",
    }))
  );

  const photosByLimitationId = limitationPhotosWithUrls.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.limitation_id) return acc;
      if (!acc[photo.limitation_id]) acc[photo.limitation_id] = [];
      acc[photo.limitation_id].push(photo);
      return acc;
    },
    {}
  );

  const checklistBySection = groupChecklistRows(checklistRows || []);
  const limitationsBySection = groupLimitations(
    limitationRows || [],
    photosByLimitationId
  );

  const { data: sectionReferencePhotosRaw } = await supabase
    .from("section_reference_photos")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  const sectionReferencePhotos = await Promise.all(
    (sectionReferencePhotosRaw || []).map(async (photo: any) => ({
      ...photo,
      signed_url:
        (await createSignedUrl(supabase, photo.file_path)) ||
        photo.public_url ||
        "",
    }))
  );

  const referencePhotosBySection = sectionReferencePhotos.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.section) return acc;
      if (!acc[photo.section]) acc[photo.section] = [];
      acc[photo.section].push(photo);
      return acc;
    },
    {}
  );


  const { data: reportDisclaimers } = await supabase
    .from("report_disclaimers")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  const { data: equipmentInventoryRaw, error: equipmentInventoryError } = await supabase
    .from("equipment_inventory")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  if (equipmentInventoryError) {
    console.error("Print equipment inventory load error:", equipmentInventoryError);
  }

  const equipmentInventory = await Promise.all(
    (equipmentInventoryRaw || []).map(async (item: any) => ({
      ...item,
      signed_image_url:
        (await createSignedUrl(supabase, item.file_path)) ||
        item.image_url ||
        "",
    }))
  );

  const defectFindings = findings.filter((finding: any) => {
    const section = String(finding.section || "").toLowerCase();
    const title = String(finding.title || "").toLowerCase();

    if (section === "inspection details") return false;
    if (section === "disclaimers") return false;
    if (title === "in attendance") return false;
    if (title === "occupancy") return false;
    if (title === "style") return false;
    if (title === "temperature") return false;
    if (title === "type of building") return false;
    if (title === "weather conditions") return false;
    if (title.includes("section reference photo")) return false;
    if (title.includes("reference photo")) return false;

    return true;
  });

  const defectTotals = defectFindings.reduce(
    (acc: Record<string, number>, finding: any) => {
      const severity = String(
        finding.severity || "Recommended Repair"
      ).toLowerCase();

      acc.total += 1;

      if (
        severity.includes("safety") ||
        severity.includes("hazard") ||
        severity.includes("major")
      ) {
        acc.safety += 1;
      } else if (
        severity.includes("maintenance") ||
        severity.includes("monitor") ||
        severity.includes("minor")
      ) {
        acc.maintenance += 1;
      } else if (
        severity.includes("information") ||
        severity.includes("info") ||
        severity.includes("client")
      ) {
        acc.information += 1;
      } else {
        acc.repair += 1;
      }

      return acc;
    },
    {
      total: 0,
      safety: 0,
      repair: 0,
      maintenance: 0,
      information: 0,
    }
  );

  const groupedFindingsArray = SECTION_ORDER.map((section) => ({
    section,
    findings: findings.filter((finding: any) => finding.section === section),
  }));

  const propertyPhoto =
    inspection.property_image ||
    inspection.street_view_url ||
    inspection.cover_photo_url ||
    inspection.google_photo_url ||
    inspection.property_photo_url ||
    inspection.place_photo_url ||
    inspection.photo_url ||
    inspection.image_url ||
    null;

  return (
    <main className="min-h-screen bg-white text-slate-950 print:bg-white">
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0.5in;
          }

          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .page-break {
            page-break-before: always;
          }

          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .print-footer {
            position: fixed;
            bottom: 0.15in;
            left: 0.5in;
            right: 0.5in;
          }
        }
      `}</style>

      <div className="mx-auto max-w-5xl p-8 print:max-w-none print:p-0">
        <PrintControls inspectionId={String(inspection.id)} />

        <section className="avoid-break min-h-[900px] overflow-hidden rounded-3xl border border-slate-300 bg-white shadow-sm print:min-h-[9.5in] print:rounded-none print:border-0 print:shadow-none">
          {propertyPhoto && (
            <img
              src={propertyPhoto}
              alt="Property"
              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              className="h-80 w-full object-cover print:h-72"
            />
          )}

          <div className="bg-slate-950 p-8 text-white">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-300">
                  Residential Home Inspection Report
                </p>

                <h1 className="mt-4 text-5xl font-black tracking-tight">
                  On Point Home Inspections
                </h1>

                <p className="mt-3 text-lg font-semibold text-slate-300">
                  Protecting Your Investment. One Inspection at a Time.
                </p>
              </div>

              <div className="rounded-2xl border border-teal-400/40 bg-white/10 p-4 text-right">
                <p className="text-sm font-bold text-teal-300">
                  Licensed Home Inspector
                </p>
                <p className="mt-1 text-sm text-slate-200">
                  MD License #35912
                </p>
                <p className="text-sm text-slate-200">
                  WV License #HI5277172-0226
                </p>
                <p className="mt-2 text-sm text-slate-200">
                  240-527-7172
                </p>
                <p className="text-sm text-slate-200">
                  onpointhomeinspect.com
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-8 md:grid-cols-2">
            <InfoRow label="Property Address" value={inspection.address} />
            <InfoRow label="Client" value={inspection.client_name} />
            <InfoRow label="Client Email" value={inspection.client_email} />
            <InfoRow label="Realtor" value={inspection.realtor_name} />
            <InfoRow label="Inspection Date" value={inspection.inspection_date} />
            <InfoRow label="Square Feet" value={inspection.square_feet} />
            <InfoRow label="Year Built" value={inspection.year_built} />
            <InfoRow
              label="City / State / Zip"
              value={`${inspection.city || ""} ${inspection.state || ""} ${
                inspection.zip || ""
              }`}
            />
          </div>

          <div className="mx-8 mb-8 rounded-2xl border border-slate-300 bg-slate-50 p-6">
            <h2 className="text-2xl font-black text-slate-950">
              Report Overview
            </h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <DefectCountCard label="Total" value={defectTotals.total} />
              <DefectCountCard
                label="Safety / Major"
                value={defectTotals.safety}
              />
              <DefectCountCard label="Repair" value={defectTotals.repair} />
              <DefectCountCard
                label="Maintenance"
                value={defectTotals.maintenance}
              />
              <DefectCountCard
                label="Informational"
                value={defectTotals.information}
              />
            </div>
          </div>
        </section>

        {equipmentInventory.length > 0 && (
          <section
            id="equipment-inventory"
            className="avoid-break page-break rounded-2xl border border-cyan-200 bg-cyan-50 p-6"
          >
            <h2 className="text-3xl font-black text-cyan-800">
              Equipment Inventory
            </h2>

            <p className="mt-3 text-base leading-7 text-slate-700">
              Major systems and equipment documented during the inspection. These records are informational and are not counted as defects unless a separate finding is included.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {equipmentInventory.map((item: any) => {
                const equipmentImage =
                  item.signed_image_url || item.image_url || item.public_url || "";

                return (
                  <div
                    key={item.id}
                    className="avoid-break rounded-xl border border-slate-300 bg-white p-5"
                  >
                    {equipmentImage && (
                      <img
                        src={equipmentImage}
                        alt={item.equipment_type || "Equipment"}
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                              className="mb-4 max-h-[260px] w-full rounded-xl border border-slate-300 object-contain"
                      />
                    )}

                    <p className="text-xs font-black uppercase tracking-wide text-cyan-700">
                      {item.equipment_type || "Equipment"}
                    </p>

                    <h3 className="mt-2 text-2xl font-black text-slate-950">
                      {[item.manufacturer, item.model].filter(Boolean).join(" ") || "Equipment Record"}
                    </h3>

                    <div className="mt-4 grid gap-2 text-base text-slate-700">
                      <InventoryLine label="Serial" value={item.serial} />
                      <InventoryLine label="Manufacture Year" value={item.manufacture_year} />
                      <InventoryLine label="Estimated Age" value={item.estimated_age} />
                      <InventoryLine label="Expected Life" value={item.expected_service_life} />
                      <InventoryLine label="Life Remaining" value={item.estimated_life_remaining} />
                      <InventoryLine label="Refrigerant" value={item.refrigerant} />
                      <InventoryLine label="Condition" value={item.condition} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {inspection.report_summary && (
          <section className="avoid-break page-break rounded-2xl border border-teal-200 bg-teal-50 p-6">
            <h2 className="text-3xl font-black text-teal-800">
              Realtor Summary
            </h2>

            <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-slate-800">
              {inspection.report_summary}
            </p>
          </section>
        )}


        {Object.keys(checklistBySection).length > 0 && (
          <section className="avoid-break page-break rounded-2xl border border-slate-300 bg-white p-6">
            <h2 className="text-3xl font-black text-slate-950">
              Inspection Information
            </h2>

            <div className="mt-6 space-y-6">
              {SECTION_ORDER.filter((section) => checklistBySection[section]).map(
                (section) => (
                  <div key={section} className="avoid-break rounded-xl border border-slate-300 p-5">
                    <h3 className="mb-4 text-2xl font-black text-teal-800">
                      {section}
                    </h3>

                    <div className="grid gap-4 md:grid-cols-2">
                      {Object.entries(checklistBySection[section]).map(
                        ([groupTitle, rows]: any) => (
                          <div key={groupTitle}>
                            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                              {groupTitle}
                            </p>

                            <p className="mt-1 text-base font-semibold text-slate-800">
                              {(rows || [])
                                .map((row: any) => row.custom_text || row.value)
                                .filter((value: string) => value !== "__TEXT_VALUE__")
                                .join(", ") || "N/A"}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {Object.keys(limitationsBySection).length > 0 && (
          <section className="avoid-break page-break rounded-2xl border border-yellow-300 bg-yellow-50 p-6">
            <h2 className="text-3xl font-black text-yellow-800">
              Limitations
            </h2>

            <div className="mt-6 space-y-6">
              {SECTION_ORDER.filter((section) => limitationsBySection[section]).map(
                (section) => (
                  <div key={section} className="avoid-break rounded-xl border border-slate-300 bg-white p-5">
                    <h3 className="mb-4 text-2xl font-black text-slate-950">
                      {section}
                    </h3>

                    <div className="space-y-5">
                      {(limitationsBySection[section] || []).map((item: any) => (
                        <div key={item.id} className="avoid-break rounded-xl border border-slate-300 p-4">
                          <p className="font-black text-yellow-800">
                            {item.custom_text || item.label}
                          </p>

                          {item.limitation_comment && (
                            <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-slate-700">
                              {item.limitation_comment}
                            </p>
                          )}

                          {item.photos?.length > 0 && (
                            <div className="mt-4 grid gap-4 md:grid-cols-3">
                              {item.photos.map((photo: any) => (
                                <img
                                  key={photo.id}
                                  src={photo.signed_url || photo.public_url}
                                  alt="Limitation photo"
                                  decoding="async"
                                  loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              className="max-h-[260px] w-full rounded-xl border object-cover"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {Object.keys(referencePhotosBySection).length > 0 && (
          <section className="avoid-break page-break rounded-2xl border border-cyan-200 bg-cyan-50 p-6">
            <h2 className="text-3xl font-black text-cyan-800">
              Section Reference Photos
            </h2>

            <p className="mt-3 text-base leading-7 text-slate-700">
              These photos document general section conditions and are not defect findings.
            </p>

            <div className="mt-6 space-y-6">
              {SECTION_ORDER.filter((section) => referencePhotosBySection[section]).map(
                (section) => (
                  <div
                    key={section}
                    className="avoid-break rounded-xl border border-slate-300 bg-white p-5"
                  >
                    <h3 className="mb-4 text-2xl font-black text-slate-950">
                      {section}
                    </h3>

                    <div className="grid gap-4 md:grid-cols-3">
                      {referencePhotosBySection[section].map((photo: any, index: number) => {
                        const photoUrl = photo.signed_url || photo.public_url || "";

                        if (!photoUrl) return null;

                        return (
                          <div
                            key={photo.id || index}
                            className="avoid-break overflow-hidden rounded-xl border border-slate-300 bg-white"
                          >
                            <img
                              src={photoUrl}
                              alt={photo.caption || `Section reference photo ${index + 1}`}
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              className="max-h-[280px] w-full object-cover"
                            />

                            {photo.caption && (
                              <p className="border-t border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                                {photo.caption}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {reportDisclaimers && reportDisclaimers.length > 0 && (
          <section className="avoid-break page-break rounded-2xl border border-purple-200 bg-purple-50 p-6">
            <h2 className="text-3xl font-black text-purple-800">
              Disclaimers
            </h2>

            <div className="mt-6 space-y-5">
              {reportDisclaimers.map((disclaimer: any) => (
                <div key={disclaimer.id} className="avoid-break rounded-xl border border-slate-300 bg-white p-5">
                  <h3 className="text-2xl font-black text-slate-950">
                    {disclaimer.topic}
                  </h3>

                  <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-slate-700">
                    {disclaimer.disclaimer_text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="page-break">
          <h2 className="mb-8 text-4xl font-black text-slate-950">
            Inspection Findings
          </h2>

          <div className="space-y-10">
            {groupedFindingsArray.map((group) => {
              if (group.findings.length === 0) return null;

              return (
                <section key={group.section} className="space-y-5">
                  <h3 className="border-b-4 border-teal-600 pb-2 text-3xl font-black text-teal-800">
                    {group.section}
                  </h3>

                  {group.findings.map((finding: any) => (
                    <article
                      key={finding.id}
                      className="avoid-break overflow-hidden rounded-2xl border border-slate-300 bg-white"
                    >
                      <div className="border-b border-slate-300 bg-slate-100 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              {finding.section}
                            </p>

                            <h4 className="mt-1 text-2xl font-black text-slate-950">
                              {finding.title || "Untitled Finding"}
                            </h4>
                          </div>

                          {finding.severity && (
                            <span
                              className={`rounded-full border px-4 py-2 text-sm font-black ${getSeverityClass(
                                finding.severity
                              )}`}
                            >
                              {finding.severity}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-6">
                        {(finding.image_url ||
                          (finding.photos && finding.photos.length > 0)) && (
                          <div className="mb-6 grid gap-4 md:grid-cols-2">
                            {finding.image_url && (
                              <img
                                src={finding.image_url}
                                alt={finding.title || "Finding photo"}
                                decoding="async"
                                loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              className="max-h-[360px] w-full rounded-xl border object-cover"
                              />
                            )}

                            {(finding.photos || []).map((photo: any) => (
                              <img
                                key={photo.id}
                                src={photo.signed_url}
                                alt={finding.title || "Finding photo"}
                                decoding="async"
                                loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              className="max-h-[360px] w-full rounded-xl border object-cover"
                              />
                            ))}
                          </div>
                        )}

                        <FindingTextBlock
                          title="Observation"
                          value={finding.observation}
                        />

                        <FindingTextBlock
                          title="Implication"
                          value={finding.implication}
                        />

                        <FindingTextBlock
                          title="Recommendation"
                          value={finding.recommendation}
                        />
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </section>

        <footer className="print-footer mt-12 border-t border-slate-300 pt-4 text-center text-xs text-slate-500">
          On Point Home Inspections • MD #35912 • WV #HI5277172-0226 •
          240-527-7172 • onpointhomeinspect.com
        </footer>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-lg font-bold text-slate-950">
        {value || "Not Entered"}
      </p>
    </div>
  );
}

function DefectCountCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-300 bg-white p-4 text-center">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function InventoryLine({ label, value }: { label: string; value?: any }) {
  if (!value) return null;

  return (
    <div className="flex justify-between gap-3 border-b border-slate-200 pb-1">
      <span className="font-black text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function FindingTextBlock({
  title,
  value,
}: {
  title: string;
  value: any;
}) {
  if (!value) return null;

  return (
    <div className="mb-5">
      <h5 className="mb-2 text-lg font-black text-slate-950">{title}</h5>

      <p className="whitespace-pre-wrap text-base leading-7 text-slate-700">
        {value}
      </p>
    </div>
  );
}