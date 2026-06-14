const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const {
  Badge,
  StudentBadge,
  PointRecord,
  CourseEvaluation,
  Course,
  Enrollment,
  Student,
  sequelize,
} = require('../models');
const {
  getStudentBadges,
  getTotalPoints,
  getLeaderboard,
  triggerEvent,
} = require('../badgeRules');
const logger = require('../logger');

router.get(
  '/:studentId/badges',
  param('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const studentId = parseInt(req.params.studentId, 10);
    try {
      const badges = await getStudentBadges(studentId);
      const totalPoints = await getTotalPoints(studentId);
      return res
        .set('Content-Type', 'application/json; charset=utf-8')
        .json({ ok: true, data: { badges, totalPoints } });
    } catch (e) {
      logger.error('Get student badges error', { error: e.message });
      return res.status(500).json({ ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/:studentId/points',
  param('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const studentId = parseInt(req.params.studentId, 10);
    try {
      const totalPoints = await getTotalPoints(studentId);
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
      const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
      const records = await PointRecord.findAll({
        where: { studentId },
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });
      return res
        .set('Content-Type', 'application/json; charset=utf-8')
        .json({ ok: true, data: { totalPoints, records } });
    } catch (e) {
      logger.error('Get student points error', { error: e.message });
      return res.status(500).json({ ok: false, message: '服务器错误' });
    }
  }
);

router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 100);
    const data = await getLeaderboard(limit);
    return res
      .set('Content-Type', 'application/json; charset=utf-8')
      .json({ ok: true, data });
  } catch (e) {
    logger.error('Get leaderboard error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get(
  '/:studentId/evaluations',
  param('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const studentId = parseInt(req.params.studentId, 10);
    try {
      const evaluations = await CourseEvaluation.findAll({
        where: { studentId },
        include: [{ model: Course, as: 'Course', attributes: ['id', 'code', 'name'] }],
        order: [['createdAt', 'DESC']],
      });
      const data = evaluations.map((e) => ({
        id: e.id,
        courseId: e.courseId,
        courseCode: e.Course?.code,
        courseName: e.Course?.name,
        rating: e.rating,
        comment: e.comment,
        createdAt: e.createdAt,
      }));
      return res
        .set('Content-Type', 'application/json; charset=utf-8')
        .json({ ok: true, data });
    } catch (e) {
      logger.error('Get evaluations error', { error: e.message });
      return res.status(500).json({ ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/:studentId/courses-to-evaluate',
  param('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const studentId = parseInt(req.params.studentId, 10);
    try {
      const enrollments = await Enrollment.findAll({
        where: { studentId },
        include: [{ model: Course, as: 'Course', attributes: ['id', 'code', 'name'] }],
      });
      const evaluated = await CourseEvaluation.findAll({
        where: { studentId },
        attributes: ['courseId'],
        raw: true,
      });
      const evaluatedIds = new Set(evaluated.map((e) => e.courseId));

      const data = enrollments
        .filter((e) => e.Course)
        .map((e) => ({
          id: e.Course.id,
          code: e.Course.code,
          name: e.Course.name,
          evaluated: evaluatedIds.has(e.Course.id),
        }));
      return res
        .set('Content-Type', 'application/json; charset=utf-8')
        .json({ ok: true, data });
    } catch (e) {
      logger.error('Get courses to evaluate error', { error: e.message });
      return res.status(500).json({ ok: false, message: '服务器错误' });
    }
  }
);

const evaluateValidators = [
  param('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  body('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('评分需在 1-5 之间'),
  body('comment').optional().isLength({ max: 500 }).withMessage('评论不超过 500 字'),
];

router.post('/:studentId/evaluate', evaluateValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ ok: false, message: errors.array()[0].msg });

  const studentId = parseInt(req.params.studentId, 10);
  const courseId = parseInt(req.body.courseId, 10);
  const rating = parseInt(req.body.rating, 10);
  const comment = (req.body.comment || '').trim();

  try {
    const enrollment = await Enrollment.findOne({ where: { studentId, courseId } });
    if (!enrollment)
      return res.status(400).json({ ok: false, message: '您未选修该课程' });

    const existing = await CourseEvaluation.findOne({ where: { studentId, courseId } });
    if (existing)
      return res.status(400).json({ ok: false, message: '您已评价过该课程' });

    const course = await Course.findByPk(courseId, { attributes: ['name'] });

    await CourseEvaluation.create({
      studentId,
      courseId,
      rating,
      comment,
    });

    triggerEvent('evaluate', studentId, { courseName: course?.name });

    return res
      .set('Content-Type', 'application/json; charset=utf-8')
      .json({ ok: true, message: '评教成功' });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError')
      return res.status(400).json({ ok: false, message: '您已评价过该课程' });
    logger.error('Evaluate error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
