#!/usr/bin/env python3
"""Fetch daily K-lines for the 2026-08-20..2026-10-20 妖信号 sample and compute event outcomes."""
import argparse, csv, json, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIGNALS = ROOT / "data/observations/yaogu_signal_pool_20260820_20261020.csv"
WORKER = "https://a-share-lab-market-data.ruil50466.workers.dev"
KLINE_API = "https://api.ashareapi.com/v1/kline"
FIELDS = ["date","code","open","close","high","low","volume","amount","turnover","source","price_basis"]

def get_json(url, timeout=25):
    req = urllib.request.Request(url, headers={"Accept":"application/json","User-Agent":"Mozilla/5.0 AShareLab-YaoguResearch/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def number(v):
    try: return float(v) if v not in (None,"") else None
    except (TypeError,ValueError): return None

def norm_code(v):
    s=str(v or "").strip()
    if s.startswith(("sh","sz")) and len(s)==8: return s
    if len(s)==6 and s.isdigit(): return ("sh" if s.startswith(("5","6","9")) else "sz")+s
    return ""

def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction="ignore"); w.writeheader(); w.writerows(rows)

def pct(a,b):
    return None if a is None or b in (None,0) else (a/b-1)*100

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--worker",default=WORKER)
    ap.add_argument("--kline-api",default=KLINE_API)
    ap.add_argument("--count",type=int,default=120)
    ap.add_argument("--sleep",type=float,default=.25)
    ap.add_argument("--out-dir",default=str(ROOT/"data/derived"))
    a=ap.parse_args(); out=Path(a.out_dir).expanduser().resolve()
    if not SIGNALS.exists(): raise SystemExit(f"找不到原始名单：{SIGNALS}")
    with SIGNALS.open(encoding="utf-8-sig",newline="") as f: signals=list(csv.DictReader(f))
    if not signals: raise SystemExit("原始名单为空，停止。")
    print(f"正式样本 {len(signals)} 条；仅用 2026-08-20 至 2026-10-20，排除六月旧样本。")

    universe=[]; page=1; total=None
    while page<=100:
        u=f"{a.worker.rstrip('/')}/api/stocks?page={page}&size=500"; p=get_json(u)
        if p.get("ok") is False or not isinstance(p.get("rows"),list): raise RuntimeError(f"股票列表接口失败：{p}")
        rows=p["rows"]; universe.extend(rows)
        try: total=int(p.get("total")) if p.get("total") is not None else total
        except (TypeError,ValueError): pass
        if not rows or (total is not None and len(universe)>=total) or len(rows)<500: break
        page+=1; time.sleep(.15)
    if not universe: raise RuntimeError("股票列表为空；停止，不能把接口失败当成零样本。")
    by_name={}
    for r in universe:
        name=str(r.get("name") or "").strip(); code=norm_code(r.get("code"))
        if name and code: by_name.setdefault(name,set()).add(code)
    name_code={}; unmatched=[]
    for s in signals:
        name=(s.get("股票名称") or "").strip(); cs=sorted(by_name.get(name,set()))
        if len(cs)==1: name_code[name]=cs[0]
        else: unmatched.append({"信号日期":s.get("信号日期",""),"股票名称":name,"候选代码":";".join(cs),"原因":"未匹配到当前股票列表" if not cs else "同名多代码，需人工核验"})
    code_name={v:k for k,v in name_code.items()}; bars=[]; errors=[]
    for i,(code,name) in enumerate(code_name.items(),1):
        try:
            q=urllib.parse.urlencode({"code":code,"period":"day","count":str(max(30,min(a.count,500)))})
            p=get_json(a.kline_api.rstrip("?")+"?"+q,30)
            if p.get("ok") is False: raise RuntimeError(str(p.get("message") or p.get("error") or "K线接口失败"))
            d=p.get("data"); raw=d if isinstance(d,list) else d.get("data",d.get("klines",[])) if isinstance(d,dict) else []
            if not isinstance(raw,list): raw=[]
            n=0
            for b in raw:
                if not isinstance(b,dict): continue
                date=b.get("date") or b.get("日期") or b.get("trade_date")
                close=number(b.get("last",b.get("close",b.get("收盘"))))
                if not date or close is None: continue
                bars.append({"date":str(date)[:10],"code":code,"open":number(b.get("open",b.get("开盘"))),"close":close,"high":number(b.get("high",b.get("最高"))),"low":number(b.get("low",b.get("最低"))),"volume":number(b.get("volume",b.get("成交量"))),"amount":number(b.get("amount",b.get("成交额"))),"turnover":number(b.get("turnover",b.get("换手率"))),"source":"api.ashareapi.com/v1/kline","price_basis":"前复权（待复核）"})
                n+=1
            if not n: errors.append({"股票代码":code,"股票名称":name,"错误":"接口返回0根可识别日K"})
            print(f"[{i}/{len(code_name)}] {name} {code}: {n} 根")
        except Exception as e:
            errors.append({"股票代码":code,"股票名称":name,"错误":str(e)[:500]}); print(f"[{i}/{len(code_name)}] {name} {code}: 失败 {e}")
        time.sleep(max(0,a.sleep))

    unique={(b["code"],b["date"]):b for b in bars}
    bars=sorted(unique.values(),key=lambda b:(b["code"],b["date"]))
    by_code={}
    for b in bars: by_code.setdefault(b["code"],[]).append(b)
    outcomes=[]
    for s in signals:
        name=(s.get("股票名称") or "").strip(); date=(s.get("信号日期") or "")[:10]; code=name_code.get(name,"")
        bs=by_code.get(code,[]); dates=[b["date"] for b in bs]
        base={"信号日期":date,"股票代码":code,"股票名称":name,"当日收盘":"","次日收盘收益_pct":"","次日最高收益_pct":"","3日最高收益_pct":"","5日最高收益_pct":"","10日最高收益_pct":"","3日最大回撤_pct":"","5日最大回撤_pct":"","有效后续K线数":0,"状态":"代码未匹配或缺少信号日K线"}
        if code and date in dates:
            i=dates.index(date); close=bs[i]["close"]; fut=bs[i+1:]
            def hi(n):
                if len(fut) < n: return ""
                vals=[x["high"] for x in fut[:n] if x["high"] is not None]
                return round(pct(max(vals),close),4) if vals else ""
            def lo(n):
                if len(fut) < n: return ""
                vals=[x["low"] for x in fut[:n] if x["low"] is not None]
                return round(pct(min(vals),close),4) if vals else ""
            base.update({"当日收盘":close,"次日收盘收益_pct":round(pct(fut[0]["close"],close),4) if fut else "","次日最高收益_pct":round(pct(fut[0]["high"],close),4) if fut and fut[0]["high"] is not None else "","3日最高收益_pct":hi(3),"5日最高收益_pct":hi(5),"10日最高收益_pct":hi(10),"3日最大回撤_pct":lo(3),"5日最大回撤_pct":lo(5),"有效后续K线数":len(fut),"状态":"10日窗口完整" if len(fut)>=10 else "后续K线不足，窗口未完成"})
        outcomes.append(base)
    write_csv(out/"yaogu_daily_klines.csv",bars,FIELDS)
    write_csv(out/"yaogu_signal_code_match.csv",[{"股票名称":n,"股票代码":c} for n,c in sorted(name_code.items())],["股票名称","股票代码"])
    write_csv(out/"yaogu_unmatched_names.csv",unmatched,["信号日期","股票名称","候选代码","原因"])
    write_csv(out/"yaogu_signal_outcomes.csv",outcomes,["信号日期","股票代码","股票名称","当日收盘","次日收盘收益_pct","次日最高收益_pct","3日最高收益_pct","5日最高收益_pct","10日最高收益_pct","3日最大回撤_pct","5日最大回撤_pct","有效后续K线数","状态"])
    write_csv(out/"yaogu_fetch_errors.csv",errors,["股票代码","股票名称","错误"])
    print("\n输出目录：",out)
    print(f"名称匹配 {len(name_code)} 个；未匹配/歧义 {len(unmatched)} 条；历史K线 {len(bars)} 根；抓取错误 {len(errors)} 条。")
    print("收益以信号日收盘为基准，仅计算之后交易日；最高收益不代表可成交卖点。检查日期覆盖、复权口径和缺失记录后再计算正式胜率。")

if __name__=="__main__": main()
