/**
 * A-share Lab read-only MCP server.
 * Exposes the existing public intraday API as a chat-callable MCP tool.
 * Stateless Streamable HTTP transport; no user credentials or trading actions.
 */
const API_BASE = "https://a-share-lab-market-data.ruil50466.workers.dev";
const PROTOCOL_VERSION = "2025-03-26";

function response(body, status = 200, extra = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, last-event-id",
      ...extra,
    },
  });
}
function rpc(id, result) { return { jsonrpc: "2.0", id, result }; }
function err(id, code, message) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message } }; }

const tools = [{
  name: "get_a_share_intraday",
  title: "查询 A 股分时数据",
  description: "按六位 A 股代码查询最近交易日的分钟分时数据，包括价格、均价、最高最低价、成交量和成交额。数据来自东方财富公开行情接口，可能延迟或限流；必须检查 trade_date 和 fetched_at。只读，不执行交易。",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "六位 A 股代码，例如 000099（中信海直）、600519（贵州茅台）" }
    },
    required: ["code"],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
}];

async function callTool(name, args) {
  if (name !== "get_a_share_intraday") {
    return { isError: true, content: [{ type: "text", text: "Unknown tool: " + name }] };
  }
  const raw = typeof args?.code === "string" ? args.code : "";
  const code = raw.normalize("NFKC").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    return { isError: true, content: [{ type: "text", text: "code 必须是六位数字 A 股代码，例如 000099。" }] };
  }
  try {
    const upstream = await fetch(API_BASE + "/api/intraday?code=" + encodeURIComponent(code), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15000)
    });
    const data = await upstream.json();
    const serialized = JSON.stringify(data);
    if (!upstream.ok || data?.ok !== true) {
      return { isError: true, content: [{ type: "text", text: "分时查询失败（HTTP " + upstream.status + "）： " + serialized.slice(0, 5000) }] };
    }
    return {
      content: [{ type: "text", text: serialized }],
      structuredContent: data
    };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: "请求分时接口失败：" + String(e?.message || e) }] };
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return response(null, 204);
    if (url.pathname === "/health") {
      return response({ ok: true, service: "a-share-lab-mcp", protocol: "MCP Streamable HTTP", tools: tools.map(t => t.name) });
    }
    if (url.pathname !== "/mcp") return response({ error: "Not found", routes: ["/health", "/mcp"] }, 404);
    if (request.method === "GET") {
      return response({ error: "This stateless MCP endpoint supports POST JSON-RPC requests." }, 405, { allow: "POST, OPTIONS" });
    }
    if (request.method !== "POST") return response({ error: "POST only" }, 405, { allow: "POST, OPTIONS" });
    const ct = request.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) return response({ error: "Content-Type must be application/json" }, 415);
    let message;
    try { message = await request.json(); } catch { return response(err(null, -32700, "Parse error"), 400); }
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return response(err(message?.id, -32600, "Invalid Request"), 400);
    }
    // Notifications have no id and must not receive a JSON-RPC response.
    if (!Object.prototype.hasOwnProperty.call(message, "id")) return response(null, 202);
    const id = message.id;
    switch (message.method) {
      case "initialize":
        return response(rpc(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "a-share-lab-mcp", version: "0.1.0" },
          instructions: "只提供只读 A 股分时查询。所有分析必须核对 trade_date、fetched_at、count 和 note；不要把请求时间当作行情时间，也不要将接口失败解释为空行情。"
        }), 200, { "mcp-protocol-version": PROTOCOL_VERSION });
      case "ping":
        return response(rpc(id, {}));
      case "tools/list":
        return response(rpc(id, { tools }));
      case "tools/call": {
        const params = message.params || {};
        if (typeof params.name !== "string") return response(err(id, -32602, "Missing tool name"), 200);
        const result = await callTool(params.name, params.arguments || {});
        return response(rpc(id, result));
      }
      case "resources/list":
        return response(rpc(id, { resources: [] }));
      case "prompts/list":
        return response(rpc(id, { prompts: [] }));
      default:
        return response(err(id, -32601, "Method not found: " + message.method), 200);
    }
  }
};
