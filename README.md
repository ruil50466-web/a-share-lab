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
- `docs/how_to_run.md`：统计脚本使用说明。
- `docs/historical_data_import.md`：历史数据导入与收益口径规范。
- `scripts/analyze_signals.py`：基于标准库的样本描述性统计脚本。
- `scripts/validate_data.py`：CSV字段、日期、数值与疑似重复记录检查。
- `services/market-data-worker.js`：Cloudflare Worker 只读后端，支持行业/概念板块排行和涨停/炸板/跌停池。
- `market.html`：手机端收盘复盘页面，连接 Worker 后展示板块排行、涨停梯队及炸板/跌停反馈。
- `stock-picker.html`：智能选股 v1，基于板块排行、涨停池和炸板池对候选做透明规则排序；当前不是完整全市场扫描，详见 `docs/stock_picker_v1.md`。

## 快速开始

在仓库根目录运行：

```bash
python scripts/validate_data.py
python scripts/analyze_signals.py
```

统计脚本默认读取 `data/templates/stock_signals.csv`。也可以把已填写的 CSV 路径作为第一个参数传入。当前脚本做描述性统计，不是完整可成交回测。

## 建议工作流

1. 收盘后先核对交易日期和数据质量。
2. 对每条重要消息记录受益逻辑、A股映射和可观察的盘面证据。
3. 将个股信号写入观察表，事前写清触发条件与失效条件。
4. 后续按统一窗口记录表现，不只记录成功案例。
5. 样本量足够后再做统计和回测；在验证前不把假设视为有效策略。

## 数据原则

- 事实与判断分开记录。
- 未知值留空，不猜填。
- 百分比字段填数字，例如 `5.2` 代表 `5.2%`。
- 行情接口的查询时间不等于行情时间；空池不等于真实家数为零。
- 历史结果不保证未来表现；本项目用于研究与验证，不构成投资建议。

## 手机网页

- `index.html`：个股快照质量检查、历史日线均线与相对量能、基础市场扫描。
- `market.html`：收盘复盘页。连接已部署的 Worker 后，可拉取概念/行业板块排行、涨停池、炸板池和跌停池，并复制原始复盘材料供进一步分析。
- `services/market-data-worker.js`：公开行情数据的只读代理；部署步骤见 `docs/market_data_worker_deploy.md`。

### 重要限制

- `market.html` 需要先部署 Worker，再在页面中填入 Worker 的 HTTPS 根地址；Worker 未部署时页面不会生成模拟数据。
- 公开行情接口可能限流、变更或返回不完整数据。板块涨幅榜不是主线确认，池子计数也不自动代表全市场完整覆盖。
- 历史日线使用前复权价格；不要与复权口径未核实的快照直接混算。
- 当前页面用于收盘复盘与研究，不是持续运行的盯盘服务，也不提供自动下单。


## 妖股模型研究（2026-10-20）

- [妖股模型假设清单 v1](strategies/妖股模型假设清单_v1.md)：整理前置涨停、连板阶段、信号数量周期、板块聚集、可交易性、第一批信号与核心识别等待验证假设。
- [2026-08-20 至 2026-10-20 妖信号原始名单](data/observations/yaogu_signal_pool_20260820_20261020.csv)：按用户口述保存89条日期—股票记录；代码、概念和后续行情尚待核验。
- 原有 [妖信号与龙头识别策略](strategies/妖信号与龙头识别策略.md) 继续保留龙头相对强弱、量价效率与研究流程。

注意：原始名单不等于完整回测数据。未知字段留空；在补齐历史行情和失败样本前，不报告策略胜率或宣称假设成立。

## 妖信号历史K线验证（第一阶段）

- `scripts/fetch_yaogu_history.py`：读取 2026-08-20 至 2026-10-20 的正式妖信号名单，匹配股票代码、抓取历史日K和逐日官方涨停池，输出前置涨停特征与事件收益表。
- `scripts/analyze_yaogu_history.py`：汇总次日收盘、3/5/10日盘中高点、最大回撤及不同阈值触及率。
- `docs/yaogu_history_backtest.md`：运行方法、输出文件和统计口径。
- `.github/workflows/yaogu-history.yml`：相关文件更新后自动运行，并在工作日北京时间 19:30 定时刷新派生结果（需 GitHub Actions 与上游数据接口正常）。

运行方式：

```bash
python scripts/fetch_yaogu_history.py
python scripts/analyze_yaogu_history.py
```

本阶段是历史事件研究，不是成交级回测。六月旧样本明确排除；代码匹配不确定、行情接口失败、K线覆盖不足的记录必须单独核对。盘中最高价触及率不能称为真实可成交胜率。

