const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const { Course, Enrollment, Student, AttendanceSession, AttendanceRecord, LotteryEntry, sequelize } = require('../models');
const { hashPassword } = require('../db');
const { triggerEvent } = require('../badgeRules');
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
    const list = await Course.findAll({ order: [['id']], attributes: ['id', 'code', 'name', 'credit', 'capacity', 'lotteryMode'] });
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
  body('lotteryMode').optional().isBoolean().withMessage('抽签模式必须为布尔值'),
];

router.post('/courses', courseValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { code, name, credit, capacity, lotteryMode } = req.body;
  try {
    const row = await Course.create({ code: code.trim(), name: name.trim(), credit: Number(credit), capacity: Number(capacity), lotteryMode: !!lotteryMode });
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
  const { code, name, credit, capacity, lotteryMode } = req.body;
  const cap = Number(capacity);
  try {
    const enrolled = await Enrollment.count({ where: { courseId: id } });
    if (enrolled > cap) return res.status(400).json({ ok: false, message: '容量不能小于已选人数' });
    const [n] = await Course.update(
      { code: code.trim(), name: name.trim(), credit: Number(credit), capacity: cap, lotteryMode: !!lotteryMode },
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
    await LotteryEntry.destroy({ where: { courseId: id } });
    await Enrollment.destroy({ where: { courseId: id } });
    const n = await Course.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '课程不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// ========== 考勤管理 ==========
router.get('/attendance', async (req, res) => {
  const courseId = req.query.courseId ? parseInt(req.query.courseId, 10) : null;
  try {
    const where = courseId ? { courseId } : {};
    const sessions = await AttendanceSession.findAll({
      where,
      include: [{ model: Course, as: 'Course', attributes: ['id', 'name', 'code'] }],
      order: [['startTime', 'DESC']],
    });

    const sessionIds = sessions.map((s) => s.id);
    const recordCounts = await AttendanceRecord.findAll({
      where: { sessionId: { [Op.in]: sessionIds } },
      attributes: ['sessionId', [AttendanceRecord.sequelize.fn('COUNT', AttendanceRecord.sequelize.col('id')), 'count']],
      group: ['sessionId'],
      raw: true,
    });
    const countMap = Object.fromEntries(
      recordCounts.map((r) => [r.sessionId, Number(r.count) || 0])
    );

    const enrollments = await Enrollment.findAll({
      where: courseId ? { courseId } : {},
      attributes: ['courseId', [Enrollment.sequelize.fn('COUNT', Enrollment.sequelize.col('id')), 'count']],
      group: ['courseId'],
      raw: true,
    });
    const enrollMap = Object.fromEntries(
      enrollments.map((e) => [e.courseId, Number(e.count) || 0])
    );

    const data = sessions.map((s) => {
      const now = new Date();
      const isActive = s.status === 1 && now < new Date(s.endTime);
      return {
        id: s.id,
        code: s.code,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: s.duration,
        status: isActive ? 'active' : 'ended',
        course: s.Course
          ? {
              id: s.Course.id,
              name: s.Course.name,
              code: s.Course.code,
            }
          : null,
        signedCount: countMap[s.id] || 0,
        totalCount: enrollMap[s.courseId] || 0,
      };
    });

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Admin attendance list error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get(
  '/attendance/:sessionId',
  param('sessionId').isInt({ min: 1 }).withMessage('无效的签到 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const sessionId = parseInt(req.params.sessionId, 10);

    try {
      const session = await AttendanceSession.findByPk(sessionId, {
        include: [{ model: Course, as: 'Course', attributes: ['id', 'name', 'code'] }],
      });

      if (!session)
        return res.status(404).json({ ok: false, message: '签到不存在' });

      const records = await AttendanceRecord.findAll({
        where: { sessionId },
        include: [{ model: Student, as: 'Student', attributes: ['id', 'studentNo', 'name'] }],
        order: [['signInTime', 'ASC']],
      });

      const enrolled = await Enrollment.findAll({
        where: { courseId: session.courseId },
        include: [{ model: Student, as: 'Student', attributes: ['id', 'studentNo', 'name'] }],
        order: [[Student, 'studentNo', 'ASC']],
      });

      const signedIds = new Set(records.map((r) => r.studentId));
      const signedMap = new Map(records.map((r) => [r.studentId, r]));

      const allStudents = enrolled.map((e) => {
        const record = signedMap.get(e.studentId);
        return {
          studentId: e.studentId,
          studentNo: e.Student?.studentNo,
          studentName: e.Student?.name,
          status: record ? 'signed' : 'absent',
          signInTime: record?.signInTime || null,
        };
      });

      const data = {
        id: session.id,
        code: session.code,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        course: session.Course
          ? {
              id: session.Course.id,
              name: session.Course.name,
              code: session.Course.code,
            }
          : null,
        signedCount: records.length,
        absentCount: enrolled.length - records.length,
        totalCount: enrolled.length,
        students: allStudents,
      };

      return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
    } catch (e) {
      logger.error('Admin attendance detail error', { error: e.message });
      return res.status(500).json({ ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/attendance/:sessionId/export',
  param('sessionId').isInt({ min: 1 }).withMessage('无效的签到 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const sessionId = parseInt(req.params.sessionId, 10);

    try {
      const session = await AttendanceSession.findByPk(sessionId, {
        include: [{ model: Course, as: 'Course', attributes: ['id', 'name', 'code'] }],
      });

      if (!session)
        return res.status(404).json({ ok: false, message: '签到不存在' });

      const records = await AttendanceRecord.findAll({
        where: { sessionId },
        include: [{ model: Student, as: 'Student', attributes: ['id', 'studentNo', 'name'] }],
      });

      const enrolled = await Enrollment.findAll({
        where: { courseId: session.courseId },
        include: [{ model: Student, as: 'Student', attributes: ['id', 'studentNo', 'name'] }],
        order: [[Student, 'studentNo', 'ASC']],
      });

      const signedIds = new Set(records.map((r) => r.studentId));
      const absent = enrolled
        .filter((e) => !signedIds.has(e.studentId))
        .map((e) => ({
          studentNo: e.Student?.studentNo || '',
          studentName: e.Student?.name || '',
        }));

      const dateStr = new Date(session.startTime)
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 16);
      const filename = `缺勤名单_${session.Course?.code || ''}_${dateStr}.csv`;

      const csvContent =
        '\uFEFF' +
        '学号,姓名\n' +
        absent.map((s) => `${s.studentNo},${s.studentName}`).join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (e) {
      logger.error('Export attendance error', { error: e.message });
      return res.status(500).json({ ok: false, message: '导出失败' });
    }
  }
);

// ========== 抽签中心 ==========
router.get('/lottery/courses', async (req, res) => {
  try {
    const list = await Course.findAll({
      where: { lotteryMode: true },
      order: [['id']],
      attributes: ['id', 'code', 'name', 'credit', 'capacity', 'lotteryMode'],
    });
    const entryCounts = await LotteryEntry.findAll({
      attributes: ['courseId', [sequelize.fn('COUNT', sequelize.col('id')), 'entries']],
      group: ['courseId'],
      raw: true,
    });
    const countMap = Object.fromEntries(entryCounts.map((r) => [r.courseId, Number(r.entries) || 0]));
    const statusCounts = await LotteryEntry.findAll({
      attributes: ['courseId', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
      group: ['courseId', 'status'],
      raw: true,
    });
    const statusMap = {};
    statusCounts.forEach((r) => {
      if (!statusMap[r.courseId]) statusMap[r.courseId] = {};
      statusMap[r.courseId][r.status] = Number(r.cnt) || 0;
    });
    const data = list.map((c) => ({
      ...c.toJSON(),
      entries: countMap[c.id] ?? 0,
      statusCounts: statusMap[c.id] || {},
    }));
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Lottery courses list error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.post('/lottery/execute/:courseId', param('courseId').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const courseId = parseInt(req.params.courseId, 10);
  try {
    const course = await Course.findByPk(courseId);
    if (!course) return res.status(404).json({ ok: false, message: '课程不存在' });
    if (!course.lotteryMode) return res.status(400).json({ ok: false, message: '该课程未开启抽签模式' });
    const waitingEntries = await LotteryEntry.findAll({
      where: { courseId, status: 'waiting' },
      order: [['id', 'ASC']],
    });
    if (!waitingEntries.length) return res.status(400).json({ ok: false, message: '没有等待抽签的学生' });
    const alreadyEnrolled = await Enrollment.count({ where: { courseId } });
    const remaining = Math.max(0, course.capacity - alreadyEnrolled);
    const shuffled = [...waitingEntries].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, remaining);
    const losers = shuffled.slice(remaining);
    const t = await sequelize.transaction();
    try {
      if (winners.length) {
        await LotteryEntry.update(
          { status: 'won' },
          { where: { id: winners.map((w) => w.id) }, transaction: t }
        );
        await Enrollment.bulkCreate(
          winners.map((w) => ({ studentId: w.studentId, courseId })),
          { transaction: t, ignoreDuplicates: true }
        );
      }
      if (losers.length) {
        await LotteryEntry.update(
          { status: 'lost' },
          { where: { id: losers.map((l) => l.id) }, transaction: t }
        );
      }
      await t.commit();
      for (const w of winners) {
        triggerEvent('lottery_won', w.studentId, { courseName: course.name });
        triggerEvent('enroll', w.studentId, { courseName: course.name });
      }
    } catch (e) {
      await t.rollback();
      throw e;
    }
    return res.set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      message: `抽签完成：${winners.length} 人中签，${losers.length} 人未中签`,
      data: { won: winners.length, lost: losers.length },
    });
  } catch (e) {
    logger.error('Lottery execute error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
