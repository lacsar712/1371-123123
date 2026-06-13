const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const { Course, Enrollment, Student } = require('../models');
const { hashPassword } = require('../db');
const logger = require('../logger');

// ========== 学生管理 ==========
router.get('/students', async (req, res) => {
  try {
    const list = await Student.findAll({
      order: [['id']],
      attributes: ['id', 'studentNo', 'name'],
    });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: list });
  } catch (e) {
    logger.error('Admin students list error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const studentValidators = [
  body('studentNo').trim().notEmpty().withMessage('学号不能为空'),
  body('name').trim().notEmpty().withMessage('姓名不能为空'),
  body('password').trim().notEmpty().withMessage('密码不能为空'),
];

router.post('/students', studentValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { studentNo, name, password } = req.body;
  try {
    const row = await Student.create({
      studentNo: studentNo.trim(),
      name: name.trim(),
      passwordHash: hashPassword(password),
    });
    return res
      .status(201)
      .set('Content-Type', 'application/json; charset=utf-8')
      .json({ ok: true, data: { id: row.id, studentNo: row.studentNo, name: row.name } });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '学号已存在' });
    logger.error('Create student error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const studentUpdateValidators = [
  body('studentNo').trim().notEmpty().withMessage('学号不能为空'),
  body('name').trim().notEmpty().withMessage('姓名不能为空'),
  body('password').optional().trim(),
];

router.put('/students/:id', param('id').isInt({ min: 1 }), studentUpdateValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { studentNo, name, password } = req.body;
  try {
    const row = await Student.findByPk(id);
    if (!row) return res.status(404).json({ ok: false, message: '学生不存在' });
    const updates = { studentNo: studentNo.trim(), name: name.trim() };
    if (password && String(password).trim()) {
      updates.passwordHash = hashPassword(password);
    }
    await Student.update(updates, { where: { id } });
    const updated = await Student.findByPk(id, { attributes: ['id', 'studentNo', 'name'] });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '学号已存在' });
    logger.error('Update student error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/students/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await Enrollment.destroy({ where: { studentId: id } });
    const n = await Student.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '学生不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete student error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/courses', async (req, res) => {
  const { sequelize } = require('../models');
  try {
    const list = await Course.findAll({ order: [['id']], attributes: ['id', 'code', 'name', 'credit', 'capacity'] });
    const enrollCounts = await Enrollment.findAll({
      attributes: ['courseId', [sequelize.fn('COUNT', sequelize.col('id')), 'enrolled']],
      group: ['courseId'],
      raw: true,
    });
    const countMap = Object.fromEntries(
      enrollCounts.map((r) => [r.courseId, Number(r.enrolled) || 0])
    );
    const data = list.map((c) => ({ ...c.toJSON(), enrolled: countMap[c.id] ?? 0 }));
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Admin courses list error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const courseValidators = [
  body('code').trim().notEmpty().withMessage('课程代码不能为空'),
  body('name').trim().notEmpty().withMessage('课程名称不能为空'),
  body('credit').isInt({ min: 0 }).withMessage('学分必须为非负整数'),
  body('capacity').isInt({ min: 0 }).withMessage('容量必须为非负整数'),
];

router.post('/courses', courseValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { code, name, credit, capacity } = req.body;
  try {
    const row = await Course.create({ code: code.trim(), name: name.trim(), credit: Number(credit), capacity: Number(capacity) });
    return res.status(201).set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: row.toJSON() });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '课程代码已存在' });
    logger.error('Create course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/courses/:id', param('id').isInt({ min: 1 }), courseValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { code, name, credit, capacity } = req.body;
  const cap = Number(capacity);
  try {
    const enrolled = await Enrollment.count({ where: { courseId: id } });
    if (enrolled > cap) return res.status(400).json({ ok: false, message: '容量不能小于已选人数' });
    const [n] = await Course.update(
      { code: code.trim(), name: name.trim(), credit: Number(credit), capacity: cap },
      { where: { id } }
    );
    if (n === 0) return res.status(404).json({ ok: false, message: '课程不存在' });
    const row = await Course.findByPk(id);
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: row.toJSON() });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '课程代码已存在' });
    logger.error('Update course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/courses/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await Enrollment.destroy({ where: { courseId: id } });
    const n = await Course.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '课程不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
