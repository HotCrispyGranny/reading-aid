# 句读 Judu

句读是一个面向英文科研文献阅读的 PDF 阅读辅助工具，重点帮助中文读者进行逐句阅读、翻译、理解和 AI 辅助分析。阅读器保留 PDF 原始排版；界面主要使用英文，翻译和 AI 科学解释主要使用中文，并保留必要的英文术语。

基本流程：**导入 PDF → 点击句子并逐句阅读 → 按需翻译 → 保存高亮、词汇和笔记**。Ask AI 是可选功能，不影响普通阅读。

## 核心功能

| 功能 | 当前实现 |
| --- | --- |
| PDF 阅读 | 本地上传或拖放 PDF，缩放、适应宽度、按需渲染页面、缩略图、内嵌目录和原文搜索。单份 PDF 上限 150 MB。 |
| sentence-level focus | 点击识别出的句子，突出当前原文并淡化其他内容；可调淡化程度、聚焦颜色和边框。临时 focus 与永久高亮分开保存和处理。 |
| 逐句导航 | 在 Sentence focus 模式用 ↑ / ↓ 或底部按钮按逻辑阅读顺序移动；输入框编辑和有文字选区时不会抢占方向键。 |
| 句子索引与阅读顺序 | 重建常见单栏、双栏阅读顺序，处理跨行句子、缩写、小数、引用和断行连字符；正文、section heading 和 figure/table caption 分别识别。标题编号不会单独成为句子，图注文字仍可选择。 |
| 跨页 continuation | 满足版式、字体和正文连续性条件时，将跨栏或跨页的正文延续合并为一个逻辑句子；保留两页各自的文字来源和坐标。 |
| 来源映射与聚焦形状 | 逻辑文本、规范化文本与原始 PDF text runs 分开处理。聚焦几何来自原始文字项、字符偏移和页面坐标，不通过反向搜索规范化句子生成矩形；支持跨行及各页独立的形状。 |
| 永久高亮 | 选中文字后保存多色高亮；Highlighter 按钮可以再次点击退出。通过 Notes → Manage highlights 修改颜色或用垃圾桶按钮删除。点击 PDF 空白可清除临时句子 focus，不删除永久高亮。 |
| 笔记与词汇 | 笔记支持分类、搜索、编辑、删除、来源页码和 Markdown 导出；词汇可连同释义、原句和页码保存。AI 内容转笔记前可先编辑，并标明来源。 |
| 中文翻译 | Translate to Chinese 使用 MyMemory；普通单词查询也使用 MyMemory，或直接展示已有 AI 分析中的术语释义，不会因为设置了 key 就自动调用付费 AI。 |
| Ask AI | 支持科学问题预设、自定义问题、追问、简短/详细句子分析，以及基于实际输入来源的引用跳转。 |
| AI context review | 可选择当前句子、附近上下文或全文相关片段检索，并在发送前查看上下文。全文模式是有长度上限的关键词检索，不表示模型读到了整份论文。 |
| token / cost estimate | 发送前显示粗略 token 和费用估算；返回后展示供应商报告的 token 用量及按配置费率计算的费用。估算不是账单或预算保证，reasoning tokens 已包含在输出用量中。 |
| 阅读数据与备份 | PDF、标注、笔记、词汇、翻译、AI 分析、对话和阅读位置保存在本浏览器 IndexedDB；支持包含 PDF 的 JSON 备份及恢复，备份导入上限 300 MB。 |

同一 PDF 使用 SHA-256 作为身份，再次导入时复用已有阅读数据。备份恢复会覆盖同一文献的记录，应先备份当前数据。主题与最近打开的文献 ID 另存于 localStorage；这不涉及 API key。

## AI 使用模式

### Public reader：无需 AI key

普通访问者无需登录即可使用 PDF 阅读、逐句 focus、搜索、高亮、笔记、阅读进度、词汇和 MyMemory 翻译。还可通过 **Copy & Open ChatGPT** 预览并手动复制上下文到 ChatGPT；这不是 OpenAI API 调用，也不会自动提交问题。

MyMemory 翻译通过同源 `/api/translate` 发送选中的文字，由服务器调用英→简体中文接口，不上传整份 PDF。每次请求上限 4,000 字符，按不超过 480 UTF-8 字节的片段处理。服务额度、共享出口 IP 和网络可能影响可用性；失败会明确报错，另有 Open in Google Translate 链接，不使用虚构译文替代真实结果。

### Personal API Key / BYOK：使用自己的 OpenAI API key

部署启用 BYOK 后，在 **Use my own OpenAI API key** 输入自己的 key，并选择 **Use key for this tab**，无需 owner 登录。

- key 只保留在当前 browser tab 的内存中，输入框在接受后清空，不再显示完整 key。
- 不写入 localStorage、sessionStorage、IndexedDB、cookies、Redis、URL 或 server-side persistent storage；应用和 SDK 不记录 key 日志。
- 输入 key 本身不发起 AI 请求。仅在用户明确发送问题或分析时，通过 HTTPS Authorization header 发送至同源后端，由后端临时用于 OpenAI 请求；翻译、状态检查和 owner 登录不携带该 key。
- **不存在 BYOK → Owner AI fallback**。key 缺失、无效、额度不足、请求失败或 Redis 不可用，都不会改用 owner 的服务器 key。
- **Remove key** 清除内存中的 key；刷新页面、离开页面或关闭标签页后需重新输入。
- 个人 AI 就绪并被选为当前模式后，设置面板自动收起为 **Personal AI ready · gpt-5-mini · Manage**。Manage 可展开原有隐私、费用、移除 key 和刷新入口；Collapse 再次收起；移除 key 后回到展开的设置状态。

费用由该 key 对应的 **OpenAI API account** 承担。ChatGPT Plus/Pro 订阅与 OpenAI API billing 是不同的，订阅不会自动提供 API credit。BYOK 用户应自行管理其 API 账户的额度和可用消费控制；owner 的预算不覆盖 BYOK。

### Owner AI：仅供项目 owner 使用

Owner AI 是独立、默认关闭的服务器付费模式，**不是公共免费 AI，也不向朋友共享 owner 预算**。owner 使用专用 access code 登录，服务器校验其摘要和 Redis 中的固定 owner 授权，再建立签名、八小时过期、HttpOnly、Secure、SameSite=Strict 的 owner session。

服务器 `AI_API_KEY` 仅供 owner 模式及原有本地开发路径使用，不发送给浏览器。生产 owner 请求必须先通过 Redis 预算预留，再调用 OpenAI，之后按有效 usage 结算。BYOK 使用不同的 Redis 控制键，不预留、扣减或释放 owner 预算。页面刷新后不会自动选中生产计费模式；已有 owner session 也需明确选择 **Use Owner AI**。

两种生产 AI 模式均使用服务器限制的 `gpt-5-mini`，不接受客户端指定模型。配置或依赖不可用时拒绝请求，不切换计费模式或退回未认证的本地路径。

## 安全与隐私

**本地阅读数据。** 从设备导入的 PDF 在浏览器中解析并保存，不上传到服务器。笔记、高亮、阅读进度和对话无账号同步；不同浏览器、设备及网站 origin 的数据相互独立。清除浏览器数据会丢失记录，请导出备份。可选的项目论文来自部署者自行提供的服务器文件，不代表用户导入的 PDF 被上传。

**外部处理边界。** 明确点击翻译会将相应文字交给 Judu 后端和 MyMemory；明确调用 AI 会将有上限的原文片段、问题、文献元数据和最近历史交给后端与 OpenAI，而非整份 PDF。AI 使用 `store:false`，但这不等于供应商零保留承诺。个人笔记不加入自动构造的 AI 上下文。

**BYOK 信任边界。** 后端会移除请求对象中的 Authorization header 副本、使用安全错误信息并在结束时清理自身 key 引用，不将 key 存入持久化数据或生产结果缓存。用户仍需信任部署的 Judu、托管平台和 OpenAI；JavaScript 无法保证内存立即清零，XSS 或浏览器扩展也可能访问 tab 内存。部署者须避免在平台日志或监控中采集 Authorization header，不应分享含凭据的网络抓包。

**生产请求保护。** Owner 与 BYOK 均校验配置中的 HTTPS Origin、JSON 类型、签名 session、CSRF token 和 UUID request ID。BYOK 使用匿名签名 cookie 标识限流会话，cookie 只含随机 ID 等会话字段，**不含 key，也不是 owner 身份**。请求体上限 200 KB，来源文字合计上限 12,000 字符，问题上限 3,000 字符，历史最多四条、每条 1,500 字符；输出上限为配置的 256–8000 tokens。SDK 自动重试关闭，生产结果不使用进程级 AI 缓存。

**Redis 控制。** 生产付费 AI 使用兼容 Redis 的 HTTPS REST / EVAL 接口，例如 Upstash Redis；未使用专属 Upstash SDK，也不限定必须使用该供应商。

| 模式 | 每分钟请求上限 | 活跃请求上限 | 重复提交保护 |
| --- | --- | --- | --- |
| Owner | owner 5、owner 模式全局 20；登录尝试每地址 5、全局 30 | owner 1、owner 模式全局 3 | 持久保留请求/预算记录，重复 ID 不再次调用 OpenAI |
| BYOK | 匿名客户端 5、地址 10、BYOK 全局 20 | 客户端 1、地址 2、BYOK 全局 3 | 请求 ID 保留 24 小时 |

并发租约为 120 秒。地址桶使用 socket 地址的加盐摘要，不信任任意 forwarding header；托管代理可能使不同用户落入同一地址桶。固定时间窗口允许边界突发，限流也不能消除全部托管或 Redis 滥用成本。任一模式所需 Redis 检查失败时，该模式拒绝请求，不切换计费来源。

**Owner 预算。** 耐久账本使用整数 micro-USD，取环境预算与 Redis 账本上限的较小值。预算不是月度自动重置；应用不自动初始化账本。超时、用量不明或结算失败时保留预留金额，不自动退款；有效 usage 超出预留时暂停 owner AI，等待人工核查。预留依赖配置费率及固定文本模型的保守 token 上界，并非供应商账单保证；应核对当前价格并结合供应商控制。BYOK 不使用该预算。失败或取消的上游调用仍可能计费。

Owner 授权、预算初始化与迁移细节见 [FRIENDS_BETA.md](FRIENDS_BETA.md)。该文档沿用历史文件名，内容是当前 **owner-only + BYOK** 架构。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Frontend | React 19、TypeScript 5.9、Vite 7、PDF.js 5.4、Phosphor icons |
| Backend | Node.js 24.x、Express 5、官方 OpenAI SDK / Responses API |
| 浏览器存储 | IndexedDB（通过 idb）；localStorage 仅用于主题、最近文献等偏好，不保存 key |
| 外部服务 | MyMemory；可选 OpenAI API；生产 AI 所需的 Redis REST 服务（如 Upstash） |
| 验证 | Node.js 原生测试、Playwright、TypeScript 和 Vite build |

PDF.js worker 随应用打包；安装时的 `postinstall` 将字体、CMaps 和 WASM 复制到 `public/pdf-assets`，供同源加载。

## 本地开发

需要 Node.js **24.x** 和 npm，以 `package.json` 的 `engines` 为准。在仓库根目录执行：

```bash
npm ci
npm run dev
```

仓库已有 lockfile，优先使用 `npm ci`；`npm install` 也是标准依赖安装方式。安装会执行 PDF 资源准备脚本。

默认打开 **http://127.0.0.1:4173**。实际启动入口是 `server/index.mjs`：Express 在同一端口提供 API，并在开发模式挂载 Vite middleware。默认 `HOST=127.0.0.1`、`PORT=4173`；环境变量优先于 `--host` / `--port` 参数。不要将 `vite.config.ts` 中的开发配置误当成此入口的监听地址。

只使用阅读器和 MyMemory 时无需 `.env`、OpenAI key 或 Redis。需要本地 AI 时，可自行将 `.env.example` 复制为被 Git 忽略的 `.env`，只在本机填写所需设置；修改后重启本地进程。详细操作见 [LOCAL_AI.md](LOCAL_AI.md)。

原有本地付费 AI 仅接受直接 loopback 连接、本地 Host，且拒绝 production、Vercel 及 forwarding/proxy 请求；不需要 Redis，也不通过生产 owner 登录。**本地 HTTP 开发不提供 BYOK**，BYOK 使用生产 HTTPS 路径。远程预览或隧道不能替代本地认证条件。

`npm start` 是生产启动入口，需先 build；生产模式采用默认关闭的 owner/BYOK 保护，不是本地 AI 的快捷入口。该 script 使用 POSIX 的 `NODE_ENV=production` 语法，Windows PowerShell 应先设置 `NODE_ENV` 为 `production`，再执行 `node server/index.mjs`。

## 环境变量

所有 AI 配置均为 **server-only**。不要使用 `VITE_*` 暴露 secret，不要提交 `.env`，不要将真实 key、Redis token、owner code 或签名 secret 写入源码、文档、日志或截图。下表只说明名称与格式。

### Common：运行及生产 AI 共用设置

普通阅读和 MyMemory 不需要 AI 环境变量。开启任一种生产 AI 模式时，必须提供相应共用设置。

| 变量 | 用途与格式 |
| --- | --- |
| `HOST` / `PORT` | 本地/自托管启动地址与端口，默认 `127.0.0.1` / `4173`；Vercel 无需配置。 |
| `NODE_ENV` / `VERCEL` | 运行时模式判定；`NODE_ENV=production` 或存在非空 `VERCEL` 时使用生产 AI 策略。Vercel 自行提供平台变量，不应伪造它们绕过保护。 |
| `AI_MODEL` | 本地默认 `gpt-5-mini`；生产 Owner/BYOK 必须明确为 `gpt-5-mini`。 |
| `AI_MAX_OUTPUT_TOKENS` | 生产必填，整数 256–8000，包含 reasoning tokens；本地默认 2500。 |
| `AI_BETA_ORIGIN` | 生产站点的精确 HTTPS origin，不含路径或末尾斜杠。 |
| `AI_BETA_SESSION_SECRET` | 独立随机签名 secret；base64url 字符，长度 43–128，建议由至少 32 随机字节生成。 |
| `AI_BETA_REDIS_REST_URL` | 支持 EVAL 的 Redis HTTPS REST endpoint；不在 URL 中携带账户凭据、query 或 fragment。 |
| `AI_BETA_REDIS_REST_TOKEN` | 服务器使用的 Redis REST 读写凭据。 |

本地启动入口还支持继承 `HTTP_PROXY` / `HTTPS_PROXY` 以访问上游；这不改变本地付费 AI 对入站连接的限制，也不是 Vercel 必填配置。

### BYOK

| 变量 | 用途与格式 |
| --- | --- |
| `AI_BYOK_ENABLED` | 仅精确字符串 `true` 启用生产 BYOK；缺省或其他值为关闭。 |

BYOK 需要上述生产共用配置与 Redis，但**不需要**服务器 `AI_API_KEY`、owner code、owner 预算或价格确认。用户 key 由当前标签页在明确的 AI 请求中提供，不配置为部署环境变量。

### Owner AI 与费率

| 变量 | 用途与格式 |
| --- | --- |
| `AI_BETA_ENABLED` | 仅精确字符串 `true` 启用生产 **Owner AI**；默认关闭，不代表朋友可共享 owner key。 |
| `AI_API_KEY` | 服务器 OpenAI key，供 Owner AI / 直接本地开发使用，不返回前端；BYOK 不读取它。 |
| `AI_OWNER_CODE_SHA256` | 专用 owner access code 的 SHA-256 摘要，64 位小写十六进制。原始 code 是 43 位 base64url 字符串，建议由 32 随机字节生成，不能作为公开配置分享。 |
| `AI_BETA_BUDGET_USD` | Owner 累计预算，单位 USD，大于 0 且不超过 1000，并须至少达到一个 micro-USD；还需耐久 Redis 账本。 |
| `AI_INPUT_USD_PER_MILLION` | 每百万 uncached input tokens 的 USD 费率。 |
| `AI_CACHED_INPUT_USD_PER_MILLION` | 每百万 cached input tokens 的 USD 费率，不得高于 uncached input 费率。 |
| `AI_OUTPUT_USD_PER_MILLION` | 每百万 output tokens 的 USD 费率。 |
| `AI_BETA_PRICING_CONFIRMED` | 核对供应商现行价格后才设置为精确字符串 `true`。 |

生产 Owner AI 要求三项费率均明确配置、为正数且各不超过 1000 USD/百万 tokens。BYOK 不要求这些费率才能调用，但显示的费用估计仍使用服务器费率设置或默认估值，不代表用户账户的实时账单。`.env.example` 中的示例价格不是实时价格源。

Owner 还必须在 Redis 中配置固定 `owner` 授权和预算账本。已有账本不可重新初始化或清空用量；操作说明见 [FRIENDS_BETA.md](FRIENDS_BETA.md)。BYOK 可在 Owner AI 完全关闭、没有 owner key 或账本时独立启用。

### Deprecated 配置

- `AI_BETA_INVITES_JSON`：已忽略，不再使用通用朋友邀请映射。旧 friend 身份和旧 beta cookie 不能获得 owner-funded AI。
- `AI_BASE_URL`：已不使用，官方 OpenAI Responses endpoint 固定，不能通过它更改上游。

历史 Redis 授权 hash 和部分路由仍沿用 `invites` / `beta` 名称，这是兼容现有账本的实现细节，不表示恢复朋友共享 owner key 的访问方式。

## 测试与构建

以下命令与当前 `package.json` / 测试入口一致：

| 命令 | 说明 |
| --- | --- |
| `node tests/run-unit.mjs` | 无需 HTTP listener 的回归集合，覆盖句子索引、source mapping、focus 几何、上下文、翻译、Owner/BYOK 隔离和 Redis Lua 策略。它是直接 Node 入口，不是 npm script。 |
| `npm test` | 执行 `tests/run.mjs` 完整集合，**包含绑定 `127.0.0.1` 的 API 测试**，需要允许本地监听。受限环境可能出现 `EPERM`，此时使用上一行的集合。 |
| `npm run build` | 执行 `tsc -b && vite build`，类型检查并生成 `dist`，不会启动服务器。 |
| `npm run test:e2e` | 生成测试 PDF 并执行 Playwright；需要另行启动本地应用和可用 Chromium，测试配置不会自动启动应用。 |
| `node scripts/check-pdfs.mjs` | 检查自行放入 `.local/papers` 的 PDF 解析结果，不依赖仓库附带私人论文。 |

Lua 脚本测试通过 `python` 和可用的 liblua 5.4/5.3 在内存中运行，不启动 Redis；缺少解释器时相应测试会跳过。API 测试在上游 HTTP 边界 mock OpenAI/MyMemory/Redis，不代表真实服务连通、回答质量或账单已验证。

Playwright 默认 Chromium 路径是 `/usr/bin/chromium`，其他系统可通过 `CHROMIUM_PATH` 指定本机浏览器路径；真实论文用例可通过 `TEST_PDF` 指定预期测试文献，文件不存在时会跳过。不要将私人论文或含 key 的网络记录纳入 Git。

## 部署

当前已有 Vercel 支持，入口与本地开发复用同一 Express app：

- React/Vite 构建静态前端至 `dist`；Vercel 按 `vercel.json` 使用 `npm ci --include=dev` 和 `npm run build`。
- `/api/*` 优先重写至 `api/index.mjs`，该 Node function 导出 `server/app.mjs`，不调用 `app.listen()`、不启动 Vite，也不加载本地 `.env`。
- 其他前端路由回退到 `index.html`；浏览器继续使用同源 API，不需要单独的前端 API 地址。
- Function 的配置时限为 120 秒；应用内翻译超时 45 秒，AI 请求上限 60 秒，仍受托管套餐和服务可用性限制。
- Public reader / MyMemory 无需 OpenAI key 或 Redis。Owner 与 BYOK 可分别启用，均要求相应生产保护完整就绪，secret 仅配置在服务器部署环境中。
- 用户导入的 PDF 与个人记录保留在浏览器。`.local/papers` 被 Git 忽略，仓库不附带固定数量的论文；没有部署者提供的项目论文时，`/api/library` 返回空列表，不影响本地 PDF 导入。

部署与上线验收见 [VERCEL.md](VERCEL.md)，生产 AI 设置见 [FRIENDS_BETA.md](FRIENDS_BETA.md)。旧 Render 自托管说明保留在 [DEPLOY.md](DEPLOY.md)，不能用它替代当前生产 AI 策略。部署后仍需在实际 HTTPS origin 验证 MyMemory、静态资源、session/CSRF、计费隔离和 Redis 控制；本地 mock 或 build 通过不等于线上验证通过。

## 项目状态与限制

这是仍在迭代的个人项目 / beta，未提供账号系统、付费订阅、团队共享或云端同步。当前聚焦原版 PDF 阅读与可控的可选 AI 辅助。

- 不内置 OCR。无文字层扫描 PDF 可看原版页面，但不能自动逐句 focus、搜索或基于文字层分析；可在外部 OCR 后作为新文件导入。
- 断句、标题/图注分类、阅读顺序和跨页延续是启发式处理。复杂三栏、表格、公式、旋转文字、异常字体或混合扫描图层仍可能漏识别或误判；可切换 Select text 手动选取原文。
- 数学公式保持 PDF 原貌，没有公式图像理解、LaTeX 重建、表格结构化提取或手动修正句子边界工具。
- 文字索引渐进构建，完成前搜索和全文相关片段检索可能不完整。没有向量检索，也不能保证 AI 找到论文中所有证据。
- AI 来源 ID 依据实际发送的 source map 校验，但不保证科学结论正确；应核查原文、数值、单位与推断。服务失败、额度限制和模型可用性均会明确报错。
- 清理浏览器数据、更换浏览器或切换网站域名不会自动迁移文献记录；需要手动导出/恢复备份。永久高亮目前保存在应用记录中，不直接写回原 PDF。

## 代码与相关文档

| 位置 | 职责 |
| --- | --- |
| `src/lib/pdf.ts`、`sentences.mjs` | PDF 文字提取、阅读顺序、逻辑单元与 continuation、原始 text run 映射。 |
| `src/lib/coordinates.ts`、`highlight-geometry.mjs`、`focus-shape.mjs` | 字形/字符几何、矩形裁剪及聚焦轮廓。 |
| `src/components/PdfPage.tsx` | 页面渲染、文字层、临时 focus 与永久高亮覆盖层。 |
| `src/lib/storage.ts`、`context.ts` | 浏览器文献数据与备份；有界 AI 上下文构造。 |
| `src/components/StudyPanel.tsx`、`BetaAIAccess.tsx`、`src/lib/ai-access.mjs` | 学习侧栏、AI 访问设置/紧凑状态、tab 内 key 与显式请求模式。 |
| `server/app.mjs`、`server/index.mjs`、`api/index.mjs` | 共享 API、本地/自托管启动入口、Vercel function 导出。 |
| `server/ai.mjs`、`translation.mjs` | 官方 Responses API、输出/来源校验；MyMemory 请求。 |
| `server/beta*.mjs`、`server/byok*.mjs` | Owner 身份与预算、BYOK 限制及 Redis 原子操作。 |

进一步参阅 [LOCAL_AI.md](LOCAL_AI.md)、[FRIENDS_BETA.md](FRIENDS_BETA.md)、[VERCEL.md](VERCEL.md) 和 [VALIDATION.md](VALIDATION.md)；历史验证记录应结合当前代码和实际部署重新核对。
