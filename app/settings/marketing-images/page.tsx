import { OWNER_EMAILS } from "../../../lib/ownerEmails";
import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import MarketingImageStudio from "./MarketingImageStudio";

export const dynamic = "force-dynamic";
export const revalidate = 0;



function cleanUrl(value: any) {
  const text = String(value || "").trim();
  if (!text || text === "null" || text === "undefined") return "";
  return text;
}

function pickFirstUrl(...values: any[]) {
  for (const value of values) {
    const clean = cleanUrl(value);
    if (clean) return clean;
  }

  return "";
}

async function maybeSingleOrNull(query: any) {
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data || null;
}

async function firstTableMatch(supabase: any, table: string, filters: Array<[string, any]>) {
  for (const [column, value] of filters) {
    if (!value) continue;

    const data = await maybeSingleOrNull(
      supabase.from(table).select("*").eq(column, value)
    );

    if (data) return data;
  }

  return null;
}

export default async function MarketingImagesSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect("/login");
  if (!OWNER_EMAILS.includes(String(user.email).toLowerCase())) redirect("/settings");

  const userId = user.id;
  const email = user.email;

  const inspector = await firstTableMatch(supabase, "inspectors", [
    ["user_id", userId],
    ["owner_id", userId],
    ["auth_user_id", userId],
    ["email", email],
    ["owner_email", email],
  ]);

  const companyFromInspectorId =
    inspector?.company_id || inspector?.companyId || inspector?.company || null;

  const company =
    (companyFromInspectorId
      ? await firstTableMatch(supabase, "companies", [["id", companyFromInspectorId]])
      : null) ||
    (await firstTableMatch(supabase, "companies", [
      ["owner_id", userId],
      ["user_id", userId],
      ["auth_user_id", userId],
      ["created_by", userId],
      ["owner_email", email],
      ["email", email],
    ]));

  const companyId = company?.id || companyFromInspectorId || null;

  const publicProfile =
    (companyId
      ? await firstTableMatch(supabase, "public_profiles", [["company_id", companyId]])
      : null) ||
    (companyId
      ? await firstTableMatch(supabase, "public_inspector_profiles", [["company_id", companyId]])
      : null) ||
    (await firstTableMatch(supabase, "public_profiles", [
      ["owner_email", email],
      ["email", email],
      ["user_id", userId],
    ])) ||
    (await firstTableMatch(supabase, "public_inspector_profiles", [
      ["owner_email", email],
      ["email", email],
      ["user_id", userId],
    ]));

  const companyLogoUrl = pickFirstUrl(
    company?.logo_url,
    company?.company_logo_url,
    company?.profile_logo_url,
    company?.public_logo_url,
    company?.brand_logo_url,
    company?.logo,
    company?.image_url,
    company?.avatar_url,
    publicProfile?.logo_url,
    publicProfile?.company_logo_url,
    publicProfile?.public_logo_url,
    publicProfile?.brand_logo_url,
    publicProfile?.logo,
    publicProfile?.image_url,
    inspector?.company_logo_url,
    inspector?.logo_url,
    inspector?.profile_logo_url,
    inspector?.brand_logo_url,
    inspector?.logo,
    inspector?.image_url
  );

  return (
    <MarketingImageStudio
      companyLogoUrl={companyLogoUrl}
      inspectorLogoUrl={companyLogoUrl}
      initialLogoUrl={companyLogoUrl}
    />
  );
}
