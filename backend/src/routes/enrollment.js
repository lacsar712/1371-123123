const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const { Course, Enrollment, LotteryEntry, sequelize } = require('../models');
const logger = require('../logger');

router.get('/:id/courses', param('id').isInt({ min: 1 }).withMessage('无效的学生 ID'), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const studentId = parseInt(req.params.id, 10);
  try {
    const rows = await Enrollment.findAll({
      where: { studentId },
      include: [{ model: Course, as: 'Course', attributes: ['id', 'code', 'name', 'credit', 'capacity'] }],
      order: [['enrolledAt', 'ASC']],
    });
    const data = rows.map((r) => ({
      ...r.Course.toJSON(),
      enrolled_at: r.enrolledAt,
    }));
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Student courses error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const enrollValidators = [
  param('id').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  body('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
];

router.post('/:id/enroll', enrollValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const studentId = parseInt(req.params.id, 10);
  const courseId = parseInt(req.body.courseId, 10);
  try {
    const course = await Course.findByPk(courseId, { attributes: ['id', 'capacity', 'lotteryMode'] });
    if (!course) return res.status(404).json({ ok: false, message: '课程不存在' });

    if (course.lotteryMode) {
      const exists = await LotteryEntry.findOne({ where: { studentId, courseId } });
      if (exists) return res.status(400).json({ ok: false, message: '已加入该课程抽签' });
      const alreadyEnrolled = await Enrollment.findOne({ where: { studentId, courseId } });
      if (alreadyEnrolled) return res.status(400).json({ ok: false, message: '已选过该课程' });
      await LotteryEntry.create({ studentId, courseId, status: 'waiting' });
      return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已加入抽签' });
    }

    const enrolled = await Enrollment.count({ where: { courseId } });
    if (enrolled >= course.capacity) return res.status(400).json({ ok: false, message: '课程已满' });
    const exists = await Enrollment.findOne({ where: { studentId, courseId } });
    if (exists) return res.status(400).json({ ok: false, message: '已选过该课程' });
    await Enrollment.create({ studentId, courseId });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '选课成功' });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '已选过该课程' });
    logger.error('Enroll error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/:id/lottery', param('id').isInt({ min: 1 }).withMessage('无效的学生 ID'), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const studentId = parseInt(req.params.id, 10);
  try {
    const entries = await LotteryEntry.findAll({
      where: { studentId },
      include: [{ model: Course, as: 'Course', attributes: ['id', 'code', 'name', 'credit', 'capacity'] }],
      order: [['id', 'ASC']],
    });
    const data = entries.map((e) => ({
      id: e.id,
      courseId: e.courseId,
      status: e.status,
      course: e.Course ? e.Course.toJSON() : null,
    }));
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Student lottery error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/:id/enroll/:courseId', param('id').isInt({ min: 1 }), param('courseId').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const studentId = parseInt(req.params.id, 10);
  const courseId = parseInt(req.params.courseId, 10);
  try {
    const lotteryDestroyed = await LotteryEntry.destroy({ where: { studentId, courseId } });
    const enrollDestroyed = await Enrollment.destroy({ where: { studentId, courseId } });
    if (lotteryDestroyed === 0 && enrollDestroyed === 0) return res.status(404).json({ ok: false, message: '未找到选课记录' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '退课成功' });
  } catch (e) {
    logger.error('Drop course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
