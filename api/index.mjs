// Vercel Node function. All /api/* routes share the same application as local dev.
// No app.listen(), Vite middleware, or filesystem writes during invocation.
export {default} from '../server/app.mjs';
