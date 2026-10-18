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
    "market": ["日期", "指数涨跌_pct", "两市成交额_亿元", "上涨家数", "下跌家数", "市场阶段"],
    "sector": ["日期", "板块名称", "事件/催化", "A股映射逻辑", "板块涨跌_pct", "板块地位"],
    "signals": ["信号日期", "股票代码", "股票名称", "概念归属", "信号来源", "信号出现批次", "当日连板高度", "次日收盘涨幅_pct", "3日最高涨幅_pct", "5日最高涨幅_pct"],
}
DATE_FIELDS = {"日期", "信号日期"}
PERCENT_FIELDS = {
    "指数涨跌_pct", "板块涨跌_pct", "次日最高涨幅_pct", "次日收盘涨幅_pct",
    "3日最高涨幅_pct", "5日最高涨幅_pct", "换手率", "相对5日线偏离_pct", "计划仓位_pct",
}
NUMERIC_SUFFIXES = ("_亿元", "_pct", "涨停家数", "跌停家数", "上涨家数", "下跌家数", "当日连板高度", "此前连续涨停天数")


def blank(v):
    return v is None or not v.strip()


def validate(label, path):
    errors, warnings = [], []
    if not path.exists():
        return [f"{label}: 文件不存在：{path.relative_to(ROOT)}"], warnings
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        missing = [name for name in REQUIRED[label] if name not in headers]
        if missing:
            errors.append(f"{label}: 缺少字段：{', '.join(missing)}")
        rows = list(reader)
    if not rows:
        warnings.append(f"{label}: 只有表头，尚无数据。")
        return errors, warnings

    seen = Counter()
    for i, row in enumerate(rows, start=2):
        if all(blank(v) for v in row.values()):
            warnings.append(f"{label} 第{i}行为空行。")
            continue
        dfield = "日期" if label != "signals" else "信号日期"
        if not blank(row.get(dfield)):
            try:
                date.fromisoformat(row[dfield].strip())
            except ValueError:
                errors.append(f"{label} 第{i}行：{dfield} 应为 YYYY-MM-DD。")
        if label == "signals":
            key = (row.get("信号日期", "").strip(), row.get("股票代码", "").strip(), row.get("信号来源", "").strip())
            if all(key):
                seen[key] += 1
        for field, value in row.items():
            if blank(value):
                continue
            if field in PERCENT_FIELDS or field.endswith(NUMERIC_SUFFIXES):
                try:
                    float(value.strip().replace("%", "").replace(",", ""))
                except ValueError:
                    errors.append(f"{label} 第{i}行：字段“{field}”不是有效数字：{value!r}")
        if label == "signals" and not blank(row.get("股票代码")):
            code = row["股票代码"].strip()
            if not code.isdigit() or len(code) not in (6,):
                warnings.append(f"{label} 第{i}行：股票代码 {code!r} 不像6位A股代码，请核对。")
    for key, count in seen.items():
        if count > 1:
            warnings.append(f"signals: 疑似重复记录 {key}，出现 {count} 次；请核对是否同一信号重复录入。")
    return errors, warnings


def main():
    selected = sys.argv[1:] or list(FILES)
    unknown = [x for x in selected if x not in FILES]
    if unknown:
        raise SystemExit("未知表名：" + ", ".join(unknown) + "。可选：market, sector, signals")
    all_errors, all_warnings = [], []
    for label in selected:
        errors, warnings = validate(label, FILES[label])
        print(f"\n[{label}]")
        print(f"检查文件：{FILES[label].relative_to(ROOT)}")
        print(f"错误：{len(errors)}；提醒：{len(warnings)}")
        for item in errors:
            print("ERROR:", item)
        for item in warnings:
            print("提示:", item)
        all_errors.extend(errors)
        all_warnings.extend(warnings)
    print(f"\n总计：{len(all_errors)} 个错误，{len(all_warnings)} 条提醒。")
    print("提醒不一定代表数据错误；日期/代码/重复项请结合原始记录核对。")
    raise SystemExit(1 if all_errors else 0)


if __name__ == "__main__":
    main()
