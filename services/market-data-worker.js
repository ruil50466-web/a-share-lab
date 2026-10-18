/**
 * A-share Lab — read-only market data API
 * Cloudflare Worker starter. Fixed upstream host and fixed Eastmoney filters;
 * does not accept arbitrary upstream URLs.
 *
 * Routes:
 *   GET /health
 *   GET /api/sectors?type=concept|industry&limit=20
 *
 * This is a research prototype, not an execution/trading system.
 */
const UPSTREAM = "https://push2.eastmoney.com/api/qt/clist/get";
const FILTERS = {
  concept: "m:90+t:3+f:!50",
  industry: "m:90+t:2+f:!50",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=30",
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET") return json({ error: "GET only" }, 405);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "a-share-lab", version: "0.1.0" });
    }
    if (url.pathname !== "/api/sectors") {
      return json({ error: "Not found", routes: ["/health", "/api/sectors?type=concept|industry"] }, 404);
    }

    const type = url.searchParams.get("type") || "concept";
    if (!Object.prototype.hasOwnProperty.call(FILTERS, type)) {
      return json({ error: "type must be concept or industry" }, 400);
    }
    const rawLimit = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.floor(rawLimit))) : 20;

    const upstream = new URL(UPSTREAM);
    upstream.search = new URLSearchParams({
      pn: "1",
      pz: String(limit),
      po: "1",
      np: "1",
      fltt: "2",
      invt: "2",
      fid: "f3",
      fs: FILTERS[type],
      fields: "f2,f3,f4,f5,f6,f12,f14,f104,f105,f128,f136",
    }).toString();

    try {
      const response = await fetch(upstream.toString(), {
        headers: { "user-agent": "Mozilla/5.0 AShareLab/0.1" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return json({ error: "Upstream HTTP error", status: response.status }, 502);
      const payload = await response.json();
      if (payload?.rc !== 0 || !payload?.data?.diff) {
        return json({ error: "Unexpected upstream response", upstreamCode: payload?.rc ?? null }, 502);
      }
      const rows = payload.data.diff.map((x) => ({
        code: x.f12 ?? null,
        name: x.f14 ?? null,
        change_pct: x.f3 ?? null,
        change_amount: x.f4 ?? null,
        turnover_amount: x.f6 ?? null,
        up_count: x.f104 ?? null,
        down_count: x.f105 ?? null,
        leading_stock: x.f128 ?? null,
        leading_stock_change_pct: x.f136 ?? null,
      }));
      return json({
        ok: true,
        source: "Eastmoney public quote endpoint",
        type,
        fetched_at: new Date().toISOString(),
        note: "fetched_at is query time, not a guarantee of the quote timestamp; check exchange trading hours.",
        count: rows.length,
        rows,
      });
    } catch (error) {
      return json({ error: "Market data request failed", detail: String(error?.message || error) }, 502);
    }
  },
};
