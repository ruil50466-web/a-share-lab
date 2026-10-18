#!/usr/bin/env python3
"""Analyze completed rows in the A-share signal CSV using only Python stdlib.

Usage:
  python scripts/analyze_signals.py
  python scripts/analyze_signals.py path/to/stock_signals.csv

This is descriptive analysis, not a backtest: it does not model execution,
fees, slippage, limit-up fill constraints, or portfolio-level risk.
"""
import csv
import statistics
import sys
from pathlib import Path

DEFAULT_FILE = Path(__file__).resolve().parents[1] / "data" / "templates" / "stock_signals.csv"
RETURN_FIELDS = {
    "次日收盘涨幅_pct": "次日收盘涨幅",
    "次日最高涨幅_pct": "次日最高涨幅",
    "3日最高涨幅_pct": "3日最高涨幅",
    "5日最高涨幅_pct": "5日最高涨幅",
}


def parse_number(value):
    if value is None:
        return None
    value = value.strip().replace("%", "")
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def summarize(label, values):
    if not values:
        print(f"- {label}：暂无有效样本")
        return
    positive = sum(v > 0 for v in values)
    print(
        f"- {label}：样本 {len(values)}，正值占比 {positive / len(values):.1%}，"
        f"均值 {statistics.mean(values):.2f}%，中位数 {statistics.median(values):.2f}%，"
        f"最小/最大 {min(values):.2f}% / {max(values):.2f}%"
    )


def main():
    path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_FILE
    if not path.exists():
        raise SystemExit(f"找不到文件：{path}")

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    print(f"文件：{path}")
    print(f"记录行数：{len(rows)}")
    if not rows:
        print("当前没有记录。请先填写 CSV，再运行分析。")
        return

    for field, label in RETURN_FIELDS.items():
        values = [n for row in rows if (n := parse_number(row.get(field))) is not None]
        summarize(label, values)

    # Break out by the recorded board stage when enough observations exist.
    groups = {}
    for row in rows:
        stage = (row.get("当日连板高度") or "").strip()
        ret = parse_number(row.get("次日收盘涨幅_pct"))
        if stage and ret is not None:
            groups.setdefault(stage, []).append(ret)

    if groups:
        print("\n按当日连板高度分组（仅统计有次日收盘涨幅的记录）：")
        for stage in sorted(groups, key=lambda s: (not s.isdigit(), int(s) if s.isdigit() else s)):
            vals = groups[stage]
            print(
                f"- {stage}：样本 {len(vals)}，正值占比 "
                f"{sum(v > 0 for v in vals) / len(vals):.1%}，"
                f"中位数 {statistics.median(vals):.2f}%"
            )

    print("\n注意：缺失值不计入对应指标；小样本统计不代表稳定规律。")
    print("本脚本是描述性统计，不等于可成交回测；尚未计入费用、滑点和涨跌停成交限制。")


if __name__ == "__main__":
    main()
