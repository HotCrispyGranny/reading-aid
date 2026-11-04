# Friends Beta AI — Phase 2B

This implementation does not deploy or configure external services. Paid production
AI remains OFF unless every setting below is valid and the durable ledger exists.
Local development still uses the original direct-loopback policy and needs no Redis.
Reader/indexing/rendering, browser PDFs, notes, marks, progress and MyMemory are unchanged.

## Manual Vercel setup checklist

Configure **Production** environment variables only. Do not expose them through
`VITE_*`, frontend code, source control, logs or screenshots. Do not enable paid
preview deployments. A dedicated OpenAI project/key is recommended.

| Variable | Required value/purpose |
| --- | --- |
| `AI_BETA_ENABLED` | Exact `true`, set LAST; default/absent is disabled |
| `AI_API_KEY` | OpenAI project API key; server only |
| `AI_MODEL` | Exact `gpt-5-mini`; no client model override or fallback |
| `AI_MAX_OUTPUT_TOKENS` | Integer 256–8000, e.g. 2500; includes reasoning tokens |
| `AI_INPUT_USD_PER_MILLION` | Verified current uncached input rate, positive USD/million |
| `AI_CACHED_INPUT_USD_PER_MILLION` | Verified cached input rate, positive and no greater than uncached |
| `AI_OUTPUT_USD_PER_MILLION` | Verified output rate, positive USD/million |
| `AI_BETA_PRICING_CONFIRMED` | Exact `true` only AFTER checking effective current OpenAI pricing |
| `AI_BETA_ORIGIN` | Exact HTTPS origin, e.g. `https://reading-aid.vercel.app`, without trailing slash/path |
| `AI_BETA_BUDGET_USD` | Global **lifetime beta** allowance, >0 and <=1000; e.g. 5 |
| `AI_BETA_INVITES_JSON` | JSON object mapping distinct member IDs to SHA-256 invite hashes |
| `AI_BETA_SESSION_SECRET` | Independent cryptographically random 32-byte base64url secret (43+ characters) |
| `AI_BETA_REDIS_REST_URL` | Dedicated managed Redis HTTPS REST command endpoint supporting atomic `EVAL` |
| `AI_BETA_REDIS_REST_TOKEN` | Server-only read/write REST credential for that database |

`HOST`, `PORT`, `.env`, local proxy settings and `AI_BASE_URL` are not Vercel AI
configuration. The last variable is obsolete; the official Responses SDK is used.
Never bypass the production guard by changing NODE_ENV or spoofing localhost headers.

### External service and ledger initialization

Create one dedicated durable Redis-compatible database with an HTTPS REST command
API (for example Upstash Redis). It must support EVAL and the hash/string/sorted-set
commands in `server/beta-store.mjs`, with persistence and **no eviction or expiry of
budget/reservation keys**. The application uses native fetch, no extra Redis package.
Protect its credential and limit access to this application and its owner.

Before enabling AI, initialize the **fresh** ledger once in the provider's private
Redis console. For an illustrative $5 lifetime beta allowance:

```text
HSET "judu:{beta-v1}:budget" limit 5000000 spent 0 reserved 0
```

Amounts are integer micro-USD (1 USD = 1,000,000). First verify the key does NOT
already exist. **Never run that initialization on an existing ledger**: resetting
spent/reserved would restore an already consumed allowance. Missing state fails
closed; the app never creates or automatically resets its budget. No monthly reset
is implemented. Increasing an allowance is a deliberate owner action: change only
the durable `limit` field and the deployment's budget setting, preserving usage.
The smaller of these two limits always wins, including across old deployments.
Do not delete the namespace or reuse a new database to circumvent consumed spend.

All keys use a shared Redis hash tag for cluster-compatible atomic scripts.
Redis stores only counters, leases, member/request IDs and numeric accounting;
it never receives document text, PDFs, notes, reading progress, prompts or answers.
It also stores the authoritative allowlist of member IDs and invite **hashes**.

### Invite/session setup

Generate each invite locally using a cryptographic random generator: 32 random bytes
encoded as base64url (43 characters). Store only its SHA-256 lowercase hex digest in
`AI_BETA_INVITES_JSON`, for example the **format**, not usable credentials:

```text
{"member-id":"<64 lowercase hex characters representing the invite SHA-256>"}
```

Give each friend their own raw code privately. Do not commit/print real codes or
secrets into this repository, build logs or chat. A local Node program can use
`randomBytes(32).toString('base64url')` and `createHash('sha256').update(code).digest('hex')`.
Generate the session signing secret independently. There is no signup/account database.
For each configured member, initialize its durable authorization in the private
Redis console using the SAME hash as its environment entry:

```text
HSET "judu:{beta-v1}:invites" "member-id" "<invite SHA-256 hex digest>"
```

Missing/mismatched membership denies login and paid requests. To revoke one friend
immediately across deployments, `HDEL "judu:{beta-v1}:invites" "member-id"`, then
remove/rotate that environment entry. For rotation, update both locations with the
new hash. The application never automatically repopulates this allowlist, so old
deployments cannot resurrect revoked invites. Disable old deployments when changing
pricing/security policies; do not leave paid preview aliases configured.

The server validates an invite, then issues an eight-hour `__Host-judu-beta` cookie:
HttpOnly, Secure, SameSite=Strict, Path=/, no Domain. The UI clears the raw code after
success and never uses localStorage for authentication. The signed cookie contains
the member ID, invite digest, timestamps and random session/CSRF values, not the code.
Changing/removing one member's configured digest revokes that member's existing
sessions on that deployment; the durable allowlist revokes them across deployments.
Other identities remain valid. A new session does not reset per-invite
quotas. Rotating the signing secret revokes everyone. Logout deletes this browser's
cookie; an already copied cookie remains valid until expiration or invite revocation.

## Request and accounting policy

Every production `/api/analyze`, `/api/chat` and `/api/word` request requires:

1. Complete valid configuration, enabled flag, and the one allowed model.
2. Valid signed session with an invite still present in current configuration.
3. Exact configured HTTPS Origin, JSON body, and matching `X-CSRF-Token`.
4. Strict bounded request schema and a UUID `X-AI-Request-ID`.
5. A successful atomic Redis reservation before any OpenAI call.

Limits are shared: **5 requests/member/minute, 20/global/minute, one active/member,
three active/global**. Login attempts: five/address/minute and 30/global/minute.
Fixed windows can allow bursts across minute boundaries; the durable budget still
bounds total spending. Address buckets use a salted hash of the server-observed
socket address, never user-supplied forwarding headers. Hosting proxies may collapse
visitors into one address; the global limit is intentional and conservative.

The existing 200 KB JSON, 12,000-character source, four 1,500-character history,
3,000-character question and 256–8000 output-token bounds remain. Malformed fields,
unknown top-level model settings and overlong requests are rejected before accounting
or OpenAI. Sources, question, history and document metadata alone enter the prompt.

Reservation uses a deliberately pessimistic text-only input bound: serialized
message UTF-8 bytes plus 8,192 framing tokens, capped at 100,000. Each token is
charged at the configured uncached input rate; all permitted output tokens are
reserved at the output rate. This fixed-model byte bound is an engineering
assumption, not the frontend estimate or a provider invoice guarantee. New models,
tools or multimodal inputs require reviewing it before support is added.

After provider-reported valid token usage arrives, an atomic settlement charges
actual reported input/cached/output usage rounded UP to micro-USD, releasing only
the unused reservation. Reasoning is already included in output usage. Usage is
settled even if later JSON/answer validation fails. An actual configured-rate cost
above its reservation blocks further beta AI pending owner investigation.

On timeout, disconnect, transport failure, missing usage, settlement failure or
process termination, the entire reservation stays held. Unknown requests are NEVER
automatically refunded. Concurrency leases expire after 120 seconds; budget holds
and replay records do not. Manual reconciliation requires authoritative provider
usage; do not simply clear held balances. Ambiguous accounting may exhaust the
beta allowance early, which is safer than repeating an unknown paid call.

SDK retries are disabled. A reused request ID for the same invite never calls
OpenAI again; the app does not store transcripts to replay answers. Production
process-memory AI caching is disabled to avoid cross-member cached responses.
The existing browser-local analysis cache remains. Public status and member usage
responses exclude aggregate spending, request counts, invite configuration and
credentials. Authenticated/auth endpoints use private/no-store response headers.

The application cap depends on truthful configured pricing, provider token bounds
and retained durable Redis state. Provider billing is authoritative. Check pricing
before enablement and after provider changes. Use project alerts/available provider
controls as defense in depth, not the application cap itself. Keep Vercel/Redis
provider usage limits enabled: OpenAI controls do not prevent all hosting/Redis DoS
costs. No real OpenAI or hosted Redis request was made during implementation.

## Privacy and reader preservation

PDFs, notes, marks, progress and conversation records remain in each browser's
IndexedDB. Only explicit bounded AI excerpts, metadata/questions/recent history
reach the Node function and OpenAI. `store:false` is retained; this is not a promise
of zero provider retention. Normal sentence/word translation still uses MyMemory.
No server PDF upload, cloud document database or billing/account system was added.

## Verification before enabling on Vercel

The local automated suite invokes Express with in-memory request/response streams,
without opening sockets. OpenAI/Redis HTTP boundaries are mocked. Actual production
Lua is also executed in optional embedded Python/liblua tests with redis.call modeled
in memory; no Redis server is started. On systems without that interpreter those
Lua-specific tests skip; the portable Node policy/handler tests still run.

Run `node tests/run-unit.mjs` for the server-free regression suite and `npm run build`
for type/build checks. Do not use the legacy full API test here: it starts a listener.

Before enabling, manually check real Redis EVAL compatibility, persistence, fresh
ledger initialization, all required Production variables, and access-cookie behavior
on the HTTPS deployment. Verify unauthenticated/CSRF/malformed requests cannot call
OpenAI, then use one short authorized request and compare usage against the provider
dashboard and durable counters. Check a low disposable budget fails closed. Do not
use real secrets in screenshots, logs or tests. Verify session expiry/revocation,
rate limits, and the previously verified PDF reader on Windows. No deployment or
Vercel settings change is authorized by this document.
