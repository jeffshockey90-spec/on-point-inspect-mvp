"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { flowConfirm } from "./ConfirmProvider";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { refreshKeepScroll } from "../lib/refreshKeepScroll";
import { markLocalEdit } from "../lib/localEditSignal";
import { useToastStackIndex } from "../lib/toastStack";
import { useSeverityConfig } from "../lib/severity/useSeverityConfig";
import { severityOptions } from "../lib/severity/severityConfig";

const SECTIONS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];


// One entry in the defect card's "More" (⋯) menu, supplied by the card.
export type FindingMenuItem = {
  key: string;
  icon: string;
  label: string;
  onSelect: () => void;
};

function EditableFinding({
  finding,
  availableSections,
  onAddMedia,
  mediaOpen,
  aiNote,
  menuItems,
  menuTailItems,
}: {
  finding: any;
  availableSections?: string[];
  /** "Media" button in the action row (the card owns the upload panel). */
  onAddMedia?: () => void;
  mediaOpen?: boolean;
  /** The card's AI note box, shown inside the AI panel above "Rewrite softer". */
  aiNote?: ReactNode;
  /** Card-level actions listed first in the ⋯ menu. */
  menuItems?: FindingMenuItem[];
  /** Card-level actions listed after this editor's own, just above Delete. */
  menuTailItems?: FindingMenuItem[];
}) {
  const router = useRouter();

  // Built-in sections plus any custom sections on this inspection, and the
  // finding's own current section, so it can be moved into (or stay in) a
  // custom section - not just the 12 built-ins. Deduped, order preserved.
  const sectionOptions = Array.from(
    new Set(
      [...SECTIONS, ...(availableSections || []), finding.section].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );

  const [editing, setEditing] = useState(false);

  const [title, setTitle] = useState(finding.title || "");
  const [section, setSection] = useState(finding.section || "Exterior");
  const [severity, setSeverity] = useState(
    finding.severity || "Recommended Repair"
  );
  const severityConfig = useSeverityConfig();
  const severityChoices = (() => {
    const opts = severityOptions(severityConfig);
    return severity && !opts.includes(severity) ? [...opts, severity] : opts;
  })();
  const [location, setLocation] = useState(finding.location || "");
  const [observation, setObservation] = useState(finding.observation || "");
  const [implication, setImplication] = useState(finding.implication || "");
  const [recommendation, setRecommendation] = useState(
    finding.recommendation || ""
  );

  const [repairRequest, setRepairRequest] = useState(
    finding.repair_request || false
  );
  const [repairPriority, setRepairPriority] = useState(
    finding.repair_priority || "Recommended"
  );
  const [repairNotes, setRepairNotes] = useState(finding.repair_notes || "");

  const [saving, setSaving] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [savingRepair, setSavingRepair] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [movePanelOpen, setMovePanelOpen] = useState(false);
  const [movingSection, setMovingSection] = useState(false);
  const [moveTargetSection, setMoveTargetSection] = useState(
    finding.section || "Exterior",
  );
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [repairPanelOpen, setRepairPanelOpen] = useState(false);
  const [quickStatus, setQuickStatus] = useState<
    "complete" | "needs_photo" | "needs_implication" | ""
  >("");
  const swipeStartXRef = useRef(0);

  const [saveLabel, setSaveLabel] = useState("Save Finding");
  const [repairLabel, setRepairLabel] = useState("Save Repair Request");
  const [rewriteLabel, setRewriteLabel] = useState("AI Rewrite Softer");
  const [deleteLabel, setDeleteLabel] = useState("Delete Finding");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        `opi-finding-quick-status-${String(finding.id)}`,
      ) as "complete" | "needs_photo" | "needs_implication" | null;
      setQuickStatus(saved || "");
    } catch {}
  }, [finding.id]);

  const learningBaselineRef = useRef({
    title: finding.title || "",
    section: finding.section || "",
    severity: finding.severity || "",
    observation: finding.observation || "",
    implication: finding.implication || "",
    recommendation: finding.recommendation || "",
  });
  // The repair-request controls live OUTSIDE the `editing` flag (they're in the
  // always-visible Quick Tools row), so the prop-sync effect below would reset
  // them mid-typing if an unrelated external change (e.g. an AI auto-retitle)
  // bumped the finding. This tracks unsaved repair edits so the re-seed skips
  // them until they're saved.
  const repairDirtyRef = useRef(false);

  // Keep the editor's fields in sync with the finding as it changes on disk —
  // an AI rewrite (AI Inspector note / auto-retitle) or another device editing
  // the same finding. WITHOUT this, the editor kept whatever it loaded on first
  // mount, so the next "Save Finding" silently REVERTED those changes back to
  // the stale values (the old remount-key relied on a non-existent `updated_at`
  // column and omitted severity/implication/recommendation, so it didn't catch
  // most edits). We re-seed only while the inspector is NOT actively editing, so
  // in-progress typing is never stomped.
  const persistedSignature = [
    finding.title,
    finding.section,
    finding.severity,
    finding.location,
    finding.observation,
    finding.implication,
    finding.recommendation,
    finding.repair_request,
    finding.repair_priority,
    finding.repair_notes,
  ]
    .map((value) => String(value ?? ""))
    .join("\u0001");

  useEffect(() => {
    if (editing) return; // never overwrite an active edit in progress
    setTitle(finding.title || "");
    setSection(finding.section || "Exterior");
    setSeverity(finding.severity || "Recommended Repair");
    setLocation(finding.location || "");
    setObservation(finding.observation || "");
    setImplication(finding.implication || "");
    setRecommendation(finding.recommendation || "");
    // Don't stomp unsaved repair-request edits (they're edited outside `editing`).
    if (!repairDirtyRef.current) {
      setRepairRequest(finding.repair_request || false);
      setRepairPriority(finding.repair_priority || "Recommended");
      setRepairNotes(finding.repair_notes || "");
    }
    learningBaselineRef.current = {
      title: finding.title || "",
      section: finding.section || "",
      severity: finding.severity || "",
      observation: finding.observation || "",
      implication: finding.implication || "",
      recommendation: finding.recommendation || "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedSignature]);

  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 3500);
  }

  async function saveFinding() {
    if (saving) return;

    setSaving(true);
    setSaveLabel("Saving...");

    try {
      const payload: Record<string, any> = {
        title,
        section,
        severity,
        location: location.trim() || null,
        observation,
        implication,
        recommendation,
        repair_request: repairRequest,
        repair_priority: repairPriority,
        repair_notes: repairNotes,
      };

      let { error } = await supabase
        .from("findings")
        .update(payload)
        .eq("id", finding.id);

      // `location` is an optional column. If this database doesn't have it yet
      // (older schema), drop it and save everything else so the finding still
      // updates — this was causing "Failed to save" on any finding edit.
      if (error && /location/i.test(error.message || "")) {
        const { location: _omitLocation, ...withoutLocation } = payload;
        ({ error } = await supabase
          .from("findings")
          .update(withoutLocation)
          .eq("id", finding.id));
      }

      if (error) {
        setSaveLabel("Failed");
        showMessage("error", error.message);
        return;
      }

      // Open the echo-suppression window NOW — the moment the DB write lands,
      // before the awaited learning/retitle calls below. The realtime echo of
      // this update fires immediately and RealtimeReportSync checks
      // wasRecentLocalEdit() ~800ms later; on mobile the learning POST can take
      // longer than that, so marking only inside refreshKeepScroll (after the
      // await) missed the window → a redundant full reload ~1s after "Saved!".
      markLocalEdit();

      const updatedLearningValue = {
        title,
        section,
        severity,
        observation,
        implication,
        recommendation,
      };
      const originalLearningValue = learningBaselineRef.current;
      const hasInspectorChanges =
        JSON.stringify(originalLearningValue) !==
        JSON.stringify(updatedLearningValue);

      if (hasInspectorChanges) {
        try {
          await fetch("/api/ai/learning", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inspectionId: finding.inspection_id,
              tool: "editable_finding",
              original: originalLearningValue,
              updated: updatedLearningValue,
              accepted: true,
              notes:
                "Inspector edited a finding. Learn wording, severity, and section-routing preferences from the exact before/after values.",
            }),
          });
        } catch {
          // Learning must never block saving a finding.
        }
      }

      learningBaselineRef.current = updatedLearningValue;

      // Auto-correct the title to match the new content — but ONLY when the body
      // changed AND the inspector didn't type their own title (a manual title is
      // always respected). Runs in the background so it never blocks the save;
      // when it returns it updates the title in place. This is why a defect's
      // wording could change while its title stayed stale.
      const bodyChanged =
        observation.trim() !== originalLearningValue.observation.trim() ||
        implication.trim() !== originalLearningValue.implication.trim() ||
        recommendation.trim() !== originalLearningValue.recommendation.trim();
      const titleUntouched = title.trim() === originalLearningValue.title.trim();
      if (bodyChanged && titleUntouched) {
        void (async () => {
          try {
            const res = await fetch("/api/findings/retitle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                inspectionId: finding.inspection_id,
                findingId: finding.id,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.title) {
              setTitle(data.title);
              learningBaselineRef.current = {
                ...learningBaselineRef.current,
                title: data.title,
              };
              // Patch just this finding's title in the report card instead of a
              // SECOND full router.refresh(). The save already refreshed once;
              // the AI retitle lands a beat later, and a second refresh caused a
              // visible flicker/scroll-settle ~1s after "Saved!" ("it twitched
              // again on its own"). The card listens for this and updates the
              // title in place — no refetch.
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("opi:finding-retitled", {
                    detail: { findingId: finding.id, title: data.title },
                  }),
                );
              }
            }
          } catch {
            /* leave the existing title if retitle fails */
          }
        })();
      }

      setSaveLabel("Saved!");
      showMessage("success", "Finding saved.");
      setEditing(false);

      // Patch the card in place instead of a full server re-render. The whole-
      // report router.refresh() on every save was the main scroll glitch: it
      // re-rendered the entire ~11-query tree while refreshKeepScroll's restore
      // chase fired across 1.8s as every card re-mounted and re-measured. The
      // row is already persisted and markLocalEdit() ran above; the report page
      // listens for opi:finding-updated and merges the saved fields into local
      // state (so the card AND the House Graph stay in sync) with no refetch.
      // Changing the SECTION still needs a refresh so the card moves groups.
      const sectionChanged = section !== (finding.section || "");
      if (sectionChanged) {
        refreshKeepScroll(router);
      } else if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("opi:finding-updated", {
            detail: {
              inspectionId: String(finding.inspection_id || ""),
              findingId: String(finding.id || ""),
              patch: payload,
            },
          }),
        );
      }
    } catch (error: any) {
      setSaveLabel("Failed");
      showMessage("error", error?.message || "Failed to save finding.");
    } finally {
      window.setTimeout(() => {
        setSaving(false);
        setSaveLabel("Save Finding");
      }, 700);
    }
  }

  async function saveRepairRequestSettings(): Promise<boolean> {
    if (savingRepair) return false;

    setSavingRepair(true);
    setRepairLabel("Saving...");

    try {
      const { error } = await supabase
        .from("findings")
        .update({
          repair_request: repairRequest,
          repair_priority: repairPriority,
          repair_notes: repairNotes,
        })
        .eq("id", finding.id);

      if (error) {
        setRepairLabel("Failed");
        showMessage("error", error.message);
        return false;
      }

      repairDirtyRef.current = false; // persisted now matches; safe to re-seed
      markLocalEdit();
      setRepairLabel("Saved!");
      showMessage("success", "Repair request saved.");
      // Patch the card in place (same as a finding save) instead of a full
      // builder refresh + scroll-restore, which made the page jump.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("opi:finding-updated", {
            detail: {
              inspectionId: String(finding.inspection_id || ""),
              findingId: String(finding.id || ""),
              patch: {
                repair_request: repairRequest,
                repair_priority: repairPriority,
                repair_notes: repairNotes,
              },
            },
          }),
        );
      }
      return true;
    } catch (error: any) {
      setRepairLabel("Failed");
      showMessage("error", error?.message || "Failed to save repair request.");
      return false;
    } finally {
      window.setTimeout(() => {
        setSavingRepair(false);
        setRepairLabel("Save Repair Request");
      }, 700);
    }
  }

  async function rewriteSofter() {
    if (rewriting) return;

    setRewriting(true);
    setRewriteLabel("Rewriting...");

    try {
      const response = await fetch("/api/rewrite-finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          observation,
          implication,
          recommendation,
        }),
      });

      const data = await response.json();

      if (!data.rewritten) {
        setRewriteLabel("Failed");
        showMessage("error", "Failed to rewrite finding");
        return;
      }

      setRewriteLabel("Saving Rewrite...");

      const { error } = await supabase
        .from("findings")
        .update({
          recommendation: data.rewritten,
        })
        .eq("id", finding.id);

      if (error) {
        setRewriteLabel("Failed");
        showMessage("error", error.message);
        return;
      }

      setRecommendation(data.rewritten);
      setRewriteLabel("Rewritten!");
      showMessage("success", "Finding rewritten.");
      markLocalEdit();
      // Patch the card in place (same as a finding save) instead of a full
      // builder refresh + scroll-restore, which made the page jump.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("opi:finding-updated", {
            detail: {
              inspectionId: String(finding.inspection_id || ""),
              findingId: String(finding.id || ""),
              patch: { recommendation: data.rewritten },
            },
          }),
        );
      }
    } catch (error: any) {
      setRewriteLabel("Failed");
      showMessage("error", error?.message || "Failed to rewrite finding.");
    } finally {
      window.setTimeout(() => {
        setRewriting(false);
        setRewriteLabel("AI Rewrite Softer");
      }, 700);
    }
  }

  async function moveFindingToSection() {
    if (movingSection) return;

    const nextSection = String(moveTargetSection || "").trim();
    const currentSection = String(finding.section || section || "").trim();

    if (!nextSection) {
      showMessage("error", "Choose a section first.");
      return;
    }

    if (nextSection === currentSection) {
      setMovePanelOpen(false);
      showMessage("success", `Finding is already in ${nextSection}.`);
      return;
    }

    setMovingSection(true);

    try {
      const { error } = await supabase
        .from("findings")
        .update({ section: nextSection })
        .eq("id", finding.id)
        .eq("inspection_id", finding.inspection_id);

      if (error) {
        showMessage("error", error.message);
        return;
      }

      // Open the echo-suppression window co-located with the write (the parent's
      // opi:findings-changed listener also marks via refreshKeepScroll, but this
      // guarantees it regardless of listener timing).
      markLocalEdit();

      setSection(nextSection);
      setMovePanelOpen(false);
      showMessage("success", `Finding moved to ${nextSection}.`);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("opi:findings-changed", {
            detail: {
              inspectionId: String(finding.inspection_id || ""),
              findingId: String(finding.id || ""),
              section: nextSection,
              previousSection: currentSection,
              action: "moved",
            },
          }),
        );

        window.dispatchEvent(
          new CustomEvent("opi:inspection-data-changed", {
            detail: {
              inspectionId: String(finding.inspection_id || ""),
              source: "move-finding-section",
            },
          }),
        );
      }

      // The builder's opi:findings-changed listener already un-collapses the
      // target section and runs a single refreshKeepScroll — calling it here too
      // fired a second refresh/restore-dance for one move. Let the listener own it.
    } catch (error: any) {
      showMessage(
        "error",
        error?.message || "Failed to move finding to the selected section.",
      );
    } finally {
      setMovingSection(false);
    }
  }

  function getQuickStatusKey() {
    return `opi-finding-quick-status-${String(finding.id)}`;
  }

  function setPersistentQuickStatus(
    next: "complete" | "needs_photo" | "needs_implication" | "",
  ) {
    setQuickStatus(next);

    try {
      if (next) {
        window.localStorage.setItem(getQuickStatusKey(), next);
      } else {
        window.localStorage.removeItem(getQuickStatusKey());
      }
    } catch {}
  }

  async function duplicateFinding() {
    try {
      const { data: duplicated, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: finding.inspection_id,
          title: `${finding.title || "Finding"} Copy`,
          section: finding.section,
          severity: finding.severity,
          observation: finding.observation,
          implication: finding.implication,
          recommendation: finding.recommendation,
          image_url: finding.image_url || null,
        })
        .select()
        .single();

      if (error) throw error;

      if (Array.isArray(finding.photos) && finding.photos.length > 0) {
        const rows = finding.photos.map((photo: any) => ({
          inspection_id: finding.inspection_id,
          finding_id: duplicated.id,
          public_url: photo.public_url,
          file_path: photo.file_path || photo.storage_path || null,
          is_video: Boolean(photo.is_video),
          mime_type: photo.mime_type || null,
          thumbnail_url: photo.thumbnail_url || null,
          thumbnail_path: photo.thumbnail_path || null,
        }));

        const { error: photoError } = await supabase.from("photos").insert(rows);
        if (photoError) throw photoError;
      }

      showMessage("success", "Finding duplicated.");
      refreshKeepScroll(router);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to duplicate finding.");
    }
  }

  function handleQuickSwipeStart(event: React.TouchEvent<HTMLDivElement>) {
    swipeStartXRef.current = event.touches[0]?.clientX || 0;
  }

  function handleQuickSwipeEnd(event: React.TouchEvent<HTMLDivElement>) {
    const endX = event.changedTouches[0]?.clientX || 0;
    const delta = endX - swipeStartXRef.current;

    if (delta < -55) setQuickActionsOpen(true);
    if (delta > 55) setQuickActionsOpen(false);
  }

  async function deleteFinding() {
    if (deleting) return;

    const confirmed = await flowConfirm({
      title: "Delete Finding",
      message: "Delete this finding?",
      confirmText: "Delete Finding",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeleting(true);
    setDeleteLabel("Deleting...");

    try {
      const { error } = await supabase
        .from("findings")
        .delete()
        .eq("id", finding.id);

      if (error) {
        setDeleteLabel("Failed");
        showMessage("error", error.message);
        return;
      }

      setDeleteLabel("Deleted!");
      showMessage("success", "Finding deleted.");
      // Mark the edit so RealtimeReportSync ignores this delete's DB echo
      // instead of firing the full refresh this instant-delete path avoids.
      markLocalEdit();
      // Drop the card from the list INSTANTLY instead of re-fetching the whole
      // report — the row is already gone from the DB. The report page listens
      // for this and removes it from local state right away, so deleting a
      // finding feels immediate (the full router.refresh() used to re-run the
      // entire ~11–13-query server load before the card disappeared).
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("opi:finding-deleted", {
            detail: {
              inspectionId: String(finding.inspection_id || ""),
              findingId: String(finding.id || ""),
            },
          }),
        );
      }
    } catch (error: any) {
      setDeleteLabel("Failed");
      showMessage("error", error?.message || "Failed to delete finding.");
    } finally {
      window.setTimeout(() => {
        setDeleting(false);
        setDeleteLabel("Delete Finding");
      }, 700);
    }
  }

  function Spinner({ active }: { active: boolean }) {
    if (!active) return null;

    return (
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    );
  }

  if (!editing) {
    const rowBtn =
      "inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]";
    const idleBtn = "border-[var(--fl-line)] bg-[var(--fl-surface)] text-[var(--fl-text)] hover:bg-[var(--fl-raised)]";
    const menuRow =
      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)] disabled:opacity-60 [touch-action:manipulation]";
    const pick = (fn: () => void) => () => {
      setMoreOpen(false);
      fn();
    };
    const ownItems: FindingMenuItem[] = [
      {
        key: "move-section",
        icon: "↪",
        label: "Move to another section",
        onSelect: () => {
          setMoveTargetSection(String(finding.section || section || "Exterior"));
          setMovePanelOpen(true);
        },
      },
      {
        key: "repair",
        icon: "🧾",
        label: repairRequest ? "Repair request settings" : "Add to repair request",
        onSelect: () => {
          if (!repairRequest) {
            repairDirtyRef.current = true;
            setRepairRequest(true);
          }
          setRepairPanelOpen(true);
        },
      },
    ];
    const allItems = [...(menuItems || []), ...ownItems, ...(menuTailItems || [])];

    return (
      <div className="w-full max-w-full space-y-3 print:hidden">
        <InlineStatusMessage type={messageType} message={message} />

        <div className="grid w-full grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`${rowBtn} border-teal-500 bg-teal-500 text-slate-950 hover:bg-teal-400`}
          >
            ✎ Edit
          </button>
          {onAddMedia && (
            <button
              type="button"
              onClick={onAddMedia}
              aria-expanded={!!mediaOpen}
              className={`${rowBtn} ${mediaOpen ? "border-teal-500 text-[var(--fl-accent-text)]" : idleBtn}`}
            >
              📷 Media
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setAiOpen((v) => !v);
              setMoreOpen(false);
            }}
            aria-expanded={aiOpen}
            className={`${rowBtn} ${aiOpen ? "border-purple-400 bg-purple-500/10 text-[var(--fl-purple-text)]" : idleBtn} ${onAddMedia ? "" : "col-span-2"}`}
          >
            ✨ AI
          </button>
          <button
            type="button"
            onClick={() => {
              setMoreOpen((v) => !v);
              setAiOpen(false);
            }}
            aria-expanded={moreOpen}
            aria-label="More actions"
            title="More actions"
            className={`${rowBtn} w-12 text-lg ${moreOpen ? "border-teal-500 text-[var(--fl-accent-text)]" : `${idleBtn} text-[var(--fl-muted)]`}`}
          >
            ⋯
          </button>
        </div>

        {moreOpen && (
          <div className="w-full rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-1.5 shadow-xl">
            {allItems.map((item) => (
              <button key={item.key} type="button" onClick={pick(item.onSelect)} className={menuRow}>
                <span aria-hidden className="w-5 shrink-0 text-center">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <div className="mx-1 my-1.5 h-px bg-[var(--fl-line)]" />
            <button
              type="button"
              onClick={pick(() => void deleteFinding())}
              disabled={deleting}
              className={`${menuRow} text-[var(--fl-crit-text)] hover:bg-red-500/10`}
            >
              <span aria-hidden className="w-5 shrink-0 text-center">🗑</span>
              {deleting ? deleteLabel : "Delete finding…"}
            </button>
          </div>
        )}

        {aiOpen && (
          <div className="w-full max-w-full space-y-3 rounded-2xl border border-purple-500/40 bg-purple-500/10 p-3 sm:p-4">
            {aiNote}
            <button
              type="button"
              onClick={rewriteSofter}
              disabled={rewriting}
              aria-busy={rewriting}
              className={`${rowBtn} w-full ${idleBtn} sm:w-auto sm:px-5`}
            >
              <Spinner active={rewriting} />
              {rewriteLabel === "AI Rewrite Softer" ? "Rewrite softer" : rewriteLabel}
            </button>
          </div>
        )}

        {repairPanelOpen && (
          <div className="w-full max-w-full rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-accent-text)]">
              Repair request
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-[var(--fl-text)]">
              <input
                type="checkbox"
                checked={!!repairRequest}
                onChange={(e) => {
                  repairDirtyRef.current = true;
                  setRepairRequest(e.target.checked);
                }}
                disabled={savingRepair}
                className="h-4 w-4 accent-teal-400"
              />
              Include on the repair request
            </label>
            {repairRequest && (
              <div className="mt-3 grid w-full max-w-full gap-2 md:grid-cols-2">
                <select
                  value={repairPriority}
                  onChange={(e) => {
                    repairDirtyRef.current = true;
                    setRepairPriority(e.target.value);
                  }}
                  disabled={savingRepair}
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-sm font-bold text-[var(--fl-text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option>Safety</option>
                  <option>Major</option>
                  <option>Recommended</option>
                  <option>Informational</option>
                </select>
                <textarea
                  placeholder="Repair request notes..."
                  value={repairNotes}
                  onChange={(e) => {
                    repairDirtyRef.current = true;
                    setRepairNotes(e.target.value);
                  }}
                  disabled={savingRepair}
                  className="min-h-[76px] w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-sm font-bold leading-6 text-[var(--fl-text)] disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
                />
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  if (await saveRepairRequestSettings()) setRepairPanelOpen(false);
                }}
                disabled={savingRepair}
                aria-busy={savingRepair}
                className={`${rowBtn} border-teal-500 bg-teal-500 px-4 text-slate-950 hover:bg-teal-400`}
              >
                <Spinner active={savingRepair} />
                {savingRepair ? repairLabel : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setRepairPanelOpen(false)}
                disabled={savingRepair}
                className={`${rowBtn} ${idleBtn} px-4`}
              >
                Close
              </button>
            </div>
          </div>
        )}
        {movePanelOpen && (
          <div className="w-full max-w-full rounded-2xl border border-purple-500/60 bg-purple-500/10 p-3 shadow-xl sm:p-4">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-purple-text)]">
                Move Finding
              </p>
              <p className="mt-1 text-sm font-bold text-[var(--fl-muted)]">
                Current section: {String(finding.section || section || "Unknown")}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">
                Photos, videos, wording, severity, and repair-request settings stay attached.
              </p>
            </div>

            <select
              value={moveTargetSection}
              onChange={(event) => setMoveTargetSection(event.target.value)}
              disabled={movingSection}
              className="min-h-[48px] w-full rounded-xl border border-purple-500/50 bg-[var(--fl-ground)] p-3 text-base font-semibold text-[var(--fl-text)] outline-none focus:border-purple-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sectionOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={moveFindingToSection}
                disabled={
                  movingSection ||
                  !moveTargetSection ||
                  moveTargetSection === String(finding.section || section || "")
                }
                aria-busy={movingSection}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
              >
                <Spinner active={movingSection} />
                {movingSection ? "Moving..." : "Move Now"}
              </button>

              <button
                type="button"
                onClick={() => setMovePanelOpen(false)}
                disabled={movingSection}
                className="min-h-[46px] rounded-xl border border-[var(--fl-line)] px-4 py-3 text-sm font-semibold text-[var(--fl-text)] transition active:scale-[0.98] hover:bg-[var(--fl-raised)] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 w-full max-w-full space-y-3 overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-3 print:hidden sm:p-5">
      <InlineStatusMessage type={messageType} message={message} />
      <Input label="Title" value={title} onChange={setTitle} disabled={saving} />

      <Input
        label="Location"
        value={location}
        onChange={setLocation}
        disabled={saving}
        placeholder="e.g. Northeast corner, Master bathroom"
      />

      <div className="grid w-full max-w-full gap-3 md:grid-cols-2">
        <Select
          label="Section"
          value={section}
          onChange={setSection}
          options={sectionOptions}
          disabled={saving}
        />

        <Select
          label="Severity"
          value={severity}
          onChange={setSeverity}
          options={severityChoices}
          disabled={saving}
        />
      </div>

      <Textarea
        label="Observation"
        value={observation}
        onChange={setObservation}
        disabled={saving}
      />

      <Textarea
        label="Implication"
        value={implication}
        onChange={setImplication}
        disabled={saving}
      />

      <Textarea
        label="Recommendation"
        value={recommendation}
        onChange={setRecommendation}
        disabled={saving}
      />

      <div className="sticky bottom-2 z-30 grid w-full grid-cols-2 gap-2 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-2 shadow-2xl sm:static sm:flex sm:flex-row sm:flex-wrap sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <button
          type="button"
          onClick={saveFinding}
          disabled={saving}
          aria-busy={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-3 text-sm font-semibold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
        >
          <Spinner active={saving} />
          {saveLabel}
        </button>

        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--fl-line)] px-4 py-3 text-sm font-semibold text-[var(--fl-text)] transition active:scale-[0.98] hover:bg-[var(--fl-raised)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function InlineStatusMessage({
  type,
  message,
}: {
  type: "success" | "error" | "";
  message: string;
}) {
  // Stack this toast above any others already showing (one finding per toast,
  // all fixed to the same spot) so running AI Inspector on two findings in
  // quick succession doesn't pile their messages on top of each other.
  const stackIndex = useToastStackIndex(!!message);

  if (!message) return null;
  if (typeof document === "undefined") return null;

  const isSuccess = type === "success";

  // Fixed floating toast, not inline — so showing/clearing a status doesn't push
  // the finding content up and down (which made the screen jump around).
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[2147482000] flex justify-center px-4"
      style={{ bottom: `calc(1rem + ${stackIndex * 3.5}rem)` }}
    >
      <div
        className={`pointer-events-auto max-w-md rounded-xl border p-3 text-sm font-bold shadow-xl ${
          isSuccess
            ? "border-emerald-500 bg-emerald-500/10 text-[var(--fl-good-text)]"
            : "border-red-500 bg-red-500/10 text-[var(--fl-crit-text)]"
        }`}
      >
        {message}
      </div>
    </div>,
    document.body,
  );
}

function Input({
  label,
  value,
  onChange,
  disabled = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-[var(--fl-muted)]">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="min-h-[46px] w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-base font-bold text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-[var(--fl-muted)]">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="min-h-[46px] w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-base font-bold text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-[var(--fl-muted)]">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        disabled={disabled}
        className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-base font-bold leading-7 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export default memo(EditableFinding);
