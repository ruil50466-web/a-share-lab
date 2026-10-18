# a-share-lab

A股短线研究与策略验证实验室。

## 项目目标

把短线交易中的观察转成可记录、可复盘、可验证的数据流程，重点研究：

1. 市场环境与连板梯队变化。
2. 事件催化 → A股映射 → 板块盘面验证。
3. 妖股信号、同概念分批出现与个股后续表现。
4. 交易假设、买入触发条件、失效条件和仓位纪律。
5. 策略样本统计，保留失败样本并控制幸存者偏差。

## 当前目录

- `data/templates/daily_market.csv`：每日市场环境记录模板。
- `data/templates/sector_tracking.csv`：板块与事件映射跟踪模板。
- `data/templates/stock_signals.csv`：个股信号与后续表现模板。
- `docs/data_dictionary.md`：字段口径和记录规范。
- `docs/strategy_rules.md`：待验证策略假设与验证纪律。
- `docs/how_to_run.md`：统计脚本使用说明。\n- `docs/historical_data_import.md`：历史数据导入与收益口径规范。
- `scripts/analyze_signals.py`：基于标准库的样本描述性统计脚本。\n- `scripts/validate_data.py`：CSV字段、日期、数值与疑似重复记录检查。

## 快速开始

在仓库根目录运行：

```bash
python scripts/validate_data.py\npython scripts/analyze_signals.py
```

脚本默认读取 `data/templates/stock_signals.csv`。也可以把已填写的 CSV 路径作为第一个参数传入。当前脚本做描述性统计，不是完整可成交回测。

## 建议工作流

1. 收盘后填写市场环境与板块数据。
2. 对每条重要消息记录受益逻辑、A股映射和可观察的盘面证据。
3. 将个股信号写入观察表，事前写清触发条件与失效条件。
4. 后续按统一窗口记录表现，不只记录成功案例。
5. 样本量足够后再做统计和回测；在验证前不把假设视为有效策略。

## 数据原则

- 事实与判断分开记录。
- 未知值留空，不猜填。
- 百分比字段填数字，例如 `5.2` 代表 `5.2%`。
- 历史结果不保证未来表现；本项目用于研究与验证，不构成投资建议。
