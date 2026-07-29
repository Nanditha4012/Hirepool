import { Sequelize } from 'sequelize';
// Sequelize loads the Postgres dialect via a dynamic `require('pg')`
// internally, which serverless bundlers (Vercel's build step included) can't
// see through static analysis — they end up pruning `pg` out of the deployed
// function even though it's a real, correctly-listed dependency, causing
// "Please install pg package manually" at runtime. This static import gives
// the bundler a concrete signal to include it. Harmless everywhere else
// (plain Node dev/Render/etc. already resolve `pg` fine either way).
import 'pg';
import { env } from './env';

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false },
  },
});
