# 运行数据检查与样本统计

本项目暂时不依赖第三方 Python 包，安装 Python 3 即可运行。

在仓库根目录先检查数据，再做统计：

```bash
python scripts/validate_data.py
python scripts/analyze_signals.py
```

也可以只检查其中一张表：

```bash
python scripts/validate_data.py market
python scripts/validate_data.py sector
python scripts/validate_data.py signals
```

也可以指定另一个已填写的个股 CSV：

```bash
python scripts/analyze_signals.py data/my_stock_signals.csv
```

数据检查会核对必需字段、日期格式、数字字段、股票代码外观及疑似重复记录。它不能证明记录的行情数据真实无误，疑似重复项也需要人工核对。

统计脚本会统计次日收盘涨幅、次日最高涨幅、3日/5日最高涨幅，并按当日连板高度、信号出现批次、板块地位和是否符合模型分组。空白字段会被忽略。

**重要限制：**这是描述性统计，不是完整回测。尚未处理真实买入触发、涨停排队买不到、跌停卖不出、手续费、滑点、持仓资金占用等问题。样本少时不能据此认定策略有效。
