# Money Manager Mini Program

原生微信小程序资产管理工具，聚焦账户、持仓、净资产、资产分布和趋势。

## Tech Stack

- 微信原生小程序 + TypeScript
- 微信云开发 CloudBase 云函数
- TDesign Miniprogram 组件
- Vitest 领域模型单元测试

## Local Setup

```bash
npm install
npm run ci
```

在微信开发者工具中打开本目录。首次打开后，在“工具 -> 构建 npm”生成 `miniprogram/miniprogram_npm`。

本项目的 `package.json` 位于仓库根目录，`project.config.json` 已配置：

- `packNpmManually: true`
- `packageJsonPath: ./package.json`
- `miniprogramNpmDistDir: ./miniprogram/`

如果开发者工具仍提示找不到 npm 包，先确认根目录已执行 `npm install`，再关闭并重新打开项目后重新“构建 npm”。

## Cloud Functions

云函数位于 `cloudfunctions/`：

- `searchInstrument`: 多源股票/基金/ETF 搜索
- `syncQuotes`: 多源股票/基金/ETF 报价同步
- `syncFxRates`: 同步汇率
- `rebuildSnapshots`: 根据交易流水重建快照
- `syncUserData`: 本地优先数据同步

行情 API Key 只配置在云函数环境变量中，不在小程序端保存。当前报价优先级：

- 美股/ETF/基金：`TWELVE_DATA_API_KEY` -> `FMP_API_KEY` -> Yahoo 兜底 -> `ALPHA_VANTAGE_API_KEY`
- A 股/港股：东方财富/腾讯系公开接口兜底 -> Yahoo 兜底 -> Twelve Data/FMP/Alpha Vantage
- 国内基金：天天基金/东方财富基金估值接口兜底
- 汇率：仍使用 `ALPHA_VANTAGE_API_KEY`

推荐至少配置：

- `TWELVE_DATA_API_KEY`: 美股、ETF、部分基金主行情源
- `FMP_API_KEY`: 美股备用源
- `ALPHA_VANTAGE_API_KEY`: 汇率和最终兜底源

发布前不要提交或上传 `private.*.key`、`.env` 等敏感文件；仓库已通过 `.gitignore` 忽略这些文件。

如果微信开发者工具开启合法域名校验，需要在小程序后台把以下域名加入云函数/request 合法域名或云函数外网访问白名单：

- `api.twelvedata.com`
- `financialmodelingprep.com`
- `query1.finance.yahoo.com`
- `query2.finance.yahoo.com`
- `push2.eastmoney.com`
- `searchapi.eastmoney.com`
- `fundgz.1234567.com.cn`
- `www.alphavantage.co`

云同步发布前需要在云开发数据库中创建集合：

- `user_portfolios`

## Release Checklist

```bash
npm install
npm run ci
```

1. 在微信开发者工具中重新“构建 npm”。
2. 部署 `cloudfunctions/` 下所有云函数，并给行情函数配置需要的环境变量。
3. 在真机预览中验证账户新增、资金变动、股票/基金搜索、行情刷新、云同步和隐藏金额。
4. 确认 `private.*.key`、`.env` 没有进入代码仓库或上传包。
