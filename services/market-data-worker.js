/**
 * A-share Lab — read-only market data API
 * Cloudflare Worker starter. Fixed upstream host and fixed Eastmoney filters;
 * does not accept arbitrary upstream URLs.
 *
 * Routes:
 *   GET /health
 *   GET /api/sectors?type=concept|industry&limit=20
 *   GET /api/intraday?code=600519
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
      return json({ ok: true, service: "a-share-lab", version: "0.2.0" });
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


    if (url.pathname === "/api/stocks") {
      const rawPage = Number(url.searchParams.get("page") || 1);
      const rawSize = Number(url.searchParams.get("size") || 100);
      const page = Number.isFinite(rawPage) ? Math.max(1, Math.min(100, Math.floor(rawPage))) : 1;
      const size = Number.isFinite(rawSize) ? Math.max(20, Math.min(500, Math.floor(rawSize))) : 100;
      const params = new URLSearchParams({
        pn: String(page),
        pz: String(size),
        po: "1",
        np: "1",
        fltt: "2",
        invt: "2",
        fid: "f3",
        ut: "7eea3edcaed734bea9cbfc24409ed989",
        fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
        fields: "f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23,f100",
      }).toString();
      const attempts = [];
      // Eastmoney hosts may reject one route while another host/path still works.
      // Try both documented frontend path variants and retain diagnostics.
      const paths = ["/webguest/api/qt/clist/get?", "/api/qt/clist/get?"];
      for (const host of UPSTREAM_HOSTS) {
        for (const path of paths) {
          try {
            const response = await fetch(host + path + params, {
              headers: {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "referer": "https://quote.eastmoney.com/center/",
                "accept": "application/json, text/plain, */*",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
              },
              signal: AbortSignal.timeout(8000),
            });
            if (!response.ok) {
              const body = await response.text().catch(() => "");
              attempts.push({ host, path: path.split("?")[0], status: response.status, statusText: response.statusText, body: body.slice(0, 180) });
              continue;
            }
            let payload;
            try {
              payload = await response.json();
            } catch (error) {
              attempts.push({ host, path: path.split("?")[0], error: "Invalid JSON: " + String(error?.message || error) });
              continue;
            }
            if (payload?.rc !== 0 || !payload?.data || payload?.data?.diff == null) {
              attempts.push({ host, path: path.split("?")[0], upstreamCode: payload?.rc ?? null, error: "Unexpected payload shape" });
              continue;
            }
            const data = payload.data;
            const diff = Array.isArray(data.diff) ? data.diff : Object.values(data.diff || {});
            const rows = diff.map((x) => ({
              code: x.f12 ?? null,
              name: x.f14 ?? null,
              price: x.f2 ?? null,
              change_pct: x.f3 ?? null,
              change_amount: x.f4 ?? null,
              volume: x.f5 ?? null,
              amount: x.f6 ?? null,
              amplitude_pct: x.f7 ?? null,
              turnover_pct: x.f8 ?? null,
              pe: x.f9 ?? null,
              volume_ratio: x.f10 ?? null,
              high: x.f15 ?? null,
              low: x.f16 ?? null,
              open: x.f17 ?? null,
              prev_close: x.f18 ?? null,
              total_market_cap: x.f20 ?? null,
              float_market_cap: x.f21 ?? null,
              pb: x.f23 ?? null,
              industry: x.f100 ?? null,
            }));
            return json({
              ok: true,
              source: "Eastmoney public quote endpoint",
              source_host: host,
              source_path: path.split("?")[0],
              universe: "Eastmoney A-share market filter; verify board coverage against the current upstream filter semantics",
              page,
              page_size: size,
              total: data.total ?? null,
              count: rows.length,
              fetched_at: new Date().toISOString(),
              quote_timestamp: null,
              note: "fetched_at is request-success time, not quote date; snapshot may be delayed. Verify total and fetch all pages. Historical daily bars are not provided.",
              empty_reason: rows.length === 0 ? "Upstream request succeeded but returned an empty page; check page number, total, and upstream filter." : null,
              rows,
            });
          } catch (error) {
            attempts.push({ host, path: path.split("?")[0], error: String(error?.message || error) });
          }
        }
      }
      return json({
        ok: false,
        error: "All Eastmoney stock endpoints failed",
        page,
        page_size: size,
        requested_at: new Date().toISOString(),
        attempts,
        note: "接口失败不等于空列表；不要用失败结果判断全市场涨跌或板块强弱。",
      }, 502);
    }

    if (url.pathname === "/api/intraday") {
      const rawCode = url.searchParams.get("code") || "";
      // Normalize full-width digits and remove whitespace from mobile keyboards.
      const code = rawCode.normalize("NFKC").replace(/\s+/g, "");
      if (!/^\d{6}$/.test(code)) {
        return json({ error: "code must be a 6-digit A-share stock code", received: rawCode, normalized: code }, 400);
      }
      const market = code.startsWith("6") ? "1" : "0";
      const secid = market + "." + code;
      const params = new URLSearchParams({
        secid,
        fields1: "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13",
        fields2: "f51,f52,f53,f54,f55,f56,f57,f58",
        ndays: "1",
        iscr: "0",
        ut: "7eea3edcaed734bea9cbfc24409ed989",
      }).toString();
      const hosts = [
        "https://push2.eastmoney.com",
        "https://17.push2.eastmoney.com",
        "https://80.push2.eastmoney.com",
        "https://push2delay.eastmoney.com",
        "https://push2his.eastmoney.com",
      ];
      const attempts = [];
      for (const host of hosts) {
        try {
          const response = await fetch(host + "/api/qt/stock/trends2/get?" + params, {
            headers: {
              "user-agent": "Mozilla/5.0 AShareLab/0.2",
              "referer": "https://quote.eastmoney.com/",
              "accept": "application/json, text/plain, */*",
            },
            signal: AbortSignal.timeout(9000),
          });
          if (!response.ok) {
            attempts.push({ host, status: response.status });
            continue;
          }
          const payload = await response.json();
          if (payload?.rc !== 0 || !payload?.data) {
            attempts.push({ host, upstreamCode: payload?.rc ?? null });
            continue;
          }
          const raw = Array.isArray(payload.data.trends) ? payload.data.trends : [];
          const points = raw.map((line) => {
            const a = String(line).split(",");
            const parsedPrice = Number(a[1]);
            const avgPrice = Number(a[2]);
            const price = Number.isFinite(parsedPrice) && parsedPrice > 0
              ? parsedPrice
              : (Number.isFinite(avgPrice) && avgPrice > 0 ? avgPrice : null);
            return {
              datetime: a[0] || null,
              price,
              avg_price: Number.isFinite(avgPrice) && avgPrice > 0 ? avgPrice : null,
              high: Number.isFinite(Number(a[3])) ? Number(a[3]) : null,
              low: Number.isFinite(Number(a[4])) ? Number(a[4]) : null,
              volume: Number.isFinite(Number(a[5])) ? Number(a[5]) : null,
              amount: Number.isFinite(Number(a[6])) ? Number(a[6]) : null,
              raw_price: Number.isFinite(parsedPrice) ? parsedPrice : null,
            };
          }).filter((x) => x.datetime && (x.price !== null || x.avg_price !== null));
          if (!points.length) {
            attempts.push({ host, error: "No usable trend points" });
            continue;
          }
          const dates = points.map((x) => String(x.datetime).slice(0, 10)).filter(Boolean);
          const uniqueDates = [...new Set(dates)];
          return json({
            ok: true,
            source: "Eastmoney public intraday trend endpoint",
            code,
            name: payload.data.name ?? null,
            secid,
            requested_days: 1,
            trade_date: uniqueDates.length ? uniqueDates[uniqueDates.length - 1] : null,
            fetched_at: new Date().toISOString(),
            count: points.length,
            points,
            note: "公开行情接口可能延迟或限流。收盘后返回的分时数据可能属于最近交易日；历史数据中的原始价格可能为0，遇到这种情况 price 使用 avg_price 作为绘图回退值，须核对 raw_price。volume 的上游单位尚未独立确认。",
          });
        } catch (error) {
          attempts.push({ host, error: String(error?.message || error) });
        }
      }
      return json({ error: "Intraday data unavailable", code, attempts }, 502);
    }

    if (url.pathname !== "/api/sectors") {
      return json({ error: "Not found", routes: ["/health", "/api/sectors?type=concept|industry", "/api/stocks?page=1&size=100", "/api/limit-ups?type=zt|broken|dt&date=YYYYMMDD", "/api/intraday?code=600519"] }, 404);
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

    // Prefer the standard clist endpoint. The legacy /webguest route has
    // returned 404 on push2delay; avoid wasting a full retry on that path.
    // Some Eastmoney mirrors fail intermittently, so probe the known hosts in
    // parallel with a short timeout and accept only a validated JSON payload.
    const sectorHosts = [
      "https://push2.eastmoney.com",
      "https://push2delay.eastmoney.com",
      "https://79.push2.eastmoney.com",
      "https://82.push2.eastmoney.com",
      "https://80.push2.eastmoney.com",
      "https://17.push2.eastmoney.com",
      "https://29.push2.eastmoney.com",
      "https://91.push2.eastmoney.com",
    ];
    const attempts = [];
    const candidates = await Promise.all(sectorHosts.map(async (host) => {
      const path = "/api/qt/clist/get";
      try {
        const target = new URL(host + path);
        target.search = params + "&_=" + Date.now();
        const response = await fetch(target.toString(), {
          headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "referer": "https://quote.eastmoney.com/center/",
            "accept": "application/json, text/plain, */*",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          return { host, path, attempt: { host, path, status: response.status, statusText: response.statusText, body: body.slice(0, 120) } };
        }
        let payload;
        try {
          payload = await response.json();
        } catch (error) {
          return { host, path, attempt: { host, path, error: "Invalid JSON: " + String(error?.message || error) } };
        }
        if (payload?.rc !== 0 || !payload?.data || payload?.data?.diff == null) {
          return { host, path, attempt: { host, path, upstreamCode: payload?.rc ?? null, error: "Unexpected payload shape" } };
        }
        return { host, path, payload };
      } catch (error) {
        return { host, path, attempt: { host, path, error: String(error?.message || error) } };
      }
    }));
    for (const item of candidates) if (item.attempt) attempts.push(item.attempt);
    const usable = candidates.find((item) => item.payload) || null;

    if (!usable) {
      return json({
        ok: false,
        error: "All Eastmoney sector endpoints failed",
        type,
        requested_at: new Date().toISOString(),
        attempts,
        note: "接口失败不等于板块空列表；请勿用失败结果判断板块强弱。",
      }, 502);
    }

    const payload = usable.payload;
    const diff = Array.isArray(payload.data.diff) ? payload.data.diff : Object.values(payload.data.diff || {});
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
      source_host: usable.host,
      source_path: usable.path,
      type,
      requested_date: null,
      fetched_at: new Date().toISOString(),
      quote_timestamp: null,
      count: rows.length,
      empty_reason: rows.length === 0 ? "上游请求成功但返回空列表；行情日期/筛选口径仍需核实，不能直接视为没有强势板块。" : null,
      note: "fetched_at 是请求成功时间，不等于行情归属日期；本接口未提供可核验的行情时间戳。空列表与请求失败分开处理。",
      rows,
    });
  },
};
