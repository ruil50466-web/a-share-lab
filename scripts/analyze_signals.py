#!/usr/bin/env python3
"""Descriptive statistics for completed A-share signal records (stdlib only).

This is not a tradeable backtest: it does not model order execution, fees,
slippage, limit-up fill constraints, or portfolio-level risk.
"""
import csv
import statistics
import sys
from pathlib import Path

DEFAULT_FILE = Path(__file__).resolve().parents[1] / "data" / "templates" / "stock_signals.csv"
RETURN_FIELDS = {
    "次日收盘涨幅_pct": "次日收盘涨幅",
    "次日最高涨幅_pct": "次日最高涨幅（不代表可卖在最高点）",
    "3日最高涨幅_pct": "3日最高涨幅",
    "5日最高涨幅_pct": "5日最高涨幅",
}


def parse_number(value):
    if value is None:
        return None
    value = value.strip().replace("%", "").replace(",", "")
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


def print_group_summary(rows, field, title):
    groups = {}
    for row in rows:
        label = (row.get(field) or "").strip()
        ret = parse_number(row.get("次日收盘涨幅_pct"))
        if label and ret is not None:
            groups.setdefault(label, []).append(ret)
    if not groups:
        return
    print(f"\n{title}（仅统计有次日收盘涨幅的记录）：")
    for label, vals in sorted(groups.items()):
        print(
            f"- {label}：样本 {len(vals)}，正值占比 "
            f"{sum(v > 0 for v in vals) / len(vals):.1%}，"
            f"中位数 {statistics.median(vals):.2f}%"
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

    print_group_summary(rows, "当日连板高度", "按当日连板高度分组")
    print_group_summary(rows, "信号出现批次", "按信号出现批次分组")
    print_group_summary(rows, "板块地位", "按板块地位分组")
    print_group_summary(rows, "是否符合模型", "按模型符合度分组")

    print("\n注意：缺失值不计入对应指标；小样本统计不代表稳定规律。")
    print("本脚本是描述性统计，不等于可成交回测；尚未计入费用、滑点和涨跌停成交限制。")


if __name__ == "__main__":
    main()
