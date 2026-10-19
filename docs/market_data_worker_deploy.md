# 手机可访问的行情接口：部署说明

代码：
- `services/market-data-worker.js`：Cloudflare Worker 只读行情代理。
- `market.html`：手机端收盘复盘页。

## 部署 Worker

1. 登录 Cloudflare，进入 **Workers & Pages**。
2. 选择创建 Worker（Create / Create Worker，界面名称可能略有不同）。
3. 创建后进入在线编辑器，把 GitHub 仓库中 `services/market-data-worker.js` 的完整内容复制进去并部署。
4. 记下 Worker 的 HTTPS 根地址，例如 `https://你的-worker名.你的子域.workers.dev`。
5. 在浏览器逐一测试：
   - `/health`：应返回 `{"ok":true,...}`
   - `/api/sectors?type=concept&limit=10`：概念板块 JSON
   - `/api/sectors?type=industry&limit=10`：行业板块 JSON
   - `/api/limit-ups?type=zt&date=20261019`：指定交易日涨停池
   - `/api/limit-ups?type=broken&date=20261019`：炸板池
   - `/api/limit-ups?type=dt&date=20261019`：跌停池
6. 如果接口报错或返回空列表，先核对交易日、上游响应和字段，不要直接当作真实的零家数。

## 使用收盘复盘页

1. 等 GitHub Pages/Cloudflare Pages 部署完成后，打开 `https://a-share-lab.pages.dev/market.html`。
2. 将第 4 步得到的 Worker 根地址粘贴到“Worker HTTPS 地址”。
3. 点击“保存并检查连接”，确认 `/health` 正常。
4. 输入复盘交易日（8位格式，例如 `20261019`），点击“扫描复盘数据”。
5. 检查接口时间、交易日、空池警告，再点“复制复盘材料”，将材料交给 ChatGPT 做进一步分析。

## 页面当前能做什么

- 获取概念板块和行业板块排行。
- 获取指定日期的涨停池、炸板池和跌停池。
- 展示连板梯队原始字段，并计算接口返回池子的计数和可识别的最高连板。
- 复制原始数据摘要，供复盘时区分事实、计算、推断和未知项。

## 当前边界

- 这是一版收盘复盘工具，不是实时交易系统；接口返回的 `fetched_at` 代表查询时间，不保证报价时间。
- 板块涨幅高不自动等于主线；仍需结合前一交易日、持续性、核心股晋级、市场广度和事件催化。
- 公开行情端点可能限流、调整或暂时不可用。页面会提示失败，不用模拟数据填补。
- 本 Worker 只读，不自动下单。不要把未经鉴权的个人 FQGate 本地 API 直接暴露到公网。
- FQGate 本机数据接入属于下一阶段；在实时性、授权、网络安全和数据覆盖确认之前，收盘复盘先使用独立的公开行情数据源。
