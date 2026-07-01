import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

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
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
}

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function cleanEmail(value: any) {
  return String(value || "").trim().toLowerCase();
}

function roleLooksLikeRealtor(roleValue: any) {
  const role = String(roleValue || "").trim().toLowerCase();

  return (
    role.includes("realtor") ||
    role.includes("agent") ||
    role.includes("buyer") ||
    role.includes("transaction") ||
    role.includes("coordinator")
  );
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({
        authenticated: false,
        isOwner: false,
        isRealtor: false,
        dashboardHref: "/login",
        reportsHref: "/login",
      });
    }

    const email = cleanEmail(user.email);
    const isOwner = OWNER_EMAILS.includes(email);

    let isInspector = false;
    let isRealtor = false;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createAdminClient();

      try {
        const { data: inspectorRows } = await admin
          .from("inspectors")
          .select("id,email,user_id")
          .or(`user_id.eq.${user.id},email.ilike.${email}`)
          .limit(1);

        isInspector = Boolean(inspectorRows?.length);
      } catch {}

      try {
        const { data: companyRows } = await admin
          .from("companies")
          .select("id,owner_email,email,user_id")
          .or(`user_id.eq.${user.id},owner_email.ilike.${email},email.ilike.${email}`)
          .limit(1);

        if (companyRows?.length) isInspector = true;
      } catch {}

      try {
        const { data: contactRows } = await admin
          .from("inspection_contacts")
          .select("id,role,email,portal_access")
          .ilike("email", email)
          .limit(20);

        isRealtor = Boolean(
          (contactRows || []).some(
            (contact: any) =>
              contact?.portal_access !== false && roleLooksLikeRealtor(contact?.role)
          )
        );
      } catch {}

      try {
        const { data: fieldRows } = await admin
          .from("inspections")
          .select("id")
          .or(
            [
              `realtor_email.ilike.${email}`,
              `agent_email.ilike.${email}`,
              `buyer_agent_email.ilike.${email}`,
              `buyers_agent_email.ilike.${email}`,
              `transaction_coordinator_email.ilike.${email}`,
            ].join(",")
          )
          .limit(1);

        if (fieldRows?.length) isRealtor = true;
      } catch {}
    }

    if (isOwner) isInspector = true;

    const dashboardHref = isInspector ? "/dashboard" : isRealtor ? "/realtor-portal" : "/dashboard";
    const reportsHref = isInspector ? "/reports" : isRealtor ? "/realtor-portal" : "/reports";

    return NextResponse.json({
      authenticated: true,
      email,
      isOwner,
      isInspector,
      isRealtor,
      dashboardHref,
      reportsHref,
    });
  } catch (error: any) {
    console.error("Account routing error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Could not load account routing.",
        authenticated: false,
        isOwner: false,
        isRealtor: false,
        dashboardHref: "/dashboard",
        reportsHref: "/reports",
      },
      { status: 500 }
    );
  }
}
