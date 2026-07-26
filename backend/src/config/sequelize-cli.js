require('dotenv/config');

const common = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false },
  },
};

module.exports = {
  development: common,
  test: common,
  production: common,
};
