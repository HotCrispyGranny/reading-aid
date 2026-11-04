# 句读 · 英文文献阅读室

**Local paid AI (Phase 1):** see [LOCAL_AI.md](LOCAL_AI.md) for GPT-5 mini setup, Chinese science explanations, usage estimates and the ChatGPT copy fallback. No Redis is needed locally. Production paid AI defaults OFF; [FRIENDS_BETA.md](FRIENDS_BETA.md) documents the optional invite/session, durable-limit and budget policy required to enable it. This supersedes older AI setup instructions below.

Vercel serverless support: see [VERCEL.md](VERCEL.md). `/api/translate` and MyMemory remain fully integrated; successful live translation on the deployed domain is a required release check. The verified reader-only site is `https://reading-aid.vercel.app`; this implementation does not deploy or change hosted settings.

实际运行的 PDF 阅读网站，面向中文母语的化工与药学学生。React / TypeScript + PDF.js + Express。界面主语言为英文，翻译内容为中文；采用用户提供的 Olive Leaf / Pistachio / Butter Yellow / Lemon Cream / Warm Stone 色系。默认保留 PDF 原始排版。

**当前优先流程：上传 PDF → 整句聚焦 → Translate to Chinese。翻译无需 AI 密钥。AI 聊天与详细分析是可选功能，未配置时不显示聊天入口。**

公开部署给朋友使用：参见 [DEPLOY.md](DEPLOY.md) 和 [render.yaml](render.yaml)。Render 必须在已授权账号中实际创建服务后才会产生可分享网址，开发预览不是公开部署。

## 启动

需要 Node.js **24.22 或更新的 24 LTS**（当前环境为 24.22.1）、npm。使用当前 checkout，不需要建立 worktree。

```bash
cd /workspace/reading-aid
npm ci
npm run dev
```

开发服务监听 `0.0.0.0:4173`，前端与 API 使用同一服务、同一端口。可用 `PORT=其他端口 npm run dev`，或 `npm run dev -- --host 0.0.0.0 --port 4173`。在当前云环境通过其网页预览访问该端口。

生产方式：

```bash
npm run build
npm start
```

`npm ci` 的 postinstall 会将 PDF.js 的字体、CMap、WASM 复制到本地 `public/pdf-assets`；不从第三方 CDN 加载 PDF 内容或字体。服务器的 `.env` 需要改动后重启；前端开发时支持热更新。

## 使用

- 从本机上传 PDF、拖放 PDF，或选择“项目论文”。本次附带的 7 篇论文放在当前实例的 `.local/papers/`，被 Git 忽略。新的源码 checkout 不包含这些论文；可重新上传，或把有权使用的 PDF 放入该目录。项目论文入口只会从当前应用服务器读取这些文件。
- 在「逐句聚焦」模式点击正文任意位置，按 ↑/↓ 切换完整句子。跨行使用分行坐标，跨栏按左栏→右栏；有把握的跨页延续会合并。视口外的句子会滚动进入视野。设置按钮可调淡化、颜色、边框，也可切换「文本选择」关闭聚焦。
- 右键原文句子打开学习栏；也可使用底部「分析此句」。AI 分析另需主动点击学习栏内的分析按钮，不因移动句子自动发送内容。
- 拖选文字后，浮动工具栏可保存多色**永久高亮**、写笔记、分析选文。**临时阅读聚焦**与永久标注是不同的数据，移动句子不会删除标注。在「荧光笔」模式拖选后挑选颜色。
- 左侧有按需缩略图、PDF 内嵌目录（若存在）和全文原文子串搜索。搜索显示匹配页面；匹配能识别的句子时可定位该句，否则跳到页面。
- 学习栏支持中文翻译、词语/短语解释、简短/详细长句拆解、条件与推断提醒。点击英文单词可单独查询并加入词汇本。问答可选当前句子、附近上下文、全文检索；引用卡片显示真实输入的原文和页码，并可跳回来源。
- 笔记可以分类、搜索、编辑、删除；原文和页码随笔记保存。AI 解释转为笔记前会打开编辑器，并标记为 AI 来源。可导出 Markdown。
- 文献 SHA-256 作为稳定身份；同一 PDF 再次打开会复用标注、词汇、笔记、对话和阅读位置。仅在当前浏览器 IndexedDB 保存，无账号和云同步。保存成功以数据库写入完成为准。
- 顶栏「备份数据」导出包含 PDF 的 JSON；左下角「恢复阅读备份」导入。恢复同一文献会用备份覆盖当前版本，请先导出当前数据。备份含论文和私人笔记，请自行妥善保管。单份 PDF 限 150 MB，备份导入限 300 MB。
- 左右栏可以收起，右栏分隔线可拖动，也可聚焦分隔线后左右键调整；支持浅色、深色、护眼背景。PDF 纸张保持原始色彩，不反色破坏图表。

## 无需 AI 密钥的真实翻译

学习栏的 **Translate to Chinese** 主动向服务端 `/api/translate` 发送当前完整英文句子。服务端调用 MyMemory 英→简体中文翻译接口；不会发送整份 PDF，也不生成模拟译文。译文按文献和句子缓存，刷新后可恢复。点击单词在未配置 AI 时也可查询普通中文翻译，但不宣称具备论文语境推理。

- MyMemory 是免费外部服务，有共享的每日额度和上游限流，不保证无限使用或专业术语准确性。
- 长句按单词边界拆成每段小于 480 字节，完整请求限制 4,000 字符。跨段语境可能丢失。
- 失败、超时和额度不足明确报错；始终提供带当前句子的 **Open in Google Translate** 链接作为替代，不伪造结果。
- 中文译文以 `lang="zh-CN"` 标记，操作标签、状态与错误提示均为英文；用户自己写的笔记和已有阅读数据不会被自动改写。
- 当前开发环境的网络策略阻止访问 `api.mymemory.translated.net`，已验证真实请求会正确报错，而没有宣称已得到真实上游译文。Render 部署后需要确认实际连通性和额度。云环境使用时，需要在环境网络设置中允许该主机；不要关闭 TLS 验证或绕过代理。

## Configure AI

For direct localhost development see [LOCAL_AI.md](LOCAL_AI.md). The official OpenAI
Responses API uses server-only `AI_API_KEY` and defaults to `AI_MODEL=gpt-5-mini`.
`AI_BASE_URL` and older Chat Completions instructions are obsolete. API keys never
belong in `VITE_*` variables or frontend/browser storage.

Production paid AI defaults OFF. See [FRIENDS_BETA.md](FRIENDS_BETA.md) for the complete
Vercel environment checklist, hashed invites, expiring cookies, Redis initialization,
atomic lifetime-beta budget and manual acceptance checks. Local development requires
no Redis; production never falls back to unauthenticated or process-memory accounting.

PDFs/notes/marks/progress stay browser-local. MyMemory translation remains independent
of paid AI. Only explicit AI requests send bounded excerpts and recent history.

## 当前支持边界

1. **无 OCR**：本次 2014/2016 两篇为纯扫描件，只支持原版浏览；扫描页会提示不能自动断句/搜索/分析。可在本地 OCR 后导入新文件。OCR 后文件哈希改变，不会自动迁移旧文件标注。
2. **版面和断句采用启发式**：对常见英文单/双栏正文、缩写、小数、引用编号、断行连字符进行了处理；复杂三栏、旋转文字、混合文本图层、异常嵌入字体、表格和公式不能保证句子完整。明显图注、公式/数字密集行、术语表会保守跳过；仍可能出现误识别/漏识别。可切换普通选择模式，手动选择原文分析或保存笔记，不强行把公式识别为自然语言。旋转文本的聚焦坐标回退到 PDF.js 文字层矩形，精度较低。
3. **数学公式保持原版图像**，未实现 LaTeX 或表格结构化提取。手动选文只能传递实际可提取字符，不包含图像理解。
4. 字形坐标来自 PDF 操作流与字宽，词间距与文字项总宽度对齐；非常规字形/连字可能仍有局部误差。尚未实现用户手动修正断句边界、阅读顺序或跨页判断。
5. PDF 页面按视口邻域渲染并释放离屏大画布；文字索引在后台逐页构建，完整解析前全文检索不完整。极大的扫描图片和特殊 PDF 解码仍可能耗费内存/时间。
6. 没有 OCR、语音朗读、账号同步、语义向量索引、重排视图、PDF 内嵌批注导出或密码输入；加密 PDF 提示先解密。永久标注可随 JSON 备份恢复，笔记可导出 Markdown。
7. 阅读位置保存为 PDF 身份、页码、句子 ID、滚动位置和缩放。跨设备改变布局时，优先页码/句子锚点；未实现云端同步。清理浏览器数据会删除本地文献，请备份。

## 验证

```bash
npm test                    # 10 个纯模块测试，实际输出每项测试名称
npm run build               # TypeScript + 生产打包
npm run dev                 # 另一个终端启动应用
npm run test:e2e             # 使用系统 Chromium；需要可运行浏览器的权限
node scripts/check-pdfs.mjs  # 检查 .local/papers 中所有实际论文的解析/坐标锚点
```

可用 `CHROMIUM_PATH` 指定 Chromium 可执行文件。E2E 每次生成单栏、双栏、跨行、跨页及无文字层的测试 PDF；真实用户论文不纳入 Git，有对应文件时另跑真实文本版/扫描版测试。真实文本版路径可用 `TEST_PDF` 指定（需同内容的 Minerals Engineering 2021 测试论文）。无上传论文时真实文献测试显示 skip，不能算通过。

浏览器验收覆盖：原版真实渲染、点击完整句、跨行/跨页、双栏顺序、缩放坐标、输入框箭头、自动滚动、永久高亮、笔记编辑/刷新、备份删除恢复、扫描页提示、AI 未配置、旧分析回包取消、请求失败、词汇本、带来源的问答和编辑 AI 笔记。并发/失败/词汇/对话测试在网络边界明确 mock AI，仅验证应用逻辑，**不代表真实 AI 回答质量**。参见 [VALIDATION.md](VALIDATION.md)。

## 模块

- `src/lib/pdf.ts`：PDF.js 打开与渐进文本提取。
- `src/lib/sentences.mjs`：版面阅读顺序、学术断句、跨栏/跨页延续、稳定文字项锚点。
- `src/lib/coordinates.ts`：PDF 原生字形宽度与坐标、逐行矩形合并。
- `src/components/PdfPage.tsx`：按需原版渲染、透明可选文字层、聚焦与永久标注覆盖层。
- `src/lib/storage.ts`：IndexedDB、文献身份、备份恢复、Markdown 导出。
- `src/lib/context.ts`：限长上下文与全文范围检索。
- `src/components/StudyPanel.tsx`：翻译、词汇、长句、对话、引用、笔记与词汇本。
- `server/ai.mjs`：AI 提示约束、真实兼容接口、结构校验和来源白名单。
- `server/index.mjs`：同源服务、服务端配置、超时/限流、开发与生产运行。
