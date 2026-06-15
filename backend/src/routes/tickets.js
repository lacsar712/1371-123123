const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const { Ticket, TicketReply, sequelize } = require('../models');
const notificationService = require('../notificationService');
const logger = require('../logger');

const CATEGORY_MAP = {
  course_enrollment: '选课问题',
  grade_appeal: '成绩异议',
  system_fault: '系统故障',
  other: '其他',
};

const STATUS_MAP = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

const createValidators = [
  body('title').trim().notEmpty().withMessage('标题不能为空'),
  body('description').trim().notEmpty().withMessage('描述不能为空'),
  body('category').isIn(['course_enrollment', 'grade_appeal', 'system_fault', 'other']).withMessage('无效的分类'),
  body('submitterId').isInt({ min: 1 }).withMessage('无效的提交人ID'),
  body('submitterRole').isIn(['student', 'teacher', 'admin']).withMessage('无效的提交人角色'),
  body('submitterName').trim().notEmpty().withMessage('提交人姓名不能为空'),
];

router.post('/', createValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const { title, description, category, submitterId, submitterRole, submitterName } = req.body;
  try {
    const ticket = await Ticket.create({
      title: title.trim(),
      description: description.trim(),
      category,
      status: 'pending',
      submitterId,
      submitterRole,
      submitterName: submitterName.trim(),
    });
    return sendJson(res, 201, { ok: true, data: ticket.toJSON() });
  } catch (e) {
    logger.error('Create ticket error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

const listValidators = [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须为正整数'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  query('status').optional().isIn(['pending', 'processing', 'resolved', 'closed']).withMessage('无效的状态'),
  query('category').optional().isIn(['course_enrollment', 'grade_appeal', 'system_fault', 'other']).withMessage('无效的分类'),
  query('submitterId').optional().isInt({ min: 1 }).withMessage('无效的提交人ID'),
  query('submitterRole').optional().isIn(['student', 'teacher', 'admin']).withMessage('无效的提交人角色'),
  query('handlerId').optional().isInt({ min: 1 }).withMessage('无效的处理人ID'),
  query('keyword').optional().trim(),
];

router.get('/', listValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10;
  const { status, category, submitterId, submitterRole, handlerId, keyword } = req.query;

  try {
    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (submitterId) {
      where.submitterId = parseInt(submitterId, 10);
      if (submitterRole) where.submitterRole = submitterRole;
    }
    if (handlerId) where.handlerId = parseInt(handlerId, 10);
    if (keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${keyword}%` } },
        { description: { [Op.like]: `%${keyword}%` } },
      ];
    }

    const { count, rows } = await Ticket.findAndCountAll({
      where,
      order: [
        ['status', 'ASC'],
        ['lastReplyAt', 'DESC'],
      ],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    const data = rows.map((t) => ({
      ...t.toJSON(),
      categoryText: CATEGORY_MAP[t.category] || t.category,
      statusText: STATUS_MAP[t.status] || t.status,
    }));

    return sendJson(res, 200, {
      ok: true,
      data: {
        list: data,
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
      },
    });
  } catch (e) {
    logger.error('List tickets error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

const detailValidators = [
  param('id').isInt({ min: 1 }),
  query('requesterId').optional().isInt({ min: 1 }),
  query('requesterRole').optional().isIn(['student', 'teacher', 'admin']),
];

router.get('/:id', detailValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const requesterId = req.query.requesterId ? parseInt(req.query.requesterId, 10) : null;
  const requesterRole = req.query.requesterRole || null;
  try {
    const ticket = await Ticket.findByPk(id, {
      include: [{ model: TicketReply, as: 'replies', order: [['createdAt', 'ASC']] }],
    });
    if (!ticket) {
      return sendJson(res, 404, { ok: false, message: '工单不存在' });
    }
    if (requesterId && requesterRole && requesterRole !== 'admin') {
      if (ticket.submitterId !== requesterId || ticket.submitterRole !== requesterRole) {
        if (ticket.handlerId !== requesterId) {
          return sendJson(res, 403, { ok: false, message: '无权查看该工单' });
        }
      }
    }
    const data = {
      ...ticket.toJSON(),
      categoryText: CATEGORY_MAP[ticket.category] || ticket.category,
      statusText: STATUS_MAP[ticket.status] || ticket.status,
    };
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    logger.error('Get ticket detail error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

const replyValidators = [
  body('content').trim().notEmpty().withMessage('回复内容不能为空'),
  body('replyerId').isInt({ min: 1 }).withMessage('无效的回复人ID'),
  body('replyerRole').isIn(['student', 'teacher', 'admin']).withMessage('无效的回复人角色'),
  body('replyerName').trim().notEmpty().withMessage('回复人姓名不能为空'),
];

router.post('/:id/reply', param('id').isInt({ min: 1 }), replyValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const ticketId = parseInt(req.params.id, 10);
  const { content, replyerId, replyerRole, replyerName } = req.body;

  const t = await sequelize.transaction();
  try {
    const ticket = await Ticket.findByPk(ticketId, { transaction: t });
    if (!ticket) {
      await t.rollback();
      return sendJson(res, 404, { ok: false, message: '工单不存在' });
    }

    if (ticket.status === 'closed') {
      await t.rollback();
      return sendJson(res, 400, { ok: false, message: '工单已关闭，无法回复' });
    }

    if (replyerRole !== 'admin') {
      const isSubmitter = ticket.submitterId === replyerId && ticket.submitterRole === replyerRole;
      const isHandler = ticket.handlerId === replyerId;
      if (!isSubmitter && !isHandler) {
        await t.rollback();
        return sendJson(res, 403, { ok: false, message: '无权回复该工单' });
      }
    }

    const reply = await TicketReply.create(
      {
        ticketId,
        content: content.trim(),
        replyerId,
        replyerRole,
        replyerName: replyerName.trim(),
      },
      { transaction: t }
    );

    await Ticket.update(
      { lastReplyAt: new Date() },
      { where: { id: ticketId }, transaction: t }
    );

    await t.commit();

    if (replyerRole === 'admin' && ticket.submitterId !== replyerId) {
      notificationService.createAndPush(
        ticket.submitterId,
        ticket.submitterRole,
        '工单有新回复',
        `您的工单「${ticket.title}」收到了新回复`,
        'ticket',
        'ticket',
        ticketId
      );
    }

    if (replyerRole !== 'admin' && ticket.handlerId) {
      notificationService.createAndPush(
        ticket.handlerId,
        'admin',
        '工单有新回复',
        `工单「${ticket.title}」收到了用户的新回复`,
        'ticket',
        'ticket',
        ticketId
      );
    }

    return sendJson(res, 201, { ok: true, data: reply.toJSON() });
  } catch (e) {
    await t.rollback();
    logger.error('Reply ticket error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

const statusValidators = [
  body('status').isIn(['pending', 'processing', 'resolved', 'closed']).withMessage('无效的状态'),
  body('operatorId').isInt({ min: 1 }).withMessage('无效的操作人ID'),
  body('operatorName').trim().notEmpty().withMessage('操作人姓名不能为空'),
];

router.put('/:id/status', param('id').isInt({ min: 1 }), statusValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const ticketId = parseInt(req.params.id, 10);
  const { status, operatorId, operatorName } = req.body;

  try {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return sendJson(res, 404, { ok: false, message: '工单不存在' });
    }

    const oldStatus = ticket.status;
    await Ticket.update({ status }, { where: { id: ticketId } });

    const updated = await Ticket.findByPk(ticketId);

    if (oldStatus !== status) {
      notificationService.createAndPush(
        ticket.submitterId,
        ticket.submitterRole,
        '工单状态已更新',
        `您的工单「${ticket.title}」状态已变更为「${STATUS_MAP[status] || status}」`,
        'ticket',
        'ticket',
        ticketId
      );
    }

    return sendJson(res, 200, { ok: true, data: updated.toJSON() });
  } catch (e) {
    logger.error('Update ticket status error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

const assignValidators = [
  body('ticketIds').isArray({ min: 1 }).withMessage('工单ID列表不能为空'),
  body('handlerId').isInt({ min: 1 }).withMessage('无效的处理人ID'),
  body('handlerName').trim().notEmpty().withMessage('处理人姓名不能为空'),
];

router.post('/batch-assign', assignValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const { ticketIds, handlerId, handlerName } = req.body;

  try {
    const tickets = await Ticket.findAll({ where: { id: { [Op.in]: ticketIds } } });
    if (!tickets.length) {
      return sendJson(res, 404, { ok: false, message: '未找到对应工单' });
    }

    await Ticket.update(
      { handlerId, handlerName: handlerName.trim(), status: 'processing' },
      { where: { id: { [Op.in]: ticketIds } } }
    );

    tickets.forEach((ticket) => {
      notificationService.createAndPush(
        ticket.submitterId,
        ticket.submitterRole,
        '工单已分配处理人',
        `您的工单「${ticket.title}」已分配处理人，正在处理中`,
        'ticket',
        'ticket',
        ticket.id
      );
    });

    return sendJson(res, 200, { ok: true, message: `已分配 ${tickets.length} 条工单`, data: { count: tickets.length } });
  } catch (e) {
    logger.error('Batch assign tickets error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

module.exports = router;
