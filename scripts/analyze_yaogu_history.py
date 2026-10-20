#!/usr/bin/env python3
"""Summarize event-study outcomes without treating intraday highs as executable wins."""
import argparse, csv, statistics
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DEFAULT=ROOT/"data/derived/yaogu_signal_outcomes.csv"

def n(v):
    try: return float(v) if v not in (None,"") else None
    except (TypeError,ValueError): return None

def summarize(rows, field, label):
    vals=[n(r.get(field)) for r in rows]
    vals=[v for v in vals if v is not None]
    if not vals:
        print(f"{label}: 无有效样本"); return
    print(f"{label}: n={len(vals)} | 正收益={sum(v>0 for v in vals)/len(vals):.1%} | 中位数={statistics.median(vals):.2f}% | 均值={statistics.mean(vals):.2f}% | min/max={min(vals):.2f}%/{max(vals):.2f}%")
    if field in ("3日最高收益_pct","5日最高收益_pct","10日最高收益_pct"):
        for threshold in (5,10,20):
            print(f"  触及 +{threshold}% 盘中高点占比（不是可实现胜率）: {sum(v>=threshold for v in vals)/len(vals):.1%}")


def grouped(rows, group_field):
    groups={}
    for row in rows:
        key=str(row.get(group_field) or "").strip()
        value=n(row.get("5日最高收益_pct"))
        if not key or value is None: continue
        groups.setdefault(key,[]).append((value,n(row.get("次日收盘收益_pct"))))
    if not groups:
        print(f"\n按{group_field}分组：暂无完整5日窗口数据"); return
    print(f"\n按{group_field}分组（仅计入有完整5日最高收益的事件）：")
    for key, pairs in sorted(groups.items(),key=lambda x:x[0]):
        highs=[p[0] for p in pairs]
        next_close=[p[1] for p in pairs if p[1] is not None]
        hit10=sum(v>=10 for v in highs)/len(highs)
        next_pos=sum(v>0 for v in next_close)/len(next_close) if next_close else None
        next_text=f"{next_pos:.1%}" if next_pos is not None else "无数据"
        print(f"  {key}: n={len(highs)} | 5日盘中高点触及+10%={hit10:.1%} | 5日高点收益中位数={statistics.median(highs):.2f}% | 次日收盘正收益={next_text}")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("file",nargs="?",default=str(DEFAULT))
    a=ap.parse_args(); path=Path(a.file)
    if not path.exists(): raise SystemExit(f"找不到结果文件：{path}。先运行 scripts/fetch_yaogu_history.py")
    with path.open(encoding="utf-8-sig",newline="") as f: rows=list(csv.DictReader(f))
    if not rows: raise SystemExit("结果文件没有记录。")
    valid=[r for r in rows if r.get("股票代码") and r.get("状态")!="代码未匹配或缺少信号日K线"]
    unique=len({r.get("股票代码") for r in valid})
    print(f"结果文件: {path}\n事件记录: {len(rows)} | 有信号日K线: {len(valid)} | 涉及不同股票: {unique}")
    print(f"后续5根K线完整: {sum(n(r.get('有效后续K线数'))>=5 for r in valid)}")
    for field,label in [
        ("次日收盘收益_pct","次日收盘收益"),
        ("次日最高收益_pct","次日盘中最高收益"),
        ("3日最高收益_pct","3日盘中最高收益"),
        ("5日最高收益_pct","5日盘中最高收益"),
        ("10日最高收益_pct","10日盘中最高收益"),
        ("3日最大回撤_pct","3日最大回撤"),
        ("5日最大回撤_pct","5日最大回撤"),
    ]: summarize(valid,field,label)
    print("\n解释限制：正收益率不是策略胜率；盘中最高价命中率不是可成交胜率。需先核对代码匹配、数据覆盖、复权口径和信号可见时点。")
    grouped(valid,"信号日连板高度")
    grouped(valid,"前5交易日涨停次数")
    print("六月旧样本未被读取。重复入选按信号事件保留，因此事件条数不等于独立股票数。")

if __name__=="__main__": main()
