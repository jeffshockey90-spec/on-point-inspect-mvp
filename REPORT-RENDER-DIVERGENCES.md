# Report-render divergences — decisions for Jeff

These are the places where copy-pasted-then-edited logic now **disagrees on behavior**
across surfaces. They are *not* safe mechanical de-dups — converging each one picks a
winner, and the loser's current behavior changes on some surface. Each item below says
what differs, what breaks if we pick wrong, and my recommended ruling. Check a box per item.

> Context: the 4 pushed Tier-1 branches (dead-code sweep, equipmentInfo, normalizeSection,
> env-service) are pure/zero-behavior extractions and don't need a ruling — just merge them.
> This doc is only the stuff that needs a product call.

---

## 1. Radon/Mold service detection — one real divergence

Four places decide "is this a radon/mold job?" Two are already unified, one is a free
safe win, and **one genuinely disagrees**:

| Surface | Fields checked | Boolean flags checked |
|---|---|---|
| `lib/environmental/service.ts` (env-report, env-share) | `service_mode`, `inspection_type`, `services` | `radon`/`mold` |
| `app/api/send-report-email/route.ts` | **same three** | `radon`/`mold` |
| `app/analytics/page.tsx` (lines 251-287) | adds `service_type`, `type` | adds `radon_test`, `radon_testing`, `mold_test`, `mold_testing` |
| `app/share/[id]/page.tsx` | — none — (home report, no env detection) | — |

**Free win (no decision):** `send-report-email`'s detection is byte-for-byte equivalent to
`lib/environmental/service.ts`. I can point it at the shared module with **zero** behavior
change whenever you want — just say go.

**The real question:** analytics checks a *superset* (`service_type`/`type` columns and the
`*_test`/`*_testing` booleans) that the environmental pages don't.

- **If those extra columns are ever populated,** analytics counts a job as radon/mold that
  the env-report page would **not** render an environmental report for — a mismatch between
  "what the dashboard says we sold" and "what the client actually gets."
- **If those columns are dead/legacy** (we only ever write `service_mode`/`inspection_type`/
  `services` + the plain `radon`/`mold` booleans), the two are effectively identical and we
  should widen the shared helper to the superset and route analytics through it too.

**Recommendation:** adopt the analytics superset as the single shared definition (it's the
safe direction — it can only *add* detections, never drop a report a client already sees),
then route all four surfaces through it. Before I do: do we ever write `service_type`,
`type`, `radon_test`, or `radon_testing` anywhere? If no, this is risk-free.

- [ ] Widen shared helper to the superset + route all 4 (recommended)
- [ ] Keep analytics separate (if those extra columns are intentionally dashboard-only)
- [ ] Just do the free `send-report-email` unification for now, leave analytics alone

---

## 2. Checklist "OTHER" row handling — case sensitivity

The "is this an "other"/free-text checklist row" test differs:

| Surface | Test | Case-insensitive? |
|---|---|---|
| `app/share/[id]/page.tsx:865` | `value.toUpperCase() === "OTHER"` | ✅ yes |
| `app/reports/[id]/print/page.tsx:209` | `value.toUpperCase() === "OTHER"` | ✅ yes |
| `app/client-portal/[id]/page.tsx:114` | `rawValue.toUpperCase() === "OTHER"` | ✅ yes |
| `app/api/realtor-report-download/[id]/route.ts:2769` | `row.value === "OTHER"` | ❌ **case-sensitive** |
| `components/SectionInformationChecklist.tsx:725` | `item.value === "OTHER"` | ❌ **case-sensitive** |

**What breaks if wrong:** if a stored selection value is ever lowercase/mixed-case
(`"other"`, `"Other"`), the **PDF** and the **builder editor** silently mis-handle it while
the web report, print, and client portal handle it correctly — so the client's web report and
their downloaded PDF would show that row differently.

**Recommendation:** make everything case-insensitive (`.toUpperCase() === "OTHER"`). It's a
strict superset — it can't break any value that already works, and it closes the PDF/builder
gap. Only reason not to: if we're *certain* the stored value is always exactly `"OTHER"`,
in which case it's cosmetic. I'd still unify it to remove the footgun.

- [ ] Make all 5 case-insensitive (recommended)
- [ ] Leave as-is (only if stored value is guaranteed uppercase)

---

## 3. Severity bucketing — already being handled

"minor defect" → *repair* on the share page but *maintenance* on print/PDF, and similar
disagreements across `getSeverityBucket`/`getSeverityClass`. **This is already being
reconciled in a separate session (task_ebedd459)** — listed here only so the picture is
complete. No action needed from you here; I'll fold its result in when it lands.

---

## Suggested order
1. **Merge the 4 clean Tier-1 branches** — pure wins, no risk.
2. Rule on #1 and #2 above (two quick product calls).
3. I implement each as its own small, clearly-labeled behavior-change PR (not buried in a
   "cleanup" diff), with a test that pins the chosen behavior.
4. Severity (#3) merges on its own when the separate task finishes.
