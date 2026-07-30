import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app: Application = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
// Phase 6: the Razorpay webhook handler (routes/paymentRoutes.ts) needs the
// exact raw request body bytes to verify Razorpay's HMAC signature —
// re-serializing the parsed JSON body would not byte-for-byte match what
// Razorpay signed. Rather than mounting a second, route-specific
// express.raw() middleware ahead of this one (which would need to run
// BEFORE express.json() for that one path and is easy to get subtly wrong
// with routing order), this uses express.json()'s own `verify` hook to
// stash the raw Buffer on the request alongside the normal parsed `body`.
// This runs for every request whose Content-Type matches express.json()'s
// default `application/json` — it's a cheap Buffer reference, not a copy of
// parsed output, so it doesn't change parsing behavior or add meaningful
// overhead for the many routes that never read `req.rawBody`.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', appName: env.APP_NAME });
});

/**
 * Root index.
 *
 * This is an API-only deployment — there was no `/` handler at all, so opening
 * the backend's own Vercel URL in a browser hit Express's default 404 and
 * showed the bare string "Cannot GET /". That looks exactly like a dead
 * deployment, even though every real route under /api was working fine. This
 * makes the root say so out loud, and doubles as a cheap uptime check.
 */
app.get('/', (_req, res) => {
  res.json({
    name: `${env.APP_NAME} API`,
    status: 'ok',
    message: 'This is the API server. The web app is served separately.',
    endpoints: {
      health: '/health',
      api: '/api',
    },
  });
});

app.use('/api', routes);

/**
 * JSON 404 for anything unmatched, instead of Express's HTML default. A
 * frontend fetch that hits a typo'd path previously got back an HTML error
 * page, which apiFetch couldn't parse and reported as the far less helpful
 * "Request failed with status 404".
 */
app.use((req, res) => {
  res.status(404).json({ message: `No route for ${req.method} ${req.path}` });
});

app.use(errorHandler);

export default app;
