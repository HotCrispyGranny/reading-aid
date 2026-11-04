# Friends Beta AI — Owner access + personal OpenAI keys

The public reader and MyMemory translation need no login or OpenAI key. Production
AI has two independent, default-off modes. No deployment or Vercel settings changes
are performed by this implementation. Direct localhost development retains its
original loopback guard and requires no Redis.

## Architecture and billing

Every production `/api/analyze`, `/api/chat` or `/api/word` request must explicitly
select `X-Judu-AI-Mode: owner` or `byok`. Missing/unknown modes are denied.

- **Owner:** signed owner session → Origin/CSRF/schema checks → atomic Redis owner
  authorization and budget reservation → server `AI_API_KEY` → usage settlement.
- **BYOK:** anonymous signed limiter session → Origin/CSRF/schema/key checks →
  independent Redis rate/concurrency lease → supplied key → release lease.
- **Ordinary visitor:** no paid AI; PDF reading, notes, highlights, progress and
  MyMemory remain available. There is no reader login or account system.

Only the fixed identity `owner` can authenticate for server-funded AI. Friend
invites and old beta cookies cannot do so. BYOK never reads or requires the owner
key, code, budget or pricing acknowledgement. The owner and BYOK scripts use
separate Redis keys; BYOK cannot reserve, increment or release owner money. Errors,
missing keys, exhausted budgets and unavailable Redis never switch billing modes.
A supplied Authorization credential combined with an owner mode is rejected.
The browser starts with no production billing mode selected after refresh, even if
an owner cookie exists; losing a BYOK key cannot automatically select owner funding.

All requests use the official OpenAI Responses endpoint and the server-controlled
`gpt-5-mini` model, `store:false`, output limits, SDK logging off and zero SDK
retries. No client model override is accepted. Production SDK result caching and
process usage totals are disabled; existing browser-local analysis caches remain.

## Vercel environment variables (manual setup only)

Use server-side **Production** variables, never `VITE_*`, source code or committed
`.env` files. Keep paid preview deployments disabled. Do not print credentials in
logs/screenshots. Both modes require the common settings; either can be enabled
without the other.

| Variable | Required for | Purpose |
| --- | --- | --- |
| `AI_BETA_ENABLED` | Owner | Exact `true` enables owner AI; absent/false disables it |
| `AI_BYOK_ENABLED` | BYOK | Exact `true` enables personal-key AI; absent/false disables it |
| `AI_MODEL` | Both | Exact `gpt-5-mini` |
| `AI_MAX_OUTPUT_TOKENS` | Both | Integer 256–8000; e.g. 2500, including reasoning |
| `AI_BETA_ORIGIN` | Both | Exact HTTPS origin, e.g. `https://reading-aid.vercel.app`; no path/trailing slash |
| `AI_BETA_SESSION_SECRET` | Both | Independent random 32-byte base64url signing secret (43+ characters) |
| `AI_BETA_REDIS_REST_URL` | Both | HTTPS Redis REST command endpoint supporting atomic EVAL |
| `AI_BETA_REDIS_REST_TOKEN` | Both | Server-only Redis read/write credential |
| `AI_API_KEY` | Owner only | Server-side owner project key; never returned to the browser |
| `AI_OWNER_CODE_SHA256` | Owner only | Lowercase 64-character SHA-256 digest of the owner code |
| `AI_BETA_BUDGET_USD` | Owner only | Lifetime allowance >0 and <=1000; e.g. 5 |
| `AI_INPUT_USD_PER_MILLION` | Owner; optional BYOK estimate | Verified positive uncached input price |
| `AI_CACHED_INPUT_USD_PER_MILLION` | Owner; optional BYOK estimate | Verified positive cached price <= input price |
| `AI_OUTPUT_USD_PER_MILLION` | Owner; optional BYOK estimate | Verified positive output price |
| `AI_BETA_PRICING_CONFIRMED` | Owner only | Exact `true` AFTER checking current provider pricing |

Illustrative prices in `.env.example` are not a current pricing feed. BYOK displayed
costs are estimates from deployment settings, not the user's invoice or spending cap.
ChatGPT Plus/Pro subscriptions do not automatically provide OpenAI API credit.
Owner flags and accounting do not cap what a BYOK user's OpenAI account can spend;
that user must manage their own API billing and available project controls.

**Obsolete:** `AI_BETA_INVITES_JSON` is ignored and should be removed. The former
friend-invite mapping no longer authorizes anyone. `AI_BASE_URL` remains obsolete;
OpenAI's endpoint is pinned. `HOST`, `PORT`, local proxy settings and `.env` are not
Vercel AI configuration. Never bypass policy by spoofing localhost or NODE_ENV.

## Owner setup and migration

Generate one dedicated owner code locally using 32 random bytes encoded as base64url
(43 characters). A local Node program can use `randomBytes(32).toString('base64url')`
and `createHash('sha256').update(code).digest('hex')`. Store its digest in
`AI_OWNER_CODE_SHA256`; keep the raw code private to the owner. Generate the signing
secret independently. No real secret is needed in repository tests or chat.

Retain the existing durable Redis namespace and budget balances. In the provider's
private console, configure the fixed owner member using the SAME digest:

```text
HSET "judu:{beta-v1}:invites" "owner" "<owner code SHA-256 hex digest>"
```

The legacy Redis hash name is retained to minimize migration. Old friend fields are
ignored by the new application and can be removed deliberately. Disable old deployed
versions/aliases that still accept friend invites; removing their friend fields
also revokes their durable authorization. The application never repopulates it.

For a **fresh ledger only**, first verify the budget key does not exist, then for
an illustrative $5 allowance initialize once:

```text
HSET "judu:{beta-v1}:budget" limit 5000000 spent 0 reserved 0
```

**Never reinitialize an existing ledger.** Amounts are integer micro-USD. Preserve
`spent`, `reserved`, existing reservations and any `blocked` field. Missing or
unavailable accounting fails closed. No auto-initialization, refund or monthly
reset is implemented. The smaller of durable `limit` and configured budget wins.
Changing an allowance is an explicit owner action preserving prior usage.
Use persistent Redis with no eviction/expiry for owner money/reservation records.

The owner enters the code under **Owner AI access**. Login checks its hash and Redis
authorization, then issues an eight-hour `__Host-judu-owner` cookie: signed, HttpOnly,
Secure, SameSite=Strict, Path=/, no Domain. It contains the owner role/ID, digest,
expiry and random CSRF/session values, never the code or API key. The form clears
the code on success and explicitly selects Owner AI. Subsequent visits require
selecting **Use Owner AI** even while the session remains valid.

The old `__Host-judu-beta` cookie is not accepted. Revoke the owner across deployments
by deleting Redis's `owner` field; rotate its digest in both Redis and environment
to issue new access. Rotating the signing secret invalidates all sessions. Logout
clears this browser's owner cookie; a copied cookie remains valid until expiry or
revocation. Only share the URL with friends, never the owner code.

## BYOK handling and trust boundary

A friend needs no owner code. **Use my own OpenAI API key** keeps a validated key in
a closure owned by the current browser tab, outside document state. The masked
entry field clears after acceptance; the stored key is never displayed. Remove key,
refresh, page exit and a fresh tab remove/lose that value. No browser persistence,
IndexedDB, localStorage, cookie, URL, Redis record or server-side key vault stores it.

Entering a key performs no API request. Only an explicit paid AI request sends it
as an HTTPS Authorization header to Judu's same-origin Node function. Translation,
status and login requests do not carry it. The function strips it from request
header collections, passes it transiently to the SDK, clears its own reference in
finally, and returns only sanitized errors/results. No application logging,
process result cache, Redis key fingerprint or transcript includes the key.
JavaScript cannot guarantee immediate RAM zeroization or garbage collection.

This simple design requires trusting the deployed Judu application, hosting platform
and OpenAI with the transient credential; browser extensions/XSS can access tab
memory. Configure hosting/monitoring to avoid capturing Authorization headers or
request dumps, and do not share HAR captures containing them. No persistent secret
vault was added. Judu cannot verify whose account issued a supplied key: billing
always follows that explicit credential. Friends must supply their own keys.

A status request issues an anonymous signed eight-hour `__Host-judu-byok` cookie and
returns its CSRF token. This cookie contains only a random limiter ID and session
fields, never a key. It is not owner authentication. Cookie resets do not defeat
the independent IP/global limits. Expiry requires refreshing AI access; it does
not choose owner billing.

## Limits, accounting and failures

Both modes retain exact configured HTTPS Origin, JSON content type, SameSite/CSRF,
200 KB body, strict schema, 12,000-character source, four 1,500-character history,
3,000-character question, 256–8000 output-token and 60-second request limits. A UUID
request ID is mandatory. Only bounded excerpts, questions/history and document
metadata enter the prompt. Unknown client model settings and overlong inputs fail
before OpenAI. No automatic retry or cross-mode fallback occurs.

Owner limits remain 5 requests/owner/minute, 20/global/minute, 1 active/owner and
3 active/global; login is limited to 5/address/minute and 30/global/minute. BYOK has
its own 5/client, 10/address, 20/global requests/minute and 1/client, 2/address,
3/global active requests. Limits use Redis atomic scripts; leases expire after
120 seconds. Address keys use a salted digest of the socket address, ignoring
forwarded headers; platform proxies may conservatively group visitors together.
Fixed windows permit bursts across boundaries. BYOK replay IDs last 24 hours;
owner replay/reservation records remain durable. No automatic response replay exists.

Owner reservations use serialized prompt UTF-8 bytes plus 8,192 framing tokens,
max 100,000, charged at configured uncached price, plus the complete output cap.
This fixed-model text-only bound and pricing are engineering assumptions, not a
provider invoice guarantee. Valid reported input/cached/output usage is atomically
settled before answer parsing; reasoning is already included in output. Settlement
above the reservation blocks further owner AI pending investigation. On ambiguous
usage, timeout, transport error or failed settlement, the full reservation remains
held; never clear it without authoritative provider reconciliation. Check current
pricing and available provider project alerts/limits as additional defenses.

BYOK uses only `judu:{beta-v1}:byok:*` counters, random client/request IDs, salted
address digests and leases. It needs no owner budget initialization. Redis failure
blocks its requests for abuse control, but never charges owner money. Redis stores
neither mode's prompts, answers, PDFs, notes nor keys. Global limits reduce abuse;
they do not guarantee zero hosting/Redis DoS cost. Keep platform usage controls.

## Privacy and verification

PDFs, notes, highlights, progress and saved conversations remain in browser
IndexedDB. Explicit AI excerpts/history reach Judu/OpenAI, with `store:false`;
this is not a provider zero-retention promise. MyMemory's existing explicit
translation requests remain independent. No reader indexing, geometry, navigation,
notes, highlight or document-storage behavior was changed.

Run `node tests/run-unit.mjs` and `npm run build` without a server. Policy/handler
tests invoke Express through in-memory streams; OpenAI/Redis HTTP boundaries are
mocked. Optional native Lua tests execute production scripts with an in-memory
redis.call model via Python/liblua, without a Redis process. They skip on machines
without that interpreter. Do not run the legacy listener-based API test here.

Before enabling either mode manually on the HTTPS deployment, verify real Redis
EVAL/persistence, cookies/CSRF/expiry, ordinary visitor denial, owner revocation and
budget exhaustion, BYOK key removal/refresh, provider error sanitation, and both
billing modes against the correct OpenAI dashboards. Confirm BYOK leaves owner
balances unchanged and never falls back on failure. Repeat Windows reader checks.
No real OpenAI/Redis call, hosted configuration change or deployment is claimed by
local mocked tests.
