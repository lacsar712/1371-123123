const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const {
  Course,
  Student,
  Enrollment,
  AttendanceSession,
  AttendanceRecord,
  sequelize,
} = require('../models');
const { triggerEvent } = require('../badgeRules');
const logger = require('../logger');

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post(
  '/start',
  body('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  body('duration').optional().isInt({ min: 60, max: 3600 }).withMessage('时长需在 60-3600 秒之间'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const courseId = parseInt(req.body.courseId, 10);
    const duration = parseInt(req.body.duration || 300, 10);

    try {
      const course = await Course.findByPk(courseId);
      if (!course) return res.status(404).json({ ok: false, message: '课程不存在' });

      const existing = await AttendanceSession.findOne({
        where: { courseId, status: 1, endTime: { [Op.gt]: new Date() } },
      });
      if (existing)
        return res.status(400).json({ ok: false, message: '该课程已有进行中的签到' });

      let code;
      let exists = true;
      let attempts = 0;
      while (exists && attempts < 10) {
        code = generateCode();
        exists = await AttendanceSession.findOne({
          where: { code, status: 1, endTime: { [Op.gt]: new Date() } },
        });
        attempts++;
      }
      if (exists) return res.status(500).json({ ok: false, message: '生成签到码失败，请重试' });

      const now = new Date();
      const endTime = new Date(now.getTime() + duration * 1000);

      const session = await AttendanceSession.create({
        courseId,
        code,
        startTime: now,
        endTime,
        duration,
        status: 1,
      });

      return res
        .set('Content-Type', 'application/json; charset=utf-8')
        .json({
          ok: true,
          data: {
            id: session.id,
            code: session.code,
            startTime: session.startTime,
            endTime: session.endTime,
            duration: session.duration,
          },
        });
    } catch (e) {
      logger.error('Start attendance error', { error: e.message });
      return res.status(500).json({ ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/active/:courseId',
  param('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const courseId = parseInt(req.params.courseId, 10);

    try {
      const session = await AttendanceSession.findOne({
        where: { courseId, status: 1, endTime: { [Op.gt]: new Date() } },
        include: [{ model: Course, as: 'Course', attributes: ['id', 'name', 'code'] }],
        order: [['startTime', 'DESC']],
      });

      if (!session)
        return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: null });

      const records = await AttendanceRecord.findAll({
        where: { sessionId: session.id },
        include: [{ model: Student, as: 'Student', attributes: ['id', 'studentNo', 'name'] }],
        order: [['signInTime', 'ASC']],
      });

      const enrolled = await Enrollment.count({ where: { courseId } });

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
        totalCount: enrolled,
        records: records.map((r) => ({
          id: r.id,
          studentId: r.studentId,
          studentNo: r.Student?.studentNo,
          studentName: r.Student?.name,
          signInTime: r.signInTime,
        })),
      };

      return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
    } catch (e) {
      logger.error('Get active attendance error', { error: e.message });
      return res.status(500).json({ ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/session/:sessionId',
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
      });

      const signedIds = new Set(records.map((r) => r.studentId));
      const absent = enrolled
        .filter((e) => !signedIds.has(e.studentId))
        .map((e) => ({
          studentId: e.studentId,
          studentNo: e.Student?.studentNo,
          studentName: e.Student?.name,
        }));

      const data = {
        id: session.id,
        code: session.code,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        status: session.status,
        course: session.Course
          ? {
              id: session.Course.id,
              name: session.Course.name,
              code: session.Course.code,
            }
          : null,
        signed: records.map((r) => ({
          id: r.id,
          studentId: r.studentId,
          studentNo: r.Student?.studentNo,
          studentName: r.Student?.name,
          signInTime: r.signInTime,
        })),
        absent,
      };

      return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
    } catch (e) {
      logger.error('Get session detail error', { error: e.message });
      return res.status(500).json({ ok: false, message: '服务器错误' });
    }
  }
);

router.post(
  '/signin',
  body('code').isLength({ min: 6, max: 6 }).withMessage('请输入 6 位签到码'),
  body('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const code = req.body.code.trim();
    const studentId = parseInt(req.body.studentId, 10);

    try {
      const session = await AttendanceSession.findOne({
        where: { code, status: 1 },
        include: [{ model: Course, as: 'Course', attributes: ['id', 'name'] }],
      });

      if (!session)
        return res.status(404).json({ ok: false, message: '签到码无效' });

      const now = new Date();
      if (now > new Date(session.endTime))
        return res.status(400).json({ ok: false, message: '签到已结束' });

      const enrollment = await Enrollment.findOne({
        where: { studentId, courseId: session.courseId },
      });

      if (!enrollment)
        return res.status(400).json({ ok: false, message: '您未选修该课程' });

      const existing = await AttendanceRecord.findOne({
        where: { sessionId: session.id, studentId },
      });

      if (existing)
        return res.status(400).json({ ok: false, message: '您已签到过' });

      await AttendanceRecord.create({
        sessionId: session.id,
        studentId,
        signInTime: now,
      });

      triggerEvent('signin', studentId, { courseName: session.Course?.name });

      return res
        .set('Content-Type', 'application/json; charset=utf-8')
        .json({
          ok: true,
          message: '签到成功',
          data: {
            courseName: session.Course?.name,
            signInTime: now,
          },
        });
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError')
        return res.status(400).json({ ok: false, message: '您已签到过' });
      logger.error('Sign in error', { error: e.message });
      return res.status(500).json({ ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/student/:studentId/records',
  param('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const studentId = parseInt(req.params.studentId, 10);

    try {
      const records = await AttendanceRecord.findAll({
        where: { studentId },
        include: [
          {
            model: AttendanceSession,
            as: 'AttendanceSession',
            include: [{ model: Course, as: 'Course', attributes: ['id', 'name', 'code'] }],
          },
        ],
        order: [['signInTime', 'DESC']],
      });

      const data = records.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        courseName: r.AttendanceSession?.Course?.name,
        courseCode: r.AttendanceSession?.Course?.code,
        signInTime: r.signInTime,
        sessionStartTime: r.AttendanceSession?.startTime,
      }));

      return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
    } catch (e) {
      logger.error('Get student records error', { error: e.message });
      return res.status(500).json({ ok: false, message: '服务器错误' });
    }
  }
);

module.exports = router;
