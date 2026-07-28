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

app.use('/api', routes);

app.use(errorHandler);

export default app;
