// Server-free targeted regressions. The legacy api.test.mjs opens a listener and
// is intentionally excluded; beta.test.mjs invokes Express without a socket.
import './sentences.test.mjs';
import './highlight-geometry.test.mjs';
import './focus-shape.test.mjs';
import './ai.test.mjs';
import './translation.test.mjs';
import './local-ai.test.mjs';
import './beta.test.mjs';
import './beta-ledger.test.mjs';
import './byok.test.mjs';
import './byok-ledger.test.mjs';
