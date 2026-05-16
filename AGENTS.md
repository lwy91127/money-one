# AGENTS.md

本文件面向参与本仓库开发的 AI Agent 和协作开发者。目标是让后续改动保持在当前产品逻辑、技术栈和微信小程序约束内，减少重复踩坑。

## 项目概览

这是一个本地优先的资产管理微信小程序，定位是记录用户在不同渠道/账户下的资产分布，并对股票、基金等投资账户通过行情估值展示持仓、盈亏、分布和净资产。

产品重点：

- 记录账户、现金余额、股票/基金持仓和净资产。
- 账户只是资产所在渠道或载体，不承担真实交易账户的复杂语义。
- 股票按股数录入并查询价格，基金按份数录入并查询净值，现金类账户手动录入金额。
- 小程序端不直接请求第三方行情接口，统一通过云函数代理、缓存和归一化。
- 当前 UI 是浅色移动端财务仪表盘风格，白色卡片、浅灰背景、紫色交互强调、绿色收益、红色风险。

## 技术栈

- 原生微信小程序 + TypeScript
- 微信云开发 CloudBase 云函数
- TDesign Miniprogram
- Vitest 单元测试

关键配置：

- 小程序根目录：`miniprogram/`
- 云函数根目录：`cloudfunctions/`
- NPM 依赖在仓库根目录 `package.json`
- 微信开发者工具需要执行“工具 -> 构建 npm”
- `project.config.json` 已启用 `packNpmManually`

## 常用命令

```bash
npm install
npm run typecheck
npm run test
npm run ci
```

提交或交付前至少运行：

```bash
npm run ci
```

## 目录结构

```text
miniprogram/
  app.json                  页面、窗口和自定义 tab 配置
  app.ts                    小程序启动入口
  app.wxss                  全局样式、浅色主题基础
  custom-tab-bar/           固定底部自定义 tab
  pages/dashboard/          资产首页，持仓总览、市场分组、资产分布
  pages/accounts/           账户列表、账户详情、新增账户浮层
  pages/settings/           主币种、隐藏金额、本地数据重置
  services/
    store.ts                本地存储、账户/持仓写入、同步入口
    portfolio.ts            交易流水派生余额、持仓、分布、趋势
    instrumentSearch.ts     小程序端行情搜索/报价云函数封装
    seed.ts                 示例数据和默认数据
  types/index.ts            核心领域类型
  utils/                    金额、日期、tab 同步工具

cloudfunctions/
  searchInstrument/         股票/基金搜索，多行情源 fallback
  syncQuotes/               股票/基金/ETF 报价和净值查询
  syncFxRates/              汇率同步
  rebuildSnapshots/         快照重建
  syncUserData/             云同步

tests/                      领域模型和云函数归一化测试
```

## 核心数据模型

主要类型在 `miniprogram/types/index.ts`：

- `Account`: 账户，表示资产所在渠道或载体。
- `AssetType`: 资产类型，如现金、股票、基金、负债等。
- `Instrument`: 投资标的，如股票、基金、ETF。
- `Transaction`: 事实流水，用于派生现金余额、持仓股数/份数、成本。
- `Quote`: 行情价格或基金净值。
- `FxRate`: 汇率。
- `PortfolioSummary`: 首页和账户页使用的汇总结果。

注意：

- 金额使用 decimal 字符串，不要在存储层直接长期保存浮点结果。
- 金额计算优先使用 `miniprogram/utils/money.ts`。
- 展示层使用 `formatMoney`、`formatPercent`。
- 不要把 API Key、私钥、`.env` 或其它敏感信息提交到仓库。

## 数据流和业务规则

本地数据入口：

- 读取：`loadAppData()`
- 写入：`saveAppData()`
- 重置：`resetAppData()`
- 设置：`updateSettings()`

账户和资产写入：

- 现金类账户：`addAccount()` 后调用 `setAccountCashBalance()` 写入初始金额。
- 股票/基金账户：`addAccount()` 后调用 `addInstrumentPosition()` 写入买入流水和报价。
- 删除账户：`deleteAccount()` 是软删除，会归档账户并标记相关流水 `deletedAt`。

派生汇总：

- `buildLedger()` 从交易流水构造现金和持仓状态。
- `deriveHoldings()` 通过最新报价计算持仓市值和未实现盈亏。
- `deriveAccountBalances()` 计算账户余额。
- `derivePortfolioSummary()` 计算首页需要的总资产、负债、净资产、分布和趋势。

新增或修改业务逻辑时，优先扩展这些服务层函数，不要在页面里复制计算逻辑。

## 页面约定

### 资产页 `pages/dashboard`

当前作为持仓视角首页：

- 顶部展示持仓总资产、持仓盈亏、已实现盈亏和同步状态。
- 持仓按市场分组展示，例如美国市场、中国市场、香港市场。
- 资产分布使用 `assetTypeDistribution`。
- 加号应直接打开新增账户/持仓的底部浮层，不跳转到账户页。

### 账户页 `pages/accounts`

当前作为账户视角：

- 顶部展示净资产、总资产、总负债和账户数量。
- 账户列表可点击进入详情。
- 新增账户底部浮层区分账户类型。
- 股票录入股数，基金录入份数，现金类录入金额。

### 账户详情 `pages/accounts/detail`

展示单个账户的现金、持仓、总额和删除/调整操作。

### 设置页 `pages/settings`

只保留必要设置：

- 主币种
- 隐藏金额
- 重置本地数据

行情 API Key 不在小程序设置页配置，应放在云函数环境变量。

## UI 规范

当前视觉方向是浅色、现代、移动端财务仪表盘：

- 页面背景：浅灰或极浅蓝灰。
- 内容容器：白色或轻微渐变卡片。
- 主强调色：紫色系，用于 tab 激活、按钮、选中态。
- 收益：绿色；风险/负收益：红色。
- 底部 tab 必须固定到底部，避免被页面滚动带走。
- 新增账户使用底部弹出浮层，不使用整页跳转。
- 表单里的账户类型、货币、市场选择使用平铺按钮/分段控件，不使用滚轮 picker。
- 避免深色大面积背景、低对比文字、白底白字或黑底黑字。
- 修改样式时同步检查 `app.wxss`、`custom-tab-bar/index.wxss` 和对应页面 WXSS。

## 行情和云函数

小程序端通过 `miniprogram/services/instrumentSearch.ts` 调用云函数：

- `remoteInstrumentSearch()` 调用 `searchInstrument`
- `queryInstrumentQuote()` 调用 `syncQuotes`

云函数行情源：

- 美股/ETF/部分基金：Twelve Data、FMP、Yahoo、Alpha Vantage
- A 股/港股：东方财富、Yahoo、Twelve Data、FMP、Alpha Vantage
- 国内基金：天天基金/东方财富基金接口
- 汇率：Alpha Vantage

推荐环境变量：

- `TWELVE_DATA_API_KEY`
- `FMP_API_KEY`
- `ALPHA_VANTAGE_API_KEY`

云函数需要保持短超时和 fallback 策略。当前 provider 请求超时较短，用于避免微信云函数默认测试超时。新增行情源时要：

- 不在小程序端暴露 key。
- 返回统一的 `InstrumentSearchResult` 或 `Quote`。
- 失败时返回可解释错误，不能让整个查询长时间阻塞。
- 有可用结果时优先返回结果，不要因为其它 provider 失败导致整体失败。

## 测试策略

现有测试覆盖：

- 金额和 decimal 工具
- 交易流水派生持仓/余额/趋势
- 云函数行情字段归一化和 provider 行为

新增业务逻辑时优先补充：

- `tests/money.test.ts`
- `tests/portfolio.test.ts`
- `tests/cloud-normalizers.test.ts`

高风险改动必须覆盖：

- 买入、卖出、分红、利息、估值调整
- 股票股数和基金份数计算
- 多币种折算
- 软删除账户后汇总是否排除
- 行情 stale/fallback 场景

## 微信开发者工具注意事项

首次打开项目：

1. 在仓库根目录执行 `npm install`。
2. 用微信开发者工具打开仓库根目录。
3. 执行“工具 -> 构建 npm”。

如果提示找不到 npm 包：

- 确认 `project.config.json` 的 `miniprogramRoot` 是 `miniprogram/`。
- 确认 `packNpmManually` 为 `true`。
- 确认 `packNpmRelationList` 指向根目录 `package.json`，输出到 `./miniprogram/`。
- 关闭并重新打开开发者工具后再次构建 npm。

## CloudBase 部署注意事项

云函数目录下每个函数都有自己的 `package.json`。部署云函数前需要在对应函数目录安装依赖，或使用微信开发者工具/CloudBase CLI 的云函数上传流程。

云函数依赖 `wx-server-sdk` 时，必须确保函数包内包含依赖，否则线上会报：

```text
Cannot find module 'wx-server-sdk'
```

云数据库至少需要集合：

- `user_portfolios`

云函数测试时如果 3 秒超时，优先检查：

- 函数测试超时时间是否太短。
- 第三方行情源是否 403/429。
- 是否缺失 API Key。
- provider fallback 是否串行快速返回。

## AI 协作规则

开发前先读相关页面、服务层和类型定义，不要只改 WXML/WXSS。

改动原则：

- 页面只做交互和展示，核心计算放在 `services/portfolio.ts` 或 `services/store.ts`。
- 不要绕过 `loadAppData()` 和 `saveAppData()` 直接操作存储。
- 不要把资金、持仓、汇率计算散落到页面文件。
- 不要引入新的前端框架或状态管理库。
- 不要把第三方行情请求放到小程序端。
- 不要提交构建产物 `miniprogram/miniprogram_npm`，除非项目明确要求。
- 不要提交敏感文件。
- 不要大规模重构无关代码。

修改完成后：

1. 运行 `npm run ci`。
2. 如果改了小程序依赖，在微信开发者工具里重新构建 npm。
3. 如果改了 UI，在开发者工具模拟器和真机预览里检查底部 tab、底部弹层、表单输入和安全区。
4. 如果改了云函数，在云端测试 `searchInstrument`、`syncQuotes` 和相关函数。

## 常见任务入口

- 优化资产首页：从 `miniprogram/pages/dashboard/index.ts|wxml|wxss` 开始。
- 优化账户列表或新增账户：从 `miniprogram/pages/accounts/index.ts|wxml|wxss` 开始。
- 优化账户详情：从 `miniprogram/pages/accounts/detail.ts|wxml|wxss` 开始。
- 修改金额/汇率/持仓计算：从 `miniprogram/services/portfolio.ts` 和 `miniprogram/utils/money.ts` 开始。
- 修改本地写入逻辑：从 `miniprogram/services/store.ts` 开始。
- 修改股票/基金搜索：从 `cloudfunctions/searchInstrument/providers.js` 和 `miniprogram/services/instrumentSearch.ts` 开始。
- 修改股票/基金报价：从 `cloudfunctions/syncQuotes/providers.js` 开始。
- 修改同步：从 `cloudfunctions/syncUserData/index.js` 和 `miniprogram/services/store.ts` 开始。

