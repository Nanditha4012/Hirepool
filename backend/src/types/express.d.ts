export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
      };
      /**
       * Raw request body bytes, captured by express.json()'s `verify` hook
       * in app.ts. Only populated for requests whose Content-Type matched
       * express.json()'s default `application/json` type — which is all
       * that's needed here, since the sole consumer is the Razorpay webhook
       * handler's HMAC signature check (Razorpay always sends JSON). See
       * app.ts for the full "why not a second body parser" rationale.
       */
      rawBody?: Buffer;
    }
  }
}
