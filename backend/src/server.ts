import app from './app';
import { sequelize } from './models';
import { env } from './config/env';

async function start(): Promise<void> {
  try {
    await sequelize.authenticate();

    app.listen(env.PORT, () => {
      console.log(`${env.APP_NAME} backend listening on port ${env.PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
