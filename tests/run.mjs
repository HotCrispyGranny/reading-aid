// Run registered node:test cases in-process; works in managed workers whose
// nested subprocess test isolation is restricted.
import './sentences.test.mjs';
import './ai.test.mjs';
import './translation.test.mjs';
import './api.test.mjs';
