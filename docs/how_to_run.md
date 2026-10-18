# 运行策略样本统计

本项目暂时不依赖第三方 Python 包，Python 3 即可运行。

在仓库根目录执行：

```bash
python scripts/analyze_signals.py
```

也可以指定另一个已填写的 CSV：

```bash
python scripts/analyze_signals.py data/my_stock_signals.csv
```

脚本会统计次日收盘涨幅、次日最高涨幅、3 日/5 日最高涨幅，并按“当日连板高度”分组。空白字段会被忽略。

**重要限制：**这是描述性统计，不是完整回测。尚未处理真实买入触发、涨停排队买不到、跌停卖不出、手续费、滑点、持仓资金占用等问题。样本少时不能据此认定策略有效。
