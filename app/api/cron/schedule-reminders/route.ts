import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import crypto from "crypto";
import http2 from "http2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PushPayload = {
  title: string;
  body: string;
  url: string;
  eventType: string;
};

type InspectionRow = Record<string, any>;

type ReminderKind = "24h" | "2h" | "30m";

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

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getApnsPrivateKey() {
  const key = process.env.APPLE_APNS_PRIVATE_KEY || "";
  return key.replace(/\\n/g, "\n").trim();
}

function createApnsJwt() {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_APNS_KEY_ID;
  const privateKey = getApnsPrivateKey();

  if (!teamId || !keyId || !privateKey) {
    throw new Error(
      "Missing Apple APNs credentials. Set APPLE_TEAM_ID, APPLE_APNS_KEY_ID, and APPLE_APNS_PRIVATE_KEY."
    );
  }

  const header = {
    alg: "ES256",
    kid: keyId,
  };

  const payload = {
    iss: teamId,
    iat: Math.floor(Date.now() / 1000),
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64Url(signature)}`;
}

function getApnsHost() {
  const useSandbox = String(process.env.APPLE_APNS_USE_SANDBOX || "")
    .toLowerCase()
    .trim();

  return useSandbox === "true" || useSandbox === "1"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
}

function getApnsTopic() {
  const topic =
    process.env.APPLE_BUNDLE_ID || process.env.NEXT_PUBLIC_IOS_BUNDLE_ID;

  if (!topic) {
    throw new Error("Missing APPLE_BUNDLE_ID for APNs topic.");
  }

  return topic;
}

async function sendNativeApns(token: string, payload: PushPayload) {
  const jwt = createApnsJwt();
  const topic = getApnsTopic();
  const host = getApnsHost();

  const apnsPayload = JSON.stringify({
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: "default",
    },
    url: payload.url,
    eventType: payload.eventType,
  });

  return await new Promise<{ status: number; body: string }>(
    (resolve, reject) => {
      const client = http2.connect(host);

      const cleanup = () => {
        try {
          client.close();
        } catch {}
      };

      client.on("error", (error) => {
        cleanup();
        reject(error);
      });

      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });

      let responseBody = "";
      let status = 0;

      request.on("response", (headers) => {
        status = Number(headers[":status"] || 0);
      });

      request.setEncoding("utf8");

      request.on("data", (chunk) => {
        responseBody += chunk;
      });

      request.on("end", () => {
        cleanup();

        if (status >= 200 && status < 300) {
          resolve({ status, body: responseBody });
          return;
        }

        const error: any = new Error(
          responseBody || `APNs send failed with status ${status}.`
        );
        error.statusCode = status;
        error.body = responseBody;
        reject(error);
      });

      request.on("error", (error) => {
        cleanup();
        reject(error);
      });

      request.write(apnsPayload);
      request.end();
    }
  );
}

async function sendWebPush(subscription: any, payload: PushPayload) {
  const webpush = await import("web-push");

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject =
    process.env.VAPID_SUBJECT || "mailto:jeff@onpointhomeinspect.com";

  if (!publicKey || !privateKey) {
    throw new Error(
      "Missing VAPID keys. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY."
    );
  }

  webpush.default.setVapidDetails(subject, publicKey, privateKey);

  return webpush.default.sendNotification(
    subscription,
    JSON.stringify(payload)
  );
}

function shouldDisableNativeToken(error: any) {
  const statusCode = Number(error?.statusCode || 0);
  const body = String(error?.body || error?.message || "");

  return (
    (statusCode === 400 && body.includes("BadDeviceToken")) ||
    statusCode === 410 ||
    body.includes("Unregistered")
  );
}

function isExpiredWebPush(error: any) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  return statusCode === 404 || statusCode === 410;
}

function getInspectionDate(row: InspectionRow) {
  return (
    row.inspection_date ||
    row.scheduled_date ||
    row.date ||
    row.start_date ||
    null
  );
}

function getInspectionTime(row: InspectionRow) {
  return (
    row.inspection_time ||
    row.scheduled_time ||
    row.time ||
    row.start_time ||
    "09:00"
  );
}

function cleanDate(value: any) {
  if (!value) return "";

  const text = String(value).trim();

  if (text.includes("T")) {
    return text.split("T")[0];
  }

  return text;
}

function cleanTime(value: any) {
  if (!value) return "09:00";

  const text = String(value).trim();

  if (text.includes("T")) {
    const date = new Date(text);

    if (!Number.isNaN(date.getTime())) {
      return date.toTimeString().slice(0, 5);
    }
  }

  if (/^\d{1,2}:\d{2}/.test(text)) {
    return text.slice(0, 5);
  }

  return "09:00";
}

function getInspectionStart(row: InspectionRow) {
  if (row.scheduled_start_at) {
    const instant = new Date(row.scheduled_start_at);
    if (!Number.isNaN(instant.getTime())) return instant;
  }
  const date = cleanDate(getInspectionDate(row));
  const time = cleanTime(getInspectionTime(row));

  if (!date) return null;

  const start = new Date(`${date}T${time}:00`);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  return start;
}

function getAddress(row: InspectionRow) {
  const parts = [
    row.address || row.property_address || row.street || row.location,
    row.city,
    row.state,
    row.zip || row.zip_code,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "inspection";
}

function getClient(row: InspectionRow) {
  return (
    row.client_name ||
    row.client ||
    row.buyer_name ||
    row.customer_name ||
    row.customer ||
    ""
  );
}

function getStatus(row: InspectionRow) {
  return String(row.status || row.inspection_status || "").toLowerCase();
}

function getServiceMode(row: InspectionRow) {
  return String(row.service_mode || "").toLowerCase().trim();
}

function includesHomeService(row: InspectionRow) {
  // Blank/legacy service_mode predates mold/radon-only jobs; treat it as a
  // full home inspection so those reminders keep their existing behavior.
  const mode = getServiceMode(row);
  if (!mode) return true;
  return mode.startsWith("home");
}

function includesRadonService(row: InspectionRow) {
  return row.radon === true || getServiceMode(row).includes("radon");
}

function includesMoldService(row: InspectionRow) {
  return row.mold === true || getServiceMode(row).includes("mold");
}

function isEnvironmentalOnly(row: InspectionRow) {
  return (
    !includesHomeService(row) &&
    (includesRadonService(row) || includesMoldService(row))
  );
}

// Title-cased noun for push titles; lower-cased for inline body text.
function getInspectionNoun(row: InspectionRow) {
  if (!isEnvironmentalOnly(row)) return "Inspection";

  const radon = includesRadonService(row);
  const mold = includesMoldService(row);

  if (radon && mold) return "Mold & Radon Inspection";
  if (radon) return "Radon Test";
  return "Mold Inspection";
}

function isCancelledOrComplete(row: InspectionRow) {
  const status = getStatus(row);

  return (
    status.includes("cancel") ||
    status.includes("complete") ||
    status.includes("done")
  );
}

function getInspectionOwnerIds(row: InspectionRow) {
  return [
    row.user_id,
    row.owner_id,
    row.inspector_id,
    row.created_by,
    row.auth_user_id,
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

function getInspectionEmails(row: InspectionRow) {
  return [
    row.user_email,
    row.owner_email,
    row.inspector_email,
    row.email,
    row.inspector,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

async function getReminderSettingsForInspection(admin: any, row: InspectionRow) {
  const ids = getInspectionOwnerIds(row);

  if (ids.length === 0) {
    return {
      enabled: true,
      reminder_24h_enabled: true,
      reminder_2h_enabled: true,
      reminder_30m_enabled: true,
      radon_deployment_reminder_enabled: true,
      radon_retrieval_reminder_enabled: true,
    };
  }

  const { data } = await admin
    .from("schedule_reminder_settings")
    .select("*")
    .in("user_id", ids)
    .limit(1)
    .maybeSingle();

  return {
    enabled: data?.enabled !== false,
    reminder_24h_enabled: data?.reminder_24h_enabled !== false,
    reminder_2h_enabled: data?.reminder_2h_enabled !== false,
    reminder_30m_enabled: data?.reminder_30m_enabled !== false,
    // Columns may not exist yet on installs that haven't run the
    // add-radon-deploy-retrieve-reminders migration; undefined -> on.
    radon_deployment_reminder_enabled:
      data?.radon_deployment_reminder_enabled !== false,
    radon_retrieval_reminder_enabled:
      data?.radon_retrieval_reminder_enabled !== false,
  };
}

function inReminderWindow(
  inspectionStart: Date,
  now: Date,
  kind: ReminderKind
) {
  const targetMs =
    kind === "24h"
      ? 24 * 60 * 60 * 1000
      : kind === "2h"
        ? 2 * 60 * 60 * 1000
        : 30 * 60 * 1000;

  const reminderTime = new Date(inspectionStart.getTime() - targetMs);
  const diffMs = reminderTime.getTime() - now.getTime();

  return diffMs <= 0 && diffMs > -35 * 60 * 1000;
}

function reminderBody(row: InspectionRow, kind: ReminderKind) {
  const address = getAddress(row);
  const client = getClient(row);
  const kindLabel = getInspectionNoun(row).toLowerCase();

  if (kind === "24h") {
    return `Reminder: ${kindLabel} tomorrow at ${address}${client ? ` for ${client}` : ""}.`;
  }

  if (kind === "2h") return `Reminder: ${kindLabel} in about 2 hours at ${address}${client ? ` for ${client}` : ""}.`;

  return `Reminder: ${kindLabel} in about 30 minutes at ${address}${client ? ` for ${client}` : ""}.`;
}

function reminderTitle(row: InspectionRow, kind: ReminderKind) {
  const noun = getInspectionNoun(row);

  return kind === "24h" ? `${noun} Tomorrow` : kind === "2h" ? `${noun} Soon` : `${noun} in 30 Minutes`;
}

function getTargetUrl(row: InspectionRow) {
  const id = row.id;

  if (!id) return "/schedule";

  return isEnvironmentalOnly(row) ? `/environmental-report/${id}` : `/reports/${id}`;
}

async function alreadySent(admin: any, inspectionId: string, kind: string) {
  const { data, error } = await admin
    .from("schedule_reminder_logs")
    .select("id")
    .eq("inspection_id", inspectionId)
    .eq("reminder_type", kind)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

async function markSent(
  admin: any,
  row: InspectionRow,
  kind: ReminderKind,
  sent: number,
  failed: number
) {
  const inspectionStart = getInspectionStart(row);

  await admin.from("schedule_reminder_logs").insert({
    inspection_id: String(row.id),
    reminder_type: kind,
    scheduled_for: inspectionStart?.toISOString() || null,
    sent_at: new Date().toISOString(),
    sent_count: sent,
    failed_count: failed,
    metadata: {
      address: getAddress(row),
      client: getClient(row),
      status: row.status || row.inspection_status || null,
    },
  });
}

function tokenMatchesInspection(row: any, ids: Set<string>, emails: Set<string>) {
  const rowUserId = String(row?.user_id || "");
  const rowEmail = String(row?.user_email || "").toLowerCase();

  if (ids.size === 0 && emails.size === 0) {
    return false;
  }

  return (
    Boolean(rowUserId && ids.has(rowUserId)) ||
    Boolean(rowEmail && emails.has(rowEmail))
  );
}

// Sends one push payload to every web + native device belonging to the
// inspection's owner. Shared by the scheduled inspection reminders and the
// radon deployment/retrieval reminders so both deliver the same way.
async function deliverToInspection(
  admin: any,
  row: InspectionRow,
  payload: PushPayload
) {
  const ids = new Set(getInspectionOwnerIds(row));
  const emails = new Set(getInspectionEmails(row));

  const { data: webRows } = await admin
    .from("app_push_subscriptions")
    .select("*")
    .eq("enabled", true);

  const { data: nativeRows } = await admin
    .from("app_native_push_tokens")
    .select("*")
    .eq("enabled", true);

  const webTargets = (webRows || []).filter((device: any) =>
    tokenMatchesInspection(device, ids, emails)
  );

  const nativeTargets = (nativeRows || []).filter((device: any) =>
    tokenMatchesInspection(device, ids, emails)
  );

  let sent = 0;
  let failed = 0;

  for (const device of webTargets) {
    try {
      await sendWebPush(device.subscription, payload);
      sent += 1;
    } catch (error: any) {
      failed += 1;

      if (isExpiredWebPush(error)) {
        await admin
          .from("app_push_subscriptions")
          .update({
            enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("endpoint", device.endpoint);
      }
    }
  }

  for (const device of nativeTargets) {
    try {
      await sendNativeApns(device.token, payload);
      sent += 1;
    } catch (error: any) {
      failed += 1;

      if (shouldDisableNativeToken(error)) {
        await admin
          .from("app_native_push_tokens")
          .update({
            enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("token", device.token);
      }
    }
  }

  return {
    sent,
    failed,
    webTargets: webTargets.length,
    nativeTargets: nativeTargets.length,
  };
}

async function sendReminderForInspection(
  admin: any,
  row: InspectionRow,
  kind: ReminderKind
) {
  const payload: PushPayload = {
    title: reminderTitle(row, kind),
    body: reminderBody(row, kind),
    url: getTargetUrl(row),
    eventType: `schedule_reminder_${kind}`,
  };

  const result = await deliverToInspection(admin, row, payload);

  await markSent(admin, row, kind, result.sent, result.failed);

  return {
    inspectionId: row.id,
    kind,
    ...result,
  };
}

type RadonReminderKind = "radon_deploy" | "radon_retrieve";

// Fire 30 minutes before the device is due, matching the on-device native
// reminders in TimeLocationEngine so web-push and native stay consistent.
const RADON_LEAD_MS = 30 * 60 * 1000;

function radonReminderContent(row: InspectionRow, kind: RadonReminderKind) {
  const address = getAddress(row);
  const client = getClient(row);
  const suffix = client ? ` for ${client}` : "";

  if (kind === "radon_deploy") {
    return {
      title: "Radon Deployment in 30 Minutes",
      body: `Reminder: deploy the radon monitor at ${address}${suffix}.`,
    };
  }

  return {
    title: "Radon Retrieval in 30 Minutes",
    body: `Reminder: pick up the radon monitor at ${address}${suffix}.`,
  };
}

async function sendRadonReminder(
  admin: any,
  inspection: InspectionRow,
  test: Record<string, any>,
  kind: RadonReminderKind,
  dueAt: Date
) {
  const content = radonReminderContent(inspection, kind);

  const payload: PushPayload = {
    title: content.title,
    body: content.body,
    url: inspection.id
      ? `/environmental-report/${inspection.id}`
      : "/radon",
    eventType: kind,
  };

  const result = await deliverToInspection(admin, inspection, payload);

  await admin.from("schedule_reminder_logs").insert({
    inspection_id: String(inspection.id),
    reminder_type: kind,
    scheduled_for: dueAt.toISOString(),
    sent_at: new Date().toISOString(),
    sent_count: result.sent,
    failed_count: result.failed,
    metadata: {
      address: getAddress(inspection),
      client: getClient(inspection),
      radon_test_id: test.id ?? null,
      device_name: test.device_name || null,
    },
  });

  return {
    inspectionId: inspection.id,
    kind,
    ...result,
  };
}

async function processRadonReminders(admin: any, now: Date) {
  const results: any[] = [];

  // Widen the fetch window generously; precise "is it due right now" gating
  // happens per-test below via inReminderWindow against (due - 30m).
  const rangeStart = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();

  const { data: tests, error } = await admin
    .from("radon_tests")
    .select("*")
    .or(`start_time.gte.${rangeStart},end_time.gte.${rangeStart}`)
    .limit(500);

  if (error || !tests || tests.length === 0) {
    return results;
  }

  const inspectionIds = Array.from(
    new Set(
      tests
        .map((test: any) => (test.inspection_id ? String(test.inspection_id) : ""))
        .filter(Boolean)
    )
  );

  if (inspectionIds.length === 0) {
    return results;
  }

  const { data: inspectionRows } = await admin
    .from("inspections")
    .select("*")
    .in("id", inspectionIds);

  const inspectionMap = new Map<string, InspectionRow>(
    (inspectionRows || []).map((row: any) => [String(row.id), row])
  );

  for (const test of tests) {
    const inspection = inspectionMap.get(String(test.inspection_id));

    if (!inspection || isCancelledOrComplete(inspection)) {
      continue;
    }

    const settings = await getReminderSettingsForInspection(admin, inspection);

    if (!settings.enabled) {
      continue;
    }

    const stages: Array<{
      kind: RadonReminderKind;
      enabled: boolean;
      value: any;
    }> = [
      {
        kind: "radon_deploy",
        enabled: settings.radon_deployment_reminder_enabled,
        value: test.start_time,
      },
      {
        kind: "radon_retrieve",
        enabled: settings.radon_retrieval_reminder_enabled,
        value: test.end_time,
      },
    ];

    for (const stage of stages) {
      if (!stage.enabled || !stage.value) {
        continue;
      }

      const dueAt = new Date(stage.value);

      if (Number.isNaN(dueAt.getTime())) {
        continue;
      }

      const reminderTime = new Date(dueAt.getTime() - RADON_LEAD_MS);
      const diffMs = reminderTime.getTime() - now.getTime();

      // Same trailing catch window as inReminderWindow: fire once the lead
      // time has passed, but not for stale events older than ~35 minutes.
      if (diffMs > 0 || diffMs <= -35 * 60 * 1000) {
        continue;
      }

      if (await alreadySent(admin, String(inspection.id), stage.kind)) {
        continue;
      }

      const result = await sendRadonReminder(
        admin,
        inspection,
        test,
        stage.kind,
        dueAt
      );

      results.push(result);
    }
  }

  return results;
}

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return true;
  }

  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";

  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const now = new Date();

    const lookAhead = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const lookBack = new Date(now.getTime() - 60 * 60 * 1000);

    const { data: inspections, error } = await admin
      .from("inspections")
      .select("*")
      .gte("created_at", "2000-01-01T00:00:00.000Z")
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const candidates = (inspections || []).filter((row: InspectionRow) => {
      if (!row.id || isCancelledOrComplete(row)) return false;

      const start = getInspectionStart(row);

      if (!start) return false;

      return start >= lookBack && start <= lookAhead;
    });

    const results: any[] = [];

    for (const row of candidates) {
      const start = getInspectionStart(row);

      if (!start) continue;

      for (const kind of ["24h", "2h", "30m"] as ReminderKind[]) {
        if (!inReminderWindow(start, now, kind)) {
          continue;
        }

        const settings = await getReminderSettingsForInspection(admin, row);

        if (!settings.enabled) {
          continue;
        }

        if (kind === "24h" && !settings.reminder_24h_enabled) {
          continue;
        }

        if (kind === "2h" && !settings.reminder_2h_enabled) {
          continue;
        }

        if (kind === "30m" && !settings.reminder_30m_enabled) {
          continue;
        }

        const sent = await alreadySent(admin, String(row.id), kind);

        if (sent) {
          continue;
        }

        const result = await sendReminderForInspection(admin, row, kind);
        results.push(result);
      }
    }

    const radonResults = await processRadonReminders(admin, now);
    results.push(...radonResults);

    return NextResponse.json({
      ok: true,
      checked: candidates.length,
      radonChecked: radonResults.length,
      sent: results.reduce((sum, result) => sum + Number(result.sent || 0), 0),
      failed: results.reduce((sum, result) => sum + Number(result.failed || 0), 0),
      results,
    });
  } catch (error: any) {
    console.error("Schedule reminder cron error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Schedule reminder cron failed.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
