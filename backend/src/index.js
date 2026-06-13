const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const logger = require('./logger');

// 确保 SQLite 数据目录存在
const dataDir = path.resolve(
  __dirname,
  '..',
  'data'
);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const { sequelize } = require('./models');
const authRouter = require('./routes/auth');
const coursesRouter = require('./routes/courses');
const enrollmentRouter = require('./routes/enrollment');
const adminRouter = require('./routes/admin');
const seed = require('./seed').seed;

const PORT = parseInt(process.env.PORT || '8137', 10);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/students', enrollmentRouter);
app.use('/api/admin', adminRouter);

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ ok: false, message: err.message || '服务器错误' });
});

async function waitDb(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await sequelize.authenticate();
      return;
    } catch (e) {
      logger.warn('Database not ready, retry', { attempt: i + 1, error: e.message });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Database connect timeout');
}

async function start() {
  try {
    await waitDb();
    logger.info('Database connected');
  } catch (e) {
    logger.error('Database connect failed', { error: e.message });
    process.exit(1);
  }
  try {
    await sequelize.sync({ alter: true });
  } catch (e) {
    logger.warn('Sync warning (continuing)', { error: e.message });
  }
  try {
    await seed();
  } catch (e) {
    logger.error('Seed failed, server will still start', { error: e.message });
  }
  app.listen(PORT, '0.0.0.0', () => {
    logger.info('Server listening', { port: PORT, url: `http://0.0.0.0:${PORT}` });
  });
}

start().catch((e) => {
  logger.error('Start failed', { error: e.message });
  process.exit(1);
});
