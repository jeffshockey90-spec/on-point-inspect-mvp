"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

type Finding = Record<string, any>;
type Inspection = Record<string, any>;
type Contact = Record<string, any>;

function getSeverityStyle(severity: string) {
  const clean = String(severity || "Recommended Repair").toLowerCase();

  if (
    clean.includes("safety") ||
    clean.includes("hazard") ||
    clean.includes("major")
  ) {
    return "border-red-500/60 bg-red-500/10 text-red-300";
  }

  if (
    clean.includes("maintenance") ||
    clean.includes("monitor") ||
    clean.includes("minor")
  ) {
    return "border-yellow-500/60 bg-yellow-500/10 text-yellow-300";
  }

  if (clean.includes("information") || clean.includes("info")) {
    return "border-blue-500/60 bg-blue-500/10 text-blue-300";
  }

  return "border-teal-500/60 bg-teal-500/10 text-teal-300";
}

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";
  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(url.substring(index + marker.length));
}

function isRepairFinding(finding: Finding) {
  const section = String(finding.section || "").toLowerCase();
  const title = String(finding.title || "").toLowerCase();

  if (section === "inspection details") return false;
  if (section === "disclaimers") return false;

  const excluded = [
    "in attendance",
    "occupancy",
    "style",
    "temperature",
    "type of building",
    "weather conditions",
  ];

  return !excluded.includes(title);
}

function RepairRequestContent() {
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get("inspection_id");
  const supabase = createClient();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddendum, setShowAddendum] = useState(false);
  const [pdfMessage, setPdfMessage] = useState("");
  const [printingPdf, setPrintingPdf] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailingRepairRequest, setEmailingRepairRequest] = useState(false);
  const [recipientType, setRecipientType] = useState("realtor");
  const [customRecipientEmail, setCustomRecipientEmail] = useState("");

  const [requestIntro, setRequestIntro] = useState(
    "The following items are requested for repair, correction, evaluation, or further review by qualified professionals prior to closing, unless otherwise negotiated by the parties involved."
  );

  useEffect(() => {
    async function trackRepairRequestView() {
      if (!inspectionId) return;

      try {
        await fetch("/api/track-inspection-view", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspection_id: inspectionId,
            view_type: "repair_request",
            viewer_role: "client",
            path: `/repair-request?inspection_id=${inspectionId}`,
          }),
        });
      } catch (error) {
        console.error("Repair request tracking error:", error);
      }
    }

    trackRepairRequestView();
  }, [inspectionId]);

  useEffect(() => {
    async function loadData() {
      if (!inspectionId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data: inspectionData } = await supabase
        .from("inspections")
        .select("*")
        .eq("id", inspectionId)
        .single();

      setInspection(inspectionData || null);

      const { data: contactsRaw } = await supabase
        .from("inspection_contacts")
        .select("name, email, role, portal_access")
        .eq("inspection_id", inspectionId);

      const nextContacts = (contactsRaw || []).filter((contact: any) => {
        if (!contact?.email) return false;
        if (contact.portal_access === false) return false;
        return true;
      });

      setContacts(nextContacts);

      const preferredRealtor = nextContacts.find((contact: any) => {
        const role = String(contact.role || "").toLowerCase();
        return role.includes("realtor") || role.includes("agent") || role.includes("transaction");
      });

      const preferredClient = nextContacts.find((contact: any) => {
        const role = String(contact.role || "").toLowerCase();
        return role.includes("client");
      });

      if (!preferredRealtor && preferredClient) {
        setRecipientType("client");
      }

      const { data: findingsRaw } = await supabase
        .from("findings")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true });

      const filteredFindings = (findingsRaw || []).filter(isRepairFinding);
      const findingIds = filteredFindings.map((finding: any) => finding.id);

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
                "",
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
              "",
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

      const hydratedFindings = filteredFindings.map((finding: any) => ({
        ...finding,
        photos: photosByFindingId[finding.id] || [],
      }));

      const selectedFromUrl = String(searchParams.get("selected") || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      const validSelectedIds = selectedFromUrl.filter((id) =>
        hydratedFindings.some((finding: any) => String(finding.id) === id)
      );

      const openedFromEmail = Boolean(
        searchParams.get("role") || searchParams.get("email")
      );

      setFindings(hydratedFindings);
      setSelectedIds(
        validSelectedIds.length
          ? validSelectedIds
          : openedFromEmail
            ? hydratedFindings.map((finding: any) => String(finding.id))
            : []
      );
      setLoading(false);
    }

    loadData();
  }, [inspectionId, supabase, searchParams]);

  const selectedFindings = useMemo(
    () => findings.filter((finding) => selectedIds.includes(String(finding.id))),
    [findings, selectedIds]
  );

  const groupedFindings = useMemo(() => {
    return selectedFindings.reduce((acc: Record<string, Finding[]>, finding) => {
      const section = finding.section || "Other";
      if (!acc[section]) acc[section] = [];
      acc[section].push(finding);
      return acc;
    }, {});
  }, [selectedFindings]);

  const realtorSummary = useMemo(() => {
    if (selectedFindings.length === 0) {
      return "No repair request items have been selected yet.";
    }

    const safetyCount = selectedFindings.filter((finding) => {
      const severity = String(finding.severity || "").toLowerCase();
      return (
        severity.includes("safety") ||
        severity.includes("hazard") ||
        severity.includes("major")
      );
    }).length;

    const sections = Array.from(
      new Set(selectedFindings.map((finding) => finding.section || "Other"))
    ).join(", ");

    return `The buyer respectfully requests correction, repair, evaluation, or further negotiation of ${selectedFindings.length} inspection item(s) identified in the inspection report. ${
      safetyCount > 0
        ? `${safetyCount} item(s) appear to involve safety, major, or higher-priority concerns. `
        : ""
    }The selected items are grouped under the following inspection sections: ${sections}. This repair request summary is intended to assist the parties in negotiating repairs, credits, licensed contractor evaluation, or other mutually agreed resolutions prior to closing.`;
  }, [selectedFindings]);


  const recipientOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; email?: string }> = [];

    const client = contacts.find((contact) => {
      const role = String(contact.role || "").toLowerCase();
      return role.includes("client");
    });

    const realtor = contacts.find((contact) => {
      const role = String(contact.role || "").toLowerCase();
      return role.includes("realtor") || role.includes("agent") || role.includes("transaction");
    });

    if (client?.email || inspection?.client_email) {
      options.push({
        value: "client",
        label: `Client${client?.email || inspection?.client_email ? ` - ${client?.email || inspection?.client_email}` : ""}`,
        email: client?.email || inspection?.client_email,
      });
    }

    if (realtor?.email || inspection?.realtor_email || inspection?.agent_email) {
      options.push({
        value: "realtor",
        label: `Realtor${realtor?.email || inspection?.realtor_email || inspection?.agent_email ? ` - ${realtor?.email || inspection?.realtor_email || inspection?.agent_email}` : ""}`,
        email: realtor?.email || inspection?.realtor_email || inspection?.agent_email,
      });
    }

    if (contacts.length > 1) {
      options.push({ value: "all", label: "All report contacts" });
    }

    contacts.forEach((contact, index) => {
      const email = String(contact.email || "").trim();
      if (!email) return;
      const role = String(contact.role || "contact").trim();
      const name = String(contact.name || "").trim();
      options.push({
        value: `custom-contact-${index}`,
        label: `${name ? `${name} - ` : ""}${role} - ${email}`,
        email,
      });
    });

    options.push({ value: "custom", label: "Custom email address" });

    const seen = new Set<string>();
    return options.filter((option) => {
      const key = `${option.value}:${option.email || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [contacts, inspection]);

  const selectedRecipientOption = recipientOptions.find((option) => option.value === recipientType);

  function toggleFinding(id: string) {
    const cleanId = String(id);
    setSelectedIds((prev) =>
      prev.includes(cleanId) ? prev.filter((item) => item !== cleanId) : [...prev, cleanId]
    );
  }

  function selectSafetyOnly() {
    const safetyIds = findings
      .filter((finding) => {
        const severity = String(finding.severity || "").toLowerCase();
        return (
          severity.includes("safety") ||
          severity.includes("hazard") ||
          severity.includes("major")
        );
      })
      .map((finding) => String(finding.id));

    setSelectedIds(safetyIds);
  }

  async function shareRepairRequestPdf() {
    if (printingPdf) return;

    try {
      setPrintingPdf(true);
      setPdfMessage("Preparing repair request PDF...");

      // Let the button state render before opening the print/share sheet.
      await new Promise((resolve) => setTimeout(resolve, 250));

      window.focus();
      window.print();

      setTimeout(() => {
        setPdfMessage(
          "If the PDF window did not open, use your browser share button and choose Print / Save to PDF."
        );
        setPrintingPdf(false);
      }, 900);
    } catch {
      setPdfMessage(
        "PDF sharing is not supported in this browser. Open this page in Safari/Chrome and choose Print / Save to PDF."
      );
      setPrintingPdf(false);
    }
  }

  async function emailRepairRequest() {
    if (emailingRepairRequest) return;

    if (!selectedIds.length) {
      setEmailMessage("Select at least one finding before emailing the repair request.");
      return;
    }

    const selectedOption = recipientOptions.find((option) => option.value === recipientType);
    const isCustomContact = recipientType.startsWith("custom-contact-");
    const finalRecipientType =
      recipientType === "client" || recipientType === "realtor" || recipientType === "all"
        ? recipientType
        : "custom";
    const finalRecipientEmail =
      recipientType === "custom"
        ? customRecipientEmail.trim()
        : isCustomContact
          ? String(selectedOption?.email || "").trim()
          : "";

    if ((recipientType === "custom" || isCustomContact) && !finalRecipientEmail) {
      setEmailMessage("Enter or select an email address before sending.");
      return;
    }

    try {
      setEmailingRepairRequest(true);
      setEmailMessage("Sending repair request...");

      const response = await fetch("/api/send-repair-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          recipientType: finalRecipientType,
          recipientEmail: finalRecipientEmail || undefined,
          selectedIds,
          summary: realtorSummary,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Repair request email failed to send.");
      }

      setEmailMessage(payload?.message || "Repair request email sent.");
    } catch (error: any) {
      setEmailMessage(error?.message || "Repair request email failed to send.");
    } finally {
      setEmailingRepairRequest(false);
    }
  }

  if (!inspectionId) {
    return (
      <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
        <h1 className="break-words text-3xl font-black text-teal-400">
          Repair Request Builder
        </h1>
        <p className="mt-4 text-slate-300">Missing inspection ID.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
        Loading repair request...
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] p-4 pb-32 text-white md:p-8 md:pb-8">
      <div className="mx-auto max-w-7xl overflow-hidden">
        <div className="mb-6 space-y-3 print:hidden">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Link
              href={`/reports/${inspectionId}`}
              className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-600 bg-[#020617] px-5 py-3 text-center font-bold text-white transition hover:border-slate-300 hover:bg-slate-900 active:scale-[0.98]"
            >
              Back to Report
            </Link>

            <button
              type="button"
              onClick={shareRepairRequestPdf}
              disabled={printingPdf}
              className="min-h-[48px] w-full rounded-xl border border-teal-500 bg-[#020617] px-5 py-3 font-bold text-teal-300 transition hover:border-teal-400 hover:bg-teal-500/10 active:scale-[0.98] disabled:opacity-60"
            >
              {printingPdf ? "Preparing PDF..." : "Share Repair Request PDF"}
            </button>

            <div className="grid w-full grid-cols-1 gap-3 rounded-xl border border-cyan-500 bg-[#020617] p-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:col-span-2">
              <label className="min-w-0">
                <span className="mb-1 block px-1 text-[10px] font-black uppercase tracking-wide text-cyan-300">
                  Send To
                </span>
                <select
                  value={recipientType}
                  onChange={(event) => {
                    setRecipientType(event.target.value);
                    setEmailMessage("");
                  }}
                  className="h-[48px] w-full rounded-lg border border-slate-700 bg-[#020617] px-3 text-sm font-bold text-white outline-none transition focus:border-cyan-400"
                >
                  {recipientOptions.map((option) => (
                    <option key={`${option.value}-${option.email || ""}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={emailRepairRequest}
                disabled={emailingRepairRequest}
                className="min-h-[48px] w-full rounded-xl border border-cyan-500 bg-[#020617] px-5 py-3 font-bold text-cyan-300 transition hover:border-cyan-400 hover:bg-cyan-500/10 active:scale-[0.98] disabled:opacity-60 sm:mt-[18px] sm:w-auto"
              >
                {emailingRepairRequest ? "Sending..." : "Email Repair Request"}
              </button>

              {recipientType === "custom" ? (
                <input
                  value={customRecipientEmail}
                  onChange={(event) => setCustomRecipientEmail(event.target.value)}
                  placeholder="email@example.com"
                  type="email"
                  className="h-[48px] w-full rounded-lg border border-slate-700 bg-[#020617] px-3 text-sm font-bold text-white outline-none transition focus:border-cyan-400 sm:col-span-2"
                />
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => setShowAddendum(!showAddendum)}
              className="min-h-[48px] w-full rounded-xl border border-purple-500 bg-[#020617] px-5 py-3 font-bold text-purple-300 transition hover:border-purple-400 hover:bg-purple-500/10 active:scale-[0.98]"
            >
              {showAddendum ? "Hide Addendum" : "Export Negotiation Addendum"}
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds(findings.map((finding) => String(finding.id)))}
              className="min-h-[48px] w-full rounded-xl border border-teal-500 bg-[#020617] px-5 py-3 font-bold text-teal-300 transition hover:border-teal-400 hover:bg-teal-500/10 active:scale-[0.98]"
            >
              Select All
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="min-h-[48px] w-full rounded-xl border border-red-500 bg-[#020617] px-5 py-3 font-bold text-red-300 transition hover:border-red-400 hover:bg-red-500/10 active:scale-[0.98]"
            >
              Clear All
            </button>

            <button
              type="button"
              onClick={selectSafetyOnly}
              className="min-h-[48px] w-full rounded-xl border border-orange-500 bg-[#020617] px-5 py-3 font-bold text-orange-300 transition hover:border-orange-400 hover:bg-orange-500/10 active:scale-[0.98]"
            >
              Safety Only
            </button>
          </div>
        </div>

        {pdfMessage ? (
          <p className="mb-6 rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-bold text-teal-200 print:hidden">
            {pdfMessage}
          </p>
        ) : null}

        {emailMessage ? (
          <p className="mb-6 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-200 print:hidden">
            {emailMessage}
          </p>
        ) : null}

        <section className="mb-8 overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-xl md:p-6">
          <p className="break-words text-sm font-bold uppercase tracking-[0.22em] text-teal-400 md:tracking-[0.3em]">
            On Point Home Inspections
          </p>

          <h1 className="mt-3 break-words text-3xl font-black text-white md:text-4xl">
            Repair Request Summary
          </h1>

          <p className="mt-3 break-words text-slate-300">
            {inspection?.property_address ||
              inspection?.address ||
              "Property address not entered"}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <Info label="Client" value={inspection?.client_name} />
            <Info label="Realtor" value={inspection?.realtor_name} />
            <Info label="Date" value={inspection?.inspection_date} />
            <Info label="Selected Items" value={selectedFindings.length} />
          </div>
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl border border-teal-500/30 bg-[#071224] p-5 md:p-6">
          <h2 className="mb-3 break-words text-2xl font-bold text-teal-300">
            Generate Realtor Summary
          </h2>

          <div className="rounded-xl border border-slate-700 bg-[#020617] p-4 text-slate-200">
            <p className="whitespace-pre-line break-words leading-7">
              {realtorSummary}
            </p>
          </div>
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl border border-slate-800 bg-[#071224] p-5 md:p-6">
          <h2 className="mb-3 break-words text-2xl font-bold text-teal-300">
            Request Language
          </h2>

          <textarea
            value={requestIntro}
            onChange={(e) => setRequestIntro(e.target.value)}
            rows={4}
            className="w-full max-w-full rounded-xl border border-slate-700 bg-[#020617] p-4 text-white outline-none focus:border-teal-400"
          />
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a] p-5 print:hidden md:p-6">
          <h2 className="mb-4 break-words text-2xl font-bold text-teal-300">
            Select Findings
          </h2>

          <div className="space-y-3">
            {findings.map((finding) => {
              const selected = selectedIds.includes(String(finding.id));

              return (
                <label
                  key={finding.id}
                  className={`block w-full max-w-full cursor-pointer overflow-hidden rounded-xl border bg-[#020617] p-4 transition ${
                    selected
                      ? "border-teal-400 ring-1 ring-teal-400/40"
                      : "border-slate-700 hover:border-teal-500"
                  }`}
                >
                  <div className="flex w-full max-w-full flex-col gap-4 sm:flex-row sm:items-start">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleFinding(String(finding.id))}
                      className="h-6 w-6 shrink-0 accent-teal-400"
                    />

                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="mb-2 flex max-w-full flex-wrap gap-2">
                        <span
                          className={`max-w-full break-words rounded-full border px-3 py-1 text-xs font-bold uppercase ${getSeverityStyle(
                            finding.severity
                          )}`}
                        >
                          {finding.severity || "Recommended Repair"}
                        </span>

                        <span className="max-w-full break-words rounded-full border border-slate-600 px-3 py-1 text-xs font-bold uppercase text-slate-300">
                          {finding.section || "Other"}
                        </span>
                      </div>

                      <p className="break-words font-bold text-white">
                        {finding.title || "Untitled Finding"}
                      </p>

                      <p className="mt-1 line-clamp-3 break-words text-sm leading-6 text-slate-400">
                        {finding.recommendation || finding.observation || ""}
                      </p>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {showAddendum && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-purple-500/40 bg-white p-5 text-black md:p-6">
            <h2 className="mb-4 break-words text-3xl font-black text-slate-950">
              Negotiation Addendum Draft
            </h2>

            <p className="mb-6 break-words leading-7 text-slate-700">
              Buyer requests that seller address the following inspection items by repair, licensed contractor evaluation, replacement, seller credit, or other mutually agreed resolution.
            </p>

            <div className="space-y-4">
              {selectedFindings.map((finding, index) => (
                <div
                  key={finding.id}
                  className="overflow-hidden rounded-xl border border-slate-300 p-4"
                >
                  <p className="break-words font-black text-slate-950">
                    {index + 1}. {finding.title}
                  </p>
                  <p className="mt-2 break-words text-slate-700">
                    Requested Action:{" "}
                    {finding.recommendation ||
                      finding.observation ||
                      "Further evaluation/repair requested."}
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 p-3">
                      <input type="checkbox" className="h-4 w-4 accent-teal-600" />
                      <span>Seller to Repair</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 p-3">
                      <input type="checkbox" className="h-4 w-4 accent-teal-600" />
                      <span>Credit Offered</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 p-3">
                      <input type="checkbox" className="h-4 w-4 accent-teal-600" />
                      <span>Further Evaluation</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <p className="font-bold">Buyer Signature:</p>
                <div className="mt-10 border-b border-slate-500" />
              </div>
              <div>
                <p className="font-bold">Seller Response / Signature:</p>
                <div className="mt-10 border-b border-slate-500" />
              </div>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-white p-5 text-black md:p-6">
          <h2 className="mb-4 break-words text-3xl font-black text-slate-950">
            Requested Repairs / Corrections
          </h2>

          <p className="mb-8 break-words leading-7 text-slate-700">
            {requestIntro}
          </p>

          {selectedFindings.length === 0 ? (
            <p>No findings selected.</p>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedFindings).map(([section, items]) => (
                <div key={section}>
                  <h3 className="mb-4 break-words border-b border-slate-300 pb-2 text-2xl font-black text-slate-950">
                    {section}
                  </h3>

                  <div className="space-y-5">
                    {items.map((finding, index) => {
                      const firstPhoto = finding.photos?.[0];

                      return (
                        <article
                          key={finding.id}
                          className="break-inside-avoid overflow-hidden rounded-xl border border-slate-300 p-5"
                        >
                          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h4 className="break-words text-xl font-black text-slate-950">
                              {index + 1}. {finding.title}
                            </h4>

                            <span className="w-fit max-w-full break-words rounded-full border border-slate-400 px-3 py-1 text-xs font-bold uppercase text-slate-700">
                              {finding.severity || "Recommended Repair"}
                            </span>
                          </div>

                          {firstPhoto?.signed_url && (
                            <img
                              src={firstPhoto.signed_url}
                              alt="Finding"
                              className="mb-4 max-h-[320px] w-full rounded-lg border border-slate-300 object-contain"
                            />
                          )}

                          {finding.observation && (
                            <ReportText title="Observation" text={finding.observation} />
                          )}

                          {finding.implication && (
                            <ReportText title="Implication" text={finding.implication} />
                          )}

                          {finding.recommendation && (
                            <ReportText
                              title="Requested Action"
                              text={finding.recommendation}
                            />
                          )}

                          <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
                            <p className="font-bold text-slate-900">
                              Seller Response Section:
                            </p>

                            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                              {["Completed", "Declined", "Credit Offered", "Receipt Provided"].map((label) => (
                                <label
                                  key={label}
                                  className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border border-slate-300 bg-white p-5 text-center shadow-sm transition hover:border-teal-500 hover:bg-teal-50"
                                >
                                  <span className="mb-4 text-base font-bold leading-5 text-slate-900">
                                    {label}
                                  </span>
                                  <input
                                    type="checkbox"
                                    className="h-7 w-7 accent-teal-600"
                                  />
                                </label>
                              ))}
                            </div>

                            <label className="mt-4 block font-bold text-slate-900">
                              Notes:
                              <textarea
                                rows={3}
                                className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none focus:border-teal-500 print:border-slate-300"
                                placeholder="Seller response notes..."
                              />
                            </label>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function RepairRequestPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#020617] p-8 text-white">
          Loading repair request...
        </main>
      }
    >
      <RepairRequestContent />
    </Suspense>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-[#020617] p-4">
      <p className="break-words text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words font-bold text-white">{value || "N/A"}</p>
    </div>
  );
}

function ReportText({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-3">
      <p className="break-words font-black text-slate-950">{title}:</p>
      <p className="mt-1 whitespace-pre-line break-words leading-7 text-slate-700">
        {text}
      </p>
    </div>
  );
}
