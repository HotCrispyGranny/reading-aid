# Phase 1: personal AI assistant on localhost

Phase 1 is implemented without Redis, authentication setup, or deployment. Paid AI is intentionally unavailable in production/Vercel. PDF reading and MyMemory translation remain available independently.

## Configure and run on your own computer

Use Node 24 and the project source:

```bash
npm ci
cp .env.example .env
```

Edit the ignored `.env` **locally**. The only required credential is an OpenAI API key with API billing enabled:

```dotenv
AI_API_KEY=your-real-key-here
AI_MODEL=gpt-5-mini
AI_MAX_OUTPUT_TOKENS=2500
AI_INPUT_USD_PER_MILLION=0.25
AI_CACHED_INPUT_USD_PER_MILLION=0.025
AI_OUTPUT_USD_PER_MILLION=2.00
HOST=127.0.0.1
PORT=4173
```

The example prices are configurable estimates in USD per million tokens, not a live pricing feed or a guarantee of current provider pricing. Check https://openai.com/api/pricing/ and your OpenAI dashboard before enabling API calls. A ChatGPT subscription does not include OpenAI API billing. Keep the key out of chat, frontend variables, GitHub, screenshots and logs. `AI_BASE_URL` from the older implementation is no longer used: the official SDK uses the official OpenAI Responses endpoint.

```bash
npm run dev
```

On that same computer, open **http://127.0.0.1:4173** (or localhost on that port). Upload a text-based PDF, choose a sentence, open **Ask AI**, inspect the context/estimate, and select a scientific preset or send a custom question. Follow-ups use at most four recent messages, each capped at 1,500 characters. If you change `.env`, restart the server and refresh the browser.

No Redis or API key is required for PDF reading, MyMemory translation or Copy & Open ChatGPT. Do not use `npm start` for paid AI tests: it sets production mode, where paid endpoints are deliberately disabled. A remote cloud preview, tunnel or reverse proxy is not direct localhost access and must not be used to bypass the local-only check. If you cannot run Node on your computer, Phase 2 access control is required before remote paid testing.

## Implemented behavior

- Official `openai` SDK, Responses API, default `gpt-5-mini`, low reasoning effort for GPT-5 models, configurable output cap; no unsupported temperature/max_tokens options or silent model upgrade. Automatic SDK retries are disabled to avoid unexpected repeat spending.
- Chinese explanations with English terminology; six science presets, custom questions and follow-up conversations.
- Current sentence is S1. For nearby scope, extracted paragraph and adjacent sentences are included; title/filename and page are sent as metadata. Missing section headings remain explicitly unavailable. Source text is capped at 12,000 characters. No entire PDF upload. Whole-paper scope retains existing bounded lexical retrieval and states that it is incomplete evidence coverage.
- Only explicit paid actions call OpenAI. Sentence navigation/selection do not. Normal translation and word clicks use MyMemory even if the OpenAI key is configured. Optional paid `/api/word` compatibility remains, subject to the same local restriction.
- Model output is constrained to JSON, evidence IDs are checked against the sent source map, and the prompt separates paper facts, general background and inference. These controls do not guarantee factual accuracy: verify the source.
- Actual provider-reported input/output/cached/reasoning tokens are shown with estimated cost. Reasoning is already included in output tokens and is not charged twice in the estimate. The pre-send estimate is rough, not a tokenizer count or guaranteed spending bound. For a different model, configure all three pricing variables; unknown pricing is reported as unknown.
- Successful identical requests are cached in process memory for up to 24 hours (128 entries); a cache hit has no new API call. Cache and process usage totals reset when the server restarts. The existing browser-local notes, PDF records and conversation storage remain intact. Analysis cache keys distinguish this model/language version from older saved analyses.
- Errors, unsupported models, unavailable API keys and output truncation are explicit. Failed/incomplete/aborted requests can still incur provider charges. Local totals are approximate and can omit charges for responses lost in transit. Provider billing is authoritative.
- Copy & Open ChatGPT works without the API: preview the exact bounded context, choose a preset/custom question, copy and paste manually. Clipboard denial exposes a selectable prompt; blocked popups provide an explicit link. No prompt is sent through undocumented ChatGPT APIs, URLs or automatic submissions. Private notes are excluded.

## Local-only protection (not Phase 2 authentication)

All paid endpoints reject production mode, any Vercel environment, non-loopback connections, non-local Host headers and forwarded/proxy requests. Development binds to loopback by default. Do not remove these guards to test publicly. Translation routes are not paid OpenAI routes and remain independent.

## Phase 2 remains required before public paid AI

Password authentication, durable accounting/reservations, a US$5 monthly application cap, warnings and distributed rate limiting are **not implemented** in Phase 1. Application-side accounting will not replace provider billing controls.

Redis is not inherently required. A single private server with a persistent disk can use SQLite transactions for a simple durable ledger and budget enforcement. Vercel functions need shared durable storage because their local filesystem/process counters are ephemeral; managed Redis or Postgres is appropriate there. You do not need to provision either to test Phase 1 locally.

## Validation and limitations

The SDK and API logic are tested with the OpenAI HTTP boundary mocked; frontend assistant tests also use clearly identified mocked responses. No real OpenAI key was present in the environment, so real GPT-5 mini availability, Chinese answer quality and live billing were not verified. Configure your key and make one short explicit question first; confirm the model, JSON answer, source links and usage in the UI and your provider dashboard. If the model is not available to your project, the app reports an error rather than silently choosing another model.

MyMemory is preserved; this environment's previously observed network restriction can block live translation independently of this feature. Browser/API tests do not claim real upstream connectivity. No deployment has been performed.
