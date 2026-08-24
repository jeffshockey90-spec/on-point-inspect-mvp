import { OWNER_EMAILS } from "../../../lib/ownerEmails";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";



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

      // These three lookups are independent, so run them together. This route
      // gates the whole navbar render on the client, so shaving it from three
      // serial round-trips to one parallel batch directly shrinks the window
      // where the nav can't be clicked yet. A failing query resolves to null
      // (same resilience as the old per-query try/catch).
      const safe = (q: any) =>
        Promise.resolve(q).then((r: any) => r).catch(() => ({ data: null }));

      const [companyUsersRes, contactsRes, fieldRes] = await Promise.all([
        safe(
          admin.from("company_users").select("company_id").eq("user_id", user.id).limit(1)
        ),
        safe(
          admin
            .from("inspection_contacts")
            .select("id,role,email,portal_access")
            .ilike("email", email)
            .limit(20)
        ),
        safe(
          admin
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
            .limit(1)
        ),
      ]);

      isInspector = Boolean(companyUsersRes.data?.length);

      isRealtor =
        Boolean(
          (contactsRes.data || []).some(
            (contact: any) =>
              contact?.portal_access !== false && roleLooksLikeRealtor(contact?.role)
          )
        ) || Boolean(fieldRes.data?.length);
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
