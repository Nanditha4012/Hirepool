// Vercel serverless entry point. NOT used by `npm run dev`/`npm start` — those
// use src/server.ts, which calls app.listen() for a normal persistent
// process. Vercel instead wants a module that exports a request handler
// directly (Express apps work as-is here); it wraps this per-invocation
// rather than binding a port. Importing the source app.ts directly (not the
// compiled dist/ output) — Vercel's own Node.js builder traces and
// transpiles this file's dependency graph itself, independent of this
// repo's `npm run build` step.
import app from '../src/app';

export default app;
