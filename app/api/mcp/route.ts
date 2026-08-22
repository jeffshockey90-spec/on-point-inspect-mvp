import { createClient as createServiceClient } from "@supabase/supabase-js";
import { authenticateApiKey } from "../../../lib/apiKeys";
import { MCP_TOOLS, callMcpTool } from "../../../lib/mcpTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FLOW Model Context Protocol server (Streamable HTTP transport). An inspector
// points their AI client (Claude Desktop / Claude Code / Gemini CLI) at this
// URL with `Authorization: Bearer <flow API key>` and gets tools to read and
// edit their own reports. Auth + scoping reuse the #10 API-key layer.

const PROTOCOL_VERSION = "2024-11-05";

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function jsonRpc(id: any, result: any) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}
function jsonRpcError(id: any, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

// GET is the optional server->client SSE stream; we don't push, so decline it.
export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}

export async function POST(request: Request) {
  const db = admin();
  const auth = await authenticateApiKey(request, db);

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error", 400);
  }

  const { id, method, params } = body || {};

  // Notifications (no id) get no response body.
  if (method && String(method).startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }

  if (!auth) {
    return jsonRpcError(id, -32001, "Unauthorized: send Authorization: Bearer <FLOW API key>.", 401);
  }

  try {
    switch (method) {
      case "initialize":
        return jsonRpc(id, {
          protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "FLOW", version: "1.0.0" },
        });

      case "ping":
        return jsonRpc(id, {});

      case "tools/list":
        return jsonRpc(id, { tools: MCP_TOOLS });

      case "tools/call": {
        const name = String(params?.name || "");
        const args = params?.arguments || {};
        try {
          const result = await callMcpTool(db, auth.userId, name, args);
          return jsonRpc(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        } catch (toolError: any) {
          // MCP convention: tool failures come back in the result with isError.
          return jsonRpc(id, {
            content: [{ type: "text", text: String(toolError?.message || "Tool error") }],
            isError: true,
          });
        }
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error: any) {
    return jsonRpcError(id, -32603, error?.message || "Internal error");
  }
}
