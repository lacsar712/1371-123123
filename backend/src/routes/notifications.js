const express = require('express');
const { param, query, body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const { Notification } = require('../models');
const notificationService = require('../notificationService');
const logger = require('../logger');

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

router.get('/sse', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const userRole = req.query.userRole;
  if (!userId || !['student', 'teacher', 'admin'].includes(userRole)) {
    return res.status(400).json({ ok: false, message: '无效的参数' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  notificationService.addClient(userId, userRole, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 30000);

  res.on('close', () => {
    clearInterval(heartbeat);
  });
});

const listValidators = [
  query('userId').isInt({ min: 1 }).withMessage('无效的用户ID'),
  query('userRole').isIn(['student', 'teacher', 'admin']).withMessage('无效的用户角色'),
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须为正整数'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  query('unreadOnly').optional().isBoolean().withMessage('无效的参数'),
  query('type').optional().isIn(['lottery', 'ticket', 'badge', 'exam', 'announcement', 'system']).withMessage('无效的通知类型'),
];

router.get('/', listValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const userId = parseInt(req.query.userId, 10);
  const userRole = req.query.userRole;
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 20;
  const unreadOnly = req.query.unreadOnly === 'true';
  const type = req.query.type || null;

  try {
    const where = { userId, userRole };
    if (unreadOnly) where.isRead = false;
    if (type) where.type = type;

    const { count, rows } = await Notification.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    const unreadCount = await Notification.count({
      where: { userId, userRole, isRead: false },
    });

    return sendJson(res, 200, {
      ok: true,
      data: {
        list: rows,
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
        unreadCount,
      },
    });
  } catch (e) {
    logger.error('List notifications error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.get('/unread-count', listValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const userId = parseInt(req.query.userId, 10);
  const userRole = req.query.userRole;

  try {
    const count = await Notification.count({
      where: { userId, userRole, isRead: false },
    });

    const latestNotifications = await Notification.findAll({
      where: { userId, userRole, isRead: false },
      order: [['createdAt', 'DESC']],
      limit: 10,
    });

    return sendJson(res, 200, {
      ok: true,
      data: {
        unreadCount: count,
        latest: latestNotifications,
      },
    });
  } catch (e) {
    logger.error('Get unread count error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.get('/latest', [
  query('userId').isInt({ min: 1 }).withMessage('无效的用户ID'),
  query('userRole').isIn(['student', 'teacher', 'admin']).withMessage('无效的用户角色'),
  query('limit').optional().isInt({ min: 1, max: 50 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const userId = parseInt(req.query.userId, 10);
  const userRole = req.query.userRole;
  const limit = parseInt(req.query.limit, 10) || 10;

  try {
    const list = await Notification.findAll({
      where: { userId, userRole },
      order: [['createdAt', 'DESC']],
      limit,
    });
    const unreadCount = await Notification.count({
      where: { userId, userRole, isRead: false },
    });
    return sendJson(res, 200, { ok: true, data: { list, unreadCount } });
  } catch (e) {
    logger.error('Get latest notifications error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.put('/:id/read', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);

  try {
    const notification = await Notification.findByPk(id);
    if (!notification) {
      return sendJson(res, 404, { ok: false, message: '通知不存在' });
    }

    await Notification.update({ isRead: true }, { where: { id } });

    return sendJson(res, 200, { ok: true, message: '已标记为已读' });
  } catch (e) {
    logger.error('Mark notification read error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

const markAllReadValidators = [
  query('userId').isInt({ min: 1 }).withMessage('无效的用户ID'),
  query('userRole').isIn(['student', 'teacher', 'admin']).withMessage('无效的用户角色'),
];

router.post('/read-all', markAllReadValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const userId = parseInt(req.query.userId, 10);
  const userRole = req.query.userRole;

  try {
    const [count] = await Notification.update(
      { isRead: true },
      { where: { userId, userRole, isRead: false } }
    );

    return sendJson(res, 200, { ok: true, message: `已标记 ${count} 条通知为已读`, data: { count } });
  } catch (e) {
    logger.error('Mark all read error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

const batchReadValidators = [
  body('ids').isArray({ min: 1 }).withMessage('通知ID列表不能为空'),
  body('ids.*').isInt({ min: 1 }).withMessage('无效的通知ID'),
];

router.post('/batch-read', batchReadValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const ids = req.body.ids;

  try {
    const [count] = await Notification.update(
      { isRead: true },
      { where: { id: { [Op.in]: ids }, isRead: false } }
    );

    return sendJson(res, 200, { ok: true, message: `已标记 ${count} 条通知为已读`, data: { count } });
  } catch (e) {
    logger.error('Batch read error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

const batchDeleteValidators = [
  body('ids').isArray({ min: 1 }).withMessage('通知ID列表不能为空'),
  body('ids.*').isInt({ min: 1 }).withMessage('无效的通知ID'),
];

router.post('/batch-delete', batchDeleteValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const ids = req.body.ids;

  try {
    const count = await Notification.destroy({
      where: { id: { [Op.in]: ids } },
    });

    return sendJson(res, 200, { ok: true, message: `已删除 ${count} 条通知`, data: { count } });
  } catch (e) {
    logger.error('Batch delete error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.delete('/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);

  try {
    const count = await Notification.destroy({ where: { id } });
    if (count === 0) {
      return sendJson(res, 404, { ok: false, message: '通知不存在' });
    }
    return sendJson(res, 200, { ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete notification error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

module.exports = router;
