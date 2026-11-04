# Phase 1 local AI validation

- `npm test`: 16 tests passed, including official Responses SDK protocol with a mocked upstream, usage and cache accounting, GPT-5 mini settings, bounded follow-up history, local-only/production restrictions and Bridge context construction.
- `npm run build`: passed; the prior Bridge TypeScript error is fixed.
- Chromium: 10 scenarios, covering the existing PDF/translation/notes suite plus real clipboard copy, new-tab navigation, clipboard denial fallback, assistant context and Chinese follow-ups (AI HTTP boundary mocked).
- No API key was configured; live GPT-5 mini answer quality, availability and billing were not verified. No API charge or deployment was performed. Local setup: LOCAL_AI.md.
- Deployment configuration and PDF rendering/segmentation/storage modules were not changed. Phase 2 authentication and persistent budgets are intentionally deferred.

# Vercel adaptation validation

- 12 module/API tests passed, including real HTTP requests to the exported Vercel handler with only the external MyMemory boundary mocked.
- Production build/type check passed. React/PDF reader source was not changed.
- All 8 browser regressions passed against the production build: PDF upload, sentence focus, keyboard/input handling, zoom, persistent notes/highlights and backup recovery, word translation, translation cache/race handling and explicit failures.
- A live MyMemory request was attempted through the managed proxy and was rejected with CONNECT HTTP 403. This is an external verification blocker, not a disabled feature. Actual Vercel runtime routing and live in-panel translation must be verified using VERCEL.md after authorized deployment.
- No Vercel deployment was performed.

# Latest update: English interface, olive palette and translation-first workflow

- `npm test`: 10 tests passed, including real-provider protocol construction, UTF-8 byte-bound chunking, quota/network failure handling (upstream mocked only in unit tests).
- `npm run build`: passed.
- Chromium: 8 scenarios passed. Added keyless translation UI, no automatic text sharing, stale-response protection, translation cache after reload, provider failure and Google Translate fallback. All prior reading, notes and backup scenarios remain covered.
- Real `/api/translate` request in this instance returned an explicit connection error because the network proxy blocks `api.mymemory.translated.net`. No real upstream translation success is claimed.
- English labels use separate display mapping for persisted Chinese note category identifiers, preserving old notes. User-written note content and actual Chinese translations stay unchanged.
- Render Blueprint is prepared. No Render credentials or authorized deployment integration are available, so a public URL is not yet created.

The earlier PDF validation below remains applicable; the later test counts supersede the earlier counts.

## Earlier PDF validation

验证在当前云实例执行。未配置真实 AI 密钥。

- `npm ci --no-audit --no-fund`：通过，锁文件安装和本地字体/CMap/WASM 准备完成。
- `npm test`：8 项通过，0 跳过。覆盖学术缩写、小数、编号引用、双栏顺序、跨行连字符与文字项坐标、跨页合并、无文字页/公式、来源白名单及错误 AI 数据。
- `npm run build`：TypeScript 和生产打包通过。PDF.js 导致主包较大，Vite 提示分包建议，不影响构建完成。
- Chromium / Playwright：6 个端到端场景通过，0 跳过。使用 1440 × 1000 桌面视口、实际上传论文和生成的可重复测试 PDF。
- UI 检查：实际截屏检查原版论文、透明文字选择层、完整句边界、淡化背景、缩放、双侧栏与未配置 AI 状态。参见 `design-qa.md`。

## 浏览器场景

1. 用户提供的 Minerals Engineering 2021 论文：真实页面、点击英文句、上下键、缩放坐标、未配置 AI 的真实 HTTP 503 提示。
2. 可重复生成单栏 PDF：跨行两段矩形；缩放前后按 PDF 单位归一化的宽度误差小于 2；永久高亮；个人笔记编辑；数据库完成写入后刷新；包含 PDF 的备份导出→删除→恢复。
3. 可重复双栏/跨页 PDF：遍历左栏后进入右栏；跨页延续为一个句子；切至下一页时自动滚动；搜索输入框的箭头不切句；无文字页提示。
4. 迟到 AI 请求：取消旧句分析，不覆盖新句；上游失败显示错误。此项在 HTTP 边界 mock，非真实翻译。
5. 用户提供的 2016 扫描 PDF：原始图像页面实际渲染，无文字层提示、无 OCR 说明、下一句禁用。
6. 词汇查询→词汇本；问题输入框箭头；对话带已发送来源；引用跳转；AI 解释编辑为明确标记的笔记。此项在 HTTP 边界 mock，非真实 AI 回答。

测试保留了初次发现的问题及修正结果：关键词与摘要串栏、断行连字符空格、透明文字层字体宽度导致句末越界、双倍行距的跨行句漏合并、笔记在 IndexedDB 提交前过早确认、扫描提示等待全文过久。修正后重跑通过。

## 7 篇实际论文的解析与坐标锚点检查

`node scripts/check-pdfs.mjs` 检查每条句子的每个 run 都对应实际 PDF 文字项，起止 offset 在真实字符串边界以内；同时检查扫描件不能生成伪句子。结果：

| 文献 | 总页数 | 有文字页 | 识别句数 | 识别双栏页 | 合并跨页句 |
|---|---:|---:|---:|---:|---:|
| Experimental Thermal and Fluid Science | 13 | 13 | 437 | 13 | 4 |
| Experimental and numerical investigation… | 19 | 19 | 602 | 18 | 8 |
| Iso-thermal flow characteristics… | 17 | 17 | 476 | 16 | 4 |
| Swirl (EMJ 2014) | 4 | 0 | 0 | 0 | 0 |
| Swirl (EMJ 2016) | 3 | 0 | 0 | 0 | 0 |
| Swirl Flow (Minerals Engineering 2021) | 11 | 11 | 273 | 10 | 1 |
| Swirl Scale Suppression (2012) | 12 | 12 | 277 | 10 | 2 |

这些是几何映射/程序检查，**不是对所有句子语言学边界、全部跨页合并、版面识别的人工逐句正确率保证**。复杂布局和公式仍需手动选文。全部论文共 79 页，7 页扫描页。

## 尚未验证

- 真实外部模型的授权、可达性、翻译/术语/事实准确性及计费：没有密钥，未调用真实模型。
- 没有 OCR、云端账号同步、PDF 内嵌批注导出、三栏/任意复杂布局保证。
- 当前实例与保存的安装配置可用；环境发布、在新任务恢复快照由产品执行，本次不宣称已发布或验证恢复。
