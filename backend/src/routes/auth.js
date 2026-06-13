const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { hashPassword } = require('../db');
const { Admin, Student } = require('../models');
const logger = require('../logger');

const loginValidators = [
  body('username').trim().notEmpty().withMessage('用户名/学号不能为空'),
  body('password').notEmpty().withMessage('密码不能为空'),
  body('role').isIn(['student', 'admin']).withMessage('无效的身份'),
];

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

router.post('/login', loginValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const { username, password, role } = req.body;
  const hash = hashPassword(password);
  try {
    if (role === 'admin') {
      const row = await Admin.findOne({ where: { username, passwordHash: hash }, attributes: ['id', 'username'] });
      if (!row) {
        logger.warn('Admin login failed', { username });
        return sendJson(res, 401, { ok: false, message: '用户名或密码错误' });
      }
      return sendJson(res, 200, { ok: true, data: { id: row.id, username: row.username, role: 'admin' } });
    }
    const row = await Student.findOne({
      where: { studentNo: username, passwordHash: hash },
      attributes: ['id', 'studentNo', 'name'],
    });
    if (!row) {
      logger.warn('Student login failed', { username });
      return sendJson(res, 401, { ok: false, message: '学号或密码错误' });
    }
    return sendJson(res, 200, { ok: true, data: { id: row.id, studentNo: row.studentNo, name: row.name, role: 'student' } });
  } catch (e) {
    logger.error('Login error', { error: e.message, stack: e.stack });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 健康检查，便于排查前端能否连上后端
router.get('/ping', (req, res) => {
  sendJson(res, 200, { ok: true, message: 'pong' });
});

// 退出登录（目前后端是无状态的，这个接口主要用于前端显式调用以及未来扩展）
router.post('/logout', (req, res) => {
  try {
    logger.info('User logout', { ip: req.ip, userAgent: req.get('User-Agent') });
  } catch (_) {}
  return sendJson(res, 200, { ok: true, message: '已退出登录' });
});

module.exports = router;
