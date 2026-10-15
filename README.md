# openchamber-session-usage

OpenChamber 扩展：右侧栏面板展示**当前打开的会话**的会话级用量（token、缓存命中率、费用、请求数），聊天右侧的 Work Status 卡里也有一节 4 个数字的常驻读数。

## 功能

- **KPI**：总 token、输入（未命中）、输出（含推理）、推理、缓存读取、缓存写入、缓存命中率、请求数、费用（DeepSeek 按官方峰谷价重算人民币；其他模型为 OpenCode 记账 USD）
  - 命中率 = `cacheRead ÷ (input + cacheRead + cacheWrite)`，分母含缓存写（悬停可见说明）
- **费用显示**：纯 DeepSeek 会话 `¥x.xxxx`；混合会话 `¥x.xxxx + $y`；无 DeepSeek 会话 `$y`；悬停可看峰/谷拆分
- **按模型拆分**：模型、请求数、输入/输出/缓存 token、费用（每行显示各自币种：DeepSeek 行 ¥，其他行 $）
- **子代理**：默认合并主会话与递归全部子代理子会话；可切换「仅主会话」；「子会话明细」可展开查看每个子会话的请求数/命中率/token/费用（子代理消息按各自时间戳判峰谷）
- **每次请求的 prompt 大小曲线**：input + cacheRead，按时间序，内置 SVG 折线（无第三方图表库）
- **刷新按钮** + 跟随 `host.onSession` 自动切换会话 + 可见时约 15s 轮询
- **优雅降级**：未连接会话 / 无数据 / 找不到数据库 / 本地服务不可用都有对应提示与重试
- **Work Status 区块**：本会话 token（含子代理）、命中率、费用、请求数；标题栏带刷新按钮（`setStatusControls`，旧宿主回退为区内小按钮）
- **中英双语**：跟随 OpenChamber 界面语言（zh-* → 中文，其余 → English）；主题跟随宿主（面板背景透明、颜色用 currentColor）

## 安装

### 方式一：从 Git 仓库安装（推荐）

1. 打开 OpenChamber → **Settings → Extensions**
2. 在 **Folder, ZIP, or URL** 里粘贴仓库地址：
   `https://github.com/xiaodke-rgb/openchamber-session-usage`
3. 授权对话框选择 **Allow and enable**（需要允许"本地服务"）

仓库里已包含构建产物（`panel/main.js`、`status/main.js`、`service/main.js`），安装时不需要构建；后续仓库有新提交时可在扩展页更新。

### 方式二：本地文件夹

1. 打开 OpenChamber → **Settings → Extensions**
2. 在 **Folder, ZIP, or URL** 里粘贴本文件夹路径：
   `/home/xiaodke/.config/openchamber/extensions/session-usage`
3. 授权对话框选择 **Allow and enable**（需要允许"本地服务"）

安装后：右侧栏出现「会话用量 / Session Usage」面板；聊天右侧 Work Status 卡出现「会话用量 / Session Usage」区块（需要 OpenChamber 2.0+ 的 `contributes.statusSection`）。

## 开发

```bash
npm install
npm run build   # 生成 panel/main.js、status/main.js、service/main.js
```

文件夹安装直接运行本目录：改代码 → `npm run build` → 在面板里重新加载扩展即可。

本地预览（不接宿主，mock 数据）：

```bash
node service/main.js                      # 需要 OPENCHAMBER_SERVICE_PORT / OPENCHAMBER_SERVICE_TOKEN
# 用任意静态服务器打开（case=pure|other|mixed 预览三种费用显示）：
# panel/index.html?mock=1&theme=dark&lang=zh&case=mixed
# status/index.html?mock=1&theme=dark&lang=en&case=mixed
```

## 数据与口径

| 数据 | 来源 |
|---|---|
| 用量 | `~/.local/share/opencode/opencode.db`（可用 `OPENCODE_DB` 覆盖）：OpenCode 2.x 读 `session_v2` + `session_message` 的 assistant 消息，1.x 读 `session` + `message`。**全模型，无过滤** |
| 费用（DeepSeek） | 按 DeepSeek 官方中文价目重算**人民币**（价目表与峰谷算法与 deepseek-usage 扩展保持一致，见下） |
| 费用（其他模型） | 每条消息 `data.cost`（OpenCode 自己按供应商价目记录的美元值） |
| 会话树 | `session_v2.parent_id` 递归取全部子代理后代 |
| 命中率 | `cacheRead ÷ (input + cacheRead + cacheWrite)`；分母为 0 时显示 `—` |

### 费用口径

- **DeepSeek 模型**（`model.id` 以 `deepseek` 开头、不区分大小写；含 `pro` 走 pro 档，否则 flash 档）：
  - 价目（元 / 1M tokens，谷/峰）：flash 命中 0.02/0.04、未命中 1/2、输出 4/8；pro 命中 0.15/0.3、未命中 4.5/9、输出 13.5/27
  - 峰时 = UTC 周一至周五 01:00–04:00、06:00–10:00（北京时间 09:00–12:00、14:00–18:00）；其余为谷时（半价）。不处理节假日
  - 计费项：`input` 按未命中价、`cacheRead` 按命中价、`output + reasoning` 按输出价；**缓存写不计费**
  - 子代理消息各按各自时间戳判峰谷
- **其他模型**：OpenCode 记账的 USD `cost`，不换算
- **不做汇率换算、不联网**；面板/status 显示规则：纯 DeepSeek → `¥x.xxxx`；混合 → `¥x.xxxx + $y`（$ 部分只含非 DeepSeek 模型）；无 DeepSeek → `$y`

服务只读打开数据库（`node:sqlite` 的 `DatabaseSync readOnly`，需要 node 22+ / OpenChamber 宿主内置）。首次请求全量扫描一次，之后每 15s 增量刷新（回扫最近 10 分钟的行）；快照缓存 15s，10 分钟无请求释放内存。

HTTP 路由（仅 `127.0.0.1:${OPENCHAMBER_SERVICE_PORT}`，`Authorization: Bearer ${OPENCHAMBER_SERVICE_TOKEN}`）：

- `GET /health` → `ok`
- `GET /session?sessionId=ses_…` → 会话报告：`main`（仅主会话）/ `total`（含递归子代理）/ `children[]` / `byModel[]` / `trend[]` 曲线点。费用字段：`cost`（全部消息的 OpenCode USD）、`costCny` + `costCnyPeak`/`costCnyOff`（DeepSeek 官方人民币及峰/谷拆分）、`costUsdOther`（非 DeepSeek 的 USD）、`hasDeepseek`/`hasOther`；`byModel[]` 每行带 `currency`/`amount`/`official`；响应含 `pricing` 元数据

## 说明

- 架构与部分实现参照 MIT 协议的 [openchamber-deepseek-usage](https://github.com/shusongLu/openchamber-deepseek-usage)（作者 shusongLu），按其模式重写为通用会话用量扩展。
- 仅读取本机数据库文件，不发起外网请求。

## English

An OpenChamber extension showing per-session usage for the **currently open session**: total tokens, input (cache miss), output (incl. reasoning), reasoning, cache read/write, cache hit rate, request count and cost — DeepSeek messages are recomputed in CNY from DeepSeek's official peak/off-peak price list (cache writes not billed; peak = Mon–Fri 01:00–04:00 & 06:00–10:00 UTC, off-peak at half price), all other models keep the OpenCode-recorded USD cost. No FX conversion, no network requests. Also includes a per-model breakdown (each row shown in its own currency), an expandable subagent list (merged by default, toggle to main-only), and an inline SVG prompt-size curve, plus a compact 4-number Work Status section. Bilingual (zh/en), follows the host theme, auto-refreshes every ~15s while visible.

Install: OpenChamber → Settings → Extensions → paste this folder → **Allow and enable** (needs the local-service permission). Requires OpenChamber 2.0.0+.
