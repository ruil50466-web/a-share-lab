# 手机可访问的行情接口：部署说明

当前代码文件：`services/market-data-worker.js`

## 现在已经完成什么

- 已把东方财富只读行情接口封装成 Cloudflare Worker 入口代码。
- 固定支持概念板块和行业板块；不允许传入任意上游 URL。
- 新增涨停池、炸板池、跌停池查询，支持指定 `YYYYMMDD` 日期。
- 板块返回涨跌幅、成交额、上涨/下跌家数、领涨股；涨停池返回连板数、首次/最后封板时间、炸板次数等字段。
- 这是代码已提交到 GitHub；**还没有部署成公网服务**，因此现在还没有可供 ChatGPT 调用的线上地址。

## 最小部署步骤

1. 登录 Cloudflare，进入 **Workers & Pages**。
2. 选择创建 Worker（Create / Create Worker，界面名称可能略有不同）。
3. 创建后进入在线编辑器，把 `services/market-data-worker.js` 的完整内容复制进去并部署。
4. 部署后记下 Worker 的 HTTPS 地址，例如 `https://你的-worker名.你的子域.workers.dev`。
5. 在浏览器测试：
   - `/health`：应返回 `{"ok":true,...}`
   - `/api/sectors?type=concept&limit=10`：应返回概念板块 JSON
   - `/api/sectors?type=industry&limit=10`：应返回行业板块 JSON
   - `/api/limit-ups?type=zt`：查询默认日期的涨停池
   - `/api/limit-ups?type=broken`：查询炸板池
   - `/api/limit-ups?type=dt`：查询跌停池
   - 可指定日期，例如 `/api/limit-ups?type=zt&date=20261016`

## 当前边界

- 已有板块排行与涨停/炸板/跌停池接口；尚未把这些数据接入手机网页，指数环境和新闻事件映射也还未打通。
- 行情接口来自公开行情端点，可能限流、调整或暂时不可用；必须检查返回时间和交易日。
- 不要把它当成实时交易系统，也不要用它直接自动下单。
- 这个 Worker 只是后端 API 的第一步。ChatGPT 是否能直接连接它，仍取决于账号可用的自定义连接功能；Free 账号不能预设支持自定义 MCP。
