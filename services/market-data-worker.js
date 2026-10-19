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
const UPSTREAM_HOSTS = [
  "https://80.push2.eastmoney.com",
  "https://17.push2.eastmoney.com",
  "https://79.push2.eastmoney.com",
  "https://push2.eastmoney.com",
  "https://push2delay.eastmoney.com",
  "https://82.push2.eastmoney.com",
  "https://push2ex.eastmoney.com",
];
const FILTERS = {
  concept: "m:90+t:3+f:!50",
  industry: "m:90+t:2+f:!50",
};
const POOLS = { zt: "getTopicZTPool", broken: "getTopicZBPool", dt: "getTopicDTPool" };

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
    if (url.pathname === "/api/limit-ups") {
      const type = url.searchParams.get("type") || "zt";
      if (!Object.prototype.hasOwnProperty.call(POOLS, type)) {
        return json({ error: "type must be zt, broken, or dt" }, 400);
      }
      const localDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }).replaceAll("-", "");
      const date = url.searchParams.get("date") || localDate;
      if (!/^\d{8}$/.test(date)) return json({ error: "date must be YYYYMMDD" }, 400);
      const upstream = new URL("https://push2ex.eastmoney.com/" + POOLS[type]);
      upstream.search = new URLSearchParams({
        ut: "7eea3edcaed734bea9cbfc24409ed989",
        dpt: "wz.ztzt",
        Pageindex: "0",
        pagesize: "200",
        sort: "fbt:asc",
        date,
      }).toString();
      try {
        const response = await fetch(upstream.toString(), {
          headers: {
            "user-agent": "Mozilla/5.0 AShareLab/0.1",
            "referer": "https://quote.eastmoney.com/",
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          const upstreamBody = await response.text().catch(() => "");
          return json({
            error: "Upstream HTTP error",
            status: response.status,
            statusText: response.statusText,
            upstreamBody: upstreamBody.slice(0, 500),
          }, 502);
        }
        const payload = await response.json();
        if (payload?.rc !== 0) {
          return json({ error: "Unexpected upstream response", upstreamCode: payload?.rc ?? null }, 502);
        }
        const pool = payload?.data?.pool || [];
        const rows = pool.map((x) => ({
          code: x.c ?? null,
          name: x.n ?? null,
          price: typeof x.p === "number" ? x.p / 1000 : null,
          change_pct: x.zdp ?? null,
          limit_days: x.lbc ?? null,
          first_seal: x.fbt ?? null,
          last_seal: x.lbt ?? null,
          break_times: x.zbc ?? null,
          turnover_pct: x.hs ?? null,
          amount: x.amount ?? null,
          industry: x.hybk ?? null,
          limit_stat: x.zttj ?? null,
        }));
        return json({
          ok: true,
          source: "Eastmoney public limit-up pool endpoint",
          type,
          requested_date: date,
          fetched_at: new Date().toISOString(),
          count: rows.length,
          note: rows.length === 0 ? "空列表可能是非交易日、日期无数据或上游变化，不能直接解读为当日零涨停。" : "requested_date 是查询日期；fetched_at 只是查询时间。",
          rows,
        });
      } catch (error) {
        return json({ error: "Limit-up pool request failed", detail: String(error?.message || error) }, 502);
      }
    }

    if (url.pathname !== "/api/sectors") {
      return json({ error: "Not found", routes: ["/health", "/api/sectors?type=concept|industry", "/api/limit-ups?type=zt|broken|dt&date=YYYYMMDD"] }, 404);
    }

    const type = url.searchParams.get("type") || "concept";
    if (!Object.prototype.hasOwnProperty.call(FILTERS, type)) {
      return json({ error: "type must be concept or industry" }, 400);
    }
    const rawLimit = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.floor(rawLimit))) : 20;

    const params = new URLSearchParams({
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
      let response = null;
      const attempts = [];
      for (const host of UPSTREAM_HOSTS) {
        const upstream = host + "/api/qt/clist/get?" + params;
        try {
          const candidate = await fetch(upstream, {
            headers: {
              "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
              "referer": "https://quote.eastmoney.com/",
              "accept": "application/json, text/plain, */*",
            },
            signal: AbortSignal.timeout(10000),
          });
          if (candidate.ok) {
            response = candidate;
            break;
          }
          const body = await candidate.text().catch(() => "");
          attempts.push({ host, status: candidate.status, statusText: candidate.statusText, body: body.slice(0, 160) });
        } catch (error) {
          attempts.push({ host, error: String(error?.message || error) });
        }
      }
      if (!response) {
        return json({ error: "All Eastmoney hosts failed", attempts }, 502);
      }
      const payload = await response.json();
      if (payload?.rc !== 0 || !payload?.data?.diff) {
        return json({ error: "Unexpected upstream response", upstreamCode: payload?.rc ?? null }, 502);
      }
      const diff = Array.isArray(payload.data.diff) ? payload.data.diff : Object.values(payload.data.diff);
      const rows = diff.map((x) => ({
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
