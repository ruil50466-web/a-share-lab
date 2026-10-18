#!/usr/bin/env python3
"""Validate the A-share research CSVs before analysis; Python standard library only."""
import csv
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "market": ROOT / "data/templates/daily_market.csv",
    "sector": ROOT / "data/templates/sector_tracking.csv",
    "signals": ROOT / "data/templates/stock_signals.csv",
}
REQUIRED = {
    "market": ["日期", "上证指数涨跌幅", "两市成交额_亿元", "上涨家数", "下跌家数", "市场阶段判断"],
    "sector": ["日期", "板块名称", "事件或催化", "映射逻辑", "板块涨跌幅", "核心股", "失效条件"],
    "signals": ["信号日期", "股票代码", "股票名称", "概念归属", "信号来源", "信号出现批次", "当日连板高度", "次日收盘涨幅_pct", "3日最高涨幅_pct", "5日最高涨幅_pct"],
}
PERCENT_FIELDS = {
    "上证指数涨跌幅", "深证成指涨跌幅", "创业板指涨跌幅", "板块涨跌幅",
    "次日最高涨幅_pct", "次日收盘涨幅_pct", "3日最高涨幅_pct",
    "5日最高涨幅_pct", "换手率", "相对5日线偏离_pct", "计划仓位_pct",
}
NUMERIC_FIELDS = {
    "两市成交额_亿元", "成交额较前日变化_亿元", "板块成交额变化",
    "上涨家数", "下跌家数", "涨停家数", "跌停家数", "最高连板", "最高板",
    "相对强度排名", "此前连续涨停天数", "当日连板高度", "流通市值_亿元",
    "收盘价", "成交额_亿元",
} | PERCENT_FIELDS


def blank(value):
    return value is None or not value.strip()


def validate(label, path):
    errors, warnings = [], []
    if not path.exists():
        return [f"{label}: 文件不存在：{path.relative_to(ROOT)}"], warnings
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        missing = [name for name in REQUIRED[label] if name not in headers]
        if missing:
            errors.append(f"{label}: 缺少字段：{', '.join(missing)}")
        rows = list(reader)
    if not rows:
        warnings.append(f"{label}: 只有表头，尚无数据。")
        return errors, warnings

    seen = Counter()
    for line, row in enumerate(rows, start=2):
        if all(blank(value) for value in row.values()):
            warnings.append(f"{label} 第{line}行为空行。")
            continue
        date_field = "信号日期" if label == "signals" else "日期"
        if not blank(row.get(date_field)):
            try:
                date.fromisoformat(row[date_field].strip())
            except ValueError:
                errors.append(f"{label} 第{line}行：{date_field} 应为 YYYY-MM-DD。")
        if label == "signals":
            key = tuple((row.get(field) or "").strip() for field in ("信号日期", "股票代码", "信号来源"))
            if all(key):
                seen[key] += 1
        for field, value in row.items():
            if blank(value) or field not in NUMERIC_FIELDS:
                continue
            try:
                float(value.strip().replace("%", "").replace(",", ""))
            except ValueError:
                errors.append(f"{label} 第{line}行：字段“{field}”不是有效数字：{value!r}")
        if label == "signals" and not blank(row.get("股票代码")):
            code = row["股票代码"].strip()
            if not code.isdigit() or len(code) != 6:
                warnings.append(f"{label} 第{line}行：股票代码 {code!r} 不像6位A股代码，请核对。")
    for key, count in seen.items():
        if count > 1:
            warnings.append(f"signals: 疑似重复记录 {key}，出现 {count} 次；请核对是否重复录入。")
    return errors, warnings


def main():
    selected = sys.argv[1:] or list(FILES)
    unknown = [item for item in selected if item not in FILES]
    if unknown:
        raise SystemExit("未知表名：" + ", ".join(unknown) + "。可选：market, sector, signals")
    total_errors, total_warnings = [], []
    for label in selected:
        errors, warnings = validate(label, FILES[label])
        print(f"\n[{label}] 检查文件：{FILES[label].relative_to(ROOT)}")
        print(f"错误：{len(errors)}；提醒：{len(warnings)}")
        for item in errors:
            print("ERROR:", item)
        for item in warnings:
            print("提示:", item)
        total_errors.extend(errors)
        total_warnings.extend(warnings)
    print(f"\n总计：{len(total_errors)} 个错误，{len(total_warnings)} 条提醒。")
    print("提醒不一定代表数据错误；请结合原始记录核对。")
    raise SystemExit(1 if total_errors else 0)


if __name__ == "__main__":
    main()
