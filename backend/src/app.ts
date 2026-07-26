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
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', appName: env.APP_NAME });
});

app.use('/api', routes);

app.use(errorHandler);

export default app;
