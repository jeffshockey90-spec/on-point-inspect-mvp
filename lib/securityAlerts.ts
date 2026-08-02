// Intrusion-attempt detection + owner alerting.
//
// Call reportSecurityEvent() from the REJECTION branch of a gated endpoint when
// a caller is turned away for presenting a guessed/unauthorized inspection id.
// One rejection is usually just a stale link, so this does NOT alert per event:
// it records the event, counts recent rejections from the same IP, and only
// emails + pushes the owner once a burst crosses a threshold — then stays quiet
// for that IP for a cooldown window so a scan can't spam the owner.
//
// Everything is wrapped so it can NEVER throw into the request path; if the
// table is missing or Resend/push is misconfigured, the endpoint still responds
// normally and the failure is just logged.

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { OWNER_EMAILS } from "./ownerEmails";
import { sendPushNotification } from "./push";

const THRESHOLD = Math.max(1, Number(process.env.SECURITY_ALERT_THRESHOLD || 6));
const WINDOW_MIN = Math.max(1, Number(process.env.SECURITY_ALERT_WINDOW_MIN || 10));
const COOLDOWN_MIN = Math.max(1, Number(process.env.SECURITY_ALERT_COOLDOWN_MIN || 30));

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getClientIp(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  return first || h.get("x-real-ip") || "";
}

function maskIpForDisplay(ip: string) {
  return ip || "unknown";
}

async function notifyOwners({
  ip,
  path,
  count,
  userAgent,
}: {
  ip: string;
  path: string;
  count: number;
  userAgent: string;
}) {
  const when = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const shownIp = maskIpForDisplay(ip);
  const subject = `⚠️ FLOW security alert: blocked access attempts`;
  const line = `${count}+ blocked access attempts from ${shownIp} in the last ${WINDOW_MIN} min, hitting ${path}.`;

  const tasks: Promise<any>[] = [];

  // Email (Resend) to every owner address.
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && OWNER_EMAILS.length) {
    const resend = new Resend(resendKey);
    tasks.push(
      resend.emails.send({
        from: "FLOW Security <alerts@onpointhomeinspect.com>",
        to: OWNER_EMAILS,
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
            <h2 style="margin:0 0 8px;">⚠️ Possible intrusion attempt</h2>
            <p style="margin:0 0 12px;">${line}</p>
            <table style="border-collapse:collapse;font-size:14px;color:#334155;">
              <tr><td style="padding:2px 12px 2px 0;"><strong>IP</strong></td><td>${shownIp}</td></tr>
              <tr><td style="padding:2px 12px 2px 0;"><strong>Endpoint</strong></td><td>${path}</td></tr>
              <tr><td style="padding:2px 12px 2px 0;"><strong>Attempts</strong></td><td>${count}+ in ${WINDOW_MIN} min</td></tr>
              <tr><td style="padding:2px 12px 2px 0;"><strong>When</strong></td><td>${when} ET</td></tr>
              <tr><td style="padding:2px 12px 2px 0;vertical-align:top;"><strong>Agent</strong></td><td style="word-break:break-all;">${userAgent || "unknown"}</td></tr>
            </table>
            <p style="margin:16px 0 0;color:#64748b;font-size:13px;">
              These attempts were <strong>blocked</strong> — no data was exposed. If this was you testing, you can ignore it.
              You won't get another alert for this IP for ${COOLDOWN_MIN} minutes.
            </p>
          </div>
        `,
        text: `Possible intrusion attempt on FLOW\n\n${line}\nIP: ${shownIp}\nEndpoint: ${path}\nAttempts: ${count}+ in ${WINDOW_MIN} min\nWhen: ${when} ET\nAgent: ${userAgent || "unknown"}\n\nThese attempts were blocked — no data was exposed.`,
      })
    );
  }

  // Push to each owner.
  for (const ownerEmail of OWNER_EMAILS) {
    tasks.push(
      sendPushNotification({
        title: "⚠️ FLOW security alert",
        body: line,
        url: "/dashboard/owner",
        eventType: "security_alert",
        target: "user",
        targetUserEmail: ownerEmail,
      })
    );
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((r) => {
    if (r.status === "rejected") console.error("Security alert channel failed:", r.reason);
  });
}

/**
 * Record a blocked/unauthorized access attempt and, on a burst from one IP,
 * alert the owner. Never throws.
 */
export async function reportSecurityEvent({
  req,
  type,
  detail,
}: {
  req: Request;
  type: string;
  detail?: Record<string, any>;
}): Promise<void> {
  try {
    const db = getAdmin();
    if (!db) return;

    const ip = getClientIp(req);
    const path = (() => {
      try {
        return new URL(req.url).pathname;
      } catch {
        return "";
      }
    })();
    const userAgent = req.headers.get("user-agent") || "";

    await db.from("security_events").insert({
      event_type: type,
      ip: ip || null,
      path: path || null,
      method: req.method || null,
      user_agent: userAgent || null,
      detail: detail || null,
    });

    // Can't rate-limit or attribute a burst without an IP.
    if (!ip) return;

    const windowStart = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();

    const { count } = await db
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .neq("event_type", "alert_sent")
      .gte("created_at", windowStart);

    if ((count || 0) < THRESHOLD) return;

    // Cooldown: only one alert per IP per COOLDOWN_MIN.
    const cooldownStart = new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString();
    const { data: recentAlert } = await db
      .from("security_events")
      .select("id")
      .eq("ip", ip)
      .eq("event_type", "alert_sent")
      .gte("created_at", cooldownStart)
      .limit(1)
      .maybeSingle();

    if (recentAlert) return;

    // Claim the alert slot first (dedupe marker) so concurrent requests don't
    // double-send, then notify.
    await db.from("security_events").insert({
      event_type: "alert_sent",
      ip,
      path: path || null,
      detail: { count: count || 0, windowMin: WINDOW_MIN },
    });

    await notifyOwners({ ip, path, count: count || 0, userAgent });
  } catch (error) {
    console.error("reportSecurityEvent failed:", error);
  }
}
