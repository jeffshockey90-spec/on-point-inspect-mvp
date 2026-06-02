import Link from "next/link";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  return new Stripe(key, {
    apiVersion: "2026-05-27.dahlia",
  });
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

type PageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function money(value: any) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(getNumber(value));
}

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionId = params.session_id || "";

  let inspectionId = "";
  let paid = false;
  let message = "Payment could not be verified.";
  let balancePaid = 0;
  let portalProcessingFee = 0;
  let totalPaid = 0;

  try {
    if (!sessionId) {
      throw new Error("Missing Stripe session.");
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    inspectionId = String(
      session.metadata?.inspection_id || session.client_reference_id || ""
    );

    paid = session.payment_status === "paid" || session.status === "complete";

    if (!inspectionId) {
      throw new Error("Missing inspection ID from Stripe session.");
    }

    if (paid) {
      const supabase = getSupabaseAdmin();

      totalPaid = (session.amount_total || 0) / 100;
      portalProcessingFee = getNumber(session.metadata?.portal_processing_fee);
      balancePaid =
        getNumber(session.metadata?.invoice_balance_due) ||
        Math.max(0, totalPaid - portalProcessingFee);

      await supabase
        .from("inspections")
        .update({
          invoice_status: "Paid",
          payment_status: "Paid",
          amount_paid: balancePaid,
          balance_due: 0,
          payment_method: "Stripe",
          payment_notes: `Stripe payment completed. Inspection balance paid: ${money(
            balancePaid
          )}. Online payment fee: ${money(
            portalProcessingFee
          )}. Total charged online: ${money(totalPaid)}. Session: ${
            session.id
          }`,
          invoice_notes: `Stripe payment completed. Inspection balance paid: ${money(
            balancePaid
          )}. Online payment fee: ${money(
            portalProcessingFee
          )}. Total charged online: ${money(totalPaid)}. Session: ${
            session.id
          }`,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
          paid_at: new Date().toISOString(),
        })
        .eq("id", inspectionId);

      message = "Payment complete. Your inspection portal has been updated.";
    } else {
      message = "Stripe has not marked this payment complete yet.";
    }
  } catch (error: any) {
    message = error?.message || "Payment verification failed.";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#020617] p-6 text-white">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#0f172a] p-8 shadow-xl">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
          On Point Inspect
        </p>

        <h1 className="mt-4 text-4xl font-black text-white">
          {paid ? "Payment Successful" : "Payment Verification"}
        </h1>

        <p className="mt-4 text-lg leading-8 text-slate-300">{message}</p>

        {paid && (
          <div className="mt-6 space-y-3 rounded-xl border border-slate-700 bg-[#020817]/70 p-5">
            <p className="font-bold text-white">
              Inspection Balance Paid: {money(balancePaid)}
            </p>
            <p className="font-bold text-yellow-300">
              Online Payment Fee: {money(portalProcessingFee)}
            </p>
            <p className="font-black text-green-300">
              Total Charged Online: {money(totalPaid)}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {inspectionId && (
            <Link
              href={`/client-portal/${inspectionId}`}
              className="w-full rounded-xl bg-teal-500 px-6 py-3 text-center font-black text-slate-950 hover:bg-teal-400 sm:w-auto"
            >
              Return to Client Portal
            </Link>
          )}

          <Link
            href="/dashboard"
            className="w-full rounded-xl border border-slate-700 px-6 py-3 text-center font-bold text-slate-200 hover:bg-slate-800 sm:w-auto"
          >
            Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}