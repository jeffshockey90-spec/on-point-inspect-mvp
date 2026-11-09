// Single source of truth for client/realtor contact info.
//
// Contact info is edited in the report builder as `inspection_contacts` rows,
// but ~557 read sites across the app (emails, texts, invoices, agreements,
// portals, PDFs) read the DENORMALIZED fields on the `inspections` row
// (client_name/email/phone, realtor_name/email/phone, agent_* aliases). Those
// two drifted apart — editing a contact never reached the denormalized fields,
// so a phone/email added in the builder silently never applied downstream.
//
// This module mirrors the PRIMARY client + realtor contact into the inspection
// row on every contact save, so the builder becomes the one place to edit
// contact info and it applies everywhere. Pure helpers are unit-tested; the DB
// wrapper is best-effort and never throws into the request path.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ContactRow = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  created_at?: string | null;
};

// Strip invisible/formatting characters that ride along when a number or name
// is pasted from a phone's Contacts app (directional marks, zero-width spaces,
// BOM) and collapse non-breaking spaces. These can silently break SMS delivery
// and string matching.
export function cleanContactValue(value: unknown): string {
  return String(value ?? "")
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/ /g, " ")
    .trim();
}

const CLIENT_ROLE = /\b(co-?client|co-?buyer|client|buyer|customer)\b/i;
const REALTOR_ROLE = /(realtor|agent|transaction)/i;

// Rank the exact primary role (e.g. "client") ahead of secondary ones
// ("co-client"), then fall back to creation order so the first-added wins.
function byPreferredThenCreated(primaryExact: RegExp) {
  return (a: ContactRow, b: ContactRow) => {
    const ra = primaryExact.test(String(a.role || "")) ? 0 : 1;
    const rb = primaryExact.test(String(b.role || "")) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  };
}

// The primary client and primary realtor for an inspection, or null for a role
// with no contact.
export function pickPrimaryContacts(contacts: ContactRow[]) {
  const list = (Array.isArray(contacts) ? contacts : []).filter(Boolean);
  const client =
    list.filter((c) => CLIENT_ROLE.test(String(c.role || "")))
      .sort(byPreferredThenCreated(/^client$/i))[0] || null;
  const realtor =
    list.filter((c) => REALTOR_ROLE.test(String(c.role || "")))
      .sort(byPreferredThenCreated(/^(realtor|agent)$/i))[0] || null;
  return { client, realtor };
}

// Build the patch of denormalized inspection fields mirroring the primaries.
// Only includes fields for a role that HAS a primary contact, so a job with no
// realtor never wipes an existing realtor on the record.
export function buildInspectionContactPatch(
  contacts: ContactRow[],
): Record<string, string | null> {
  const { client, realtor } = pickPrimaryContacts(contacts);
  const patch: Record<string, string | null> = {};

  if (client) {
    patch.client_name = cleanContactValue(client.name) || null;
    patch.client_email = cleanContactValue(client.email) || null;
    patch.client_phone = cleanContactValue(client.phone) || null;
  }

  if (realtor) {
    patch.realtor_name = cleanContactValue(realtor.name) || null;
    patch.realtor_email = cleanContactValue(realtor.email) || null;
    patch.realtor_phone = cleanContactValue(realtor.phone) || null;
    // agent_* are legacy aliases some read paths still fall back to.
    patch.agent_email = cleanContactValue(realtor.email) || null;
    patch.agent_phone = cleanContactValue(realtor.phone) || null;
  }

  return patch;
}

// Columns present on every inspections row — used as the fallback write if a
// legacy DB is missing the agent_* alias columns.
const CORE_KEYS = [
  "client_name",
  "client_email",
  "client_phone",
  "realtor_name",
  "realtor_email",
  "realtor_phone",
];

// Mirror the current primary client/realtor contact into the denormalized
// inspection fields. Best-effort: never throws (the contact itself is already
// saved), and tolerates a DB missing the agent_* alias columns.
export async function syncPrimaryContactsToInspection(
  admin: SupabaseClient,
  inspectionId: string | number,
): Promise<void> {
  try {
    const { data: contacts } = await admin
      .from("inspection_contacts")
      .select("name, email, phone, role, created_at")
      .eq("inspection_id", inspectionId);

    const patch = buildInspectionContactPatch((contacts || []) as ContactRow[]);
    if (!Object.keys(patch).length) return;

    const { error } = await admin
      .from("inspections")
      .update(patch)
      .eq("id", inspectionId);
    if (!error) return;

    // Retry with the core fields only, in case agent_* columns don't exist.
    const core: Record<string, string | null> = {};
    for (const key of CORE_KEYS) if (key in patch) core[key] = patch[key];
    if (Object.keys(core).length) {
      await admin.from("inspections").update(core).eq("id", inspectionId);
    }
  } catch {
    /* best-effort mirror; the contact row itself is already persisted */
  }
}
