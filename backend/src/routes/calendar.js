const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const { CalendarEvent, Course, Enrollment, Student, Teacher } = require('../models');
const logger = require('../logger');

const SEMESTER_START = new Date('2026-02-23T00:00:00');

function parseDate(d) {
  if (!d) return null;
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t;
}

function getMondayOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d, n) {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
}

function parseTimeStr(s) {
  const parts = s.split(':');
  return { h: parseInt(parts[0], 10) || 0, m: parseInt(parts[1], 10) || 0 };
}

function generateCourseScheduleEvents(courses, rangeStart, rangeEnd) {
  const events = [];
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'];

  courses.forEach((course, courseIdx) => {
    let schedules = [];
    try {
      schedules = course.schedules ? JSON.parse(course.schedules) : [];
    } catch (_) {
      schedules = [];
    }
    if (!Array.isArray(schedules)) schedules = [];

    schedules.forEach((sched, schedIdx) => {
      const dayOfWeek = parseInt(sched.dayOfWeek, 10);
      if (!(dayOfWeek >= 1 && dayOfWeek <= 7)) return;
      const { h: sh, m: sm } = parseTimeStr(sched.startTime || '08:00');
      const { h: eh, m: em } = parseTimeStr(sched.endTime || '09:40');
      const startWeek = parseInt(sched.startWeek, 10) || 1;
      const endWeek = parseInt(sched.endWeek, 10) || 20;

      const weekStartMonday = getMondayOfWeek(SEMESTER_START);
      const iterDate = getMondayOfWeek(rangeStart);
      const stopDate = new Date(rangeEnd);
      stopDate.setDate(stopDate.getDate() + 7);

      while (iterDate <= stopDate) {
        const weekDiff = Math.round((iterDate - weekStartMonday) / (7 * 24 * 60 * 60 * 1000));
        const weekNo = weekDiff + 1;
        if (weekNo >= startWeek && weekNo <= endWeek) {
          const dayOffset = dayOfWeek - 1;
          const eventDate = addDays(iterDate, dayOffset);
          if (eventDate >= rangeStart && eventDate <= addDays(rangeEnd, 1)) {
            const start = new Date(eventDate);
            start.setHours(sh, sm, 0, 0);
            const end = new Date(eventDate);
            end.setHours(eh, em, 0, 0);
            const color = colors[(courseIdx + schedIdx) % colors.length];
            events.push({
              id: `course_${course.id}_${schedIdx}_${start.getTime()}`,
              sourceId: course.id,
              title: course.name,
              category: 'course',
              startTime: start.toISOString(),
              endTime: end.toISOString(),
              color: color,
              location: sched.location || '',
              editable: false,
              courseCode: course.code,
            });
          }
        }
        iterDate.setDate(iterDate.getDate() + 7);
      }
    });

    if (course.examTime) {
      const examStart = new Date(course.examTime);
      const examEnd = new Date(examStart.getTime() + (parseInt(course.examDuration, 10) || 120) * 60 * 1000);
      if (examStart <= addDays(rangeEnd, 1) && examEnd >= rangeStart) {
        events.push({
          id: `exam_${course.id}`,
          sourceId: course.id,
          title: `${course.name} - 期末考试`,
          category: 'exam',
          startTime: examStart.toISOString(),
          endTime: examEnd.toISOString(),
          color: '#ef4444',
          editable: false,
          courseCode: course.code,
        });
      }
    }
  });

  return events;
}

const listValidators = [
  query('userId').isInt({ min: 1 }).withMessage('无效的用户 ID'),
  query('userRole').isIn(['student', 'teacher', 'admin']).withMessage('无效的用户角色'),
  query('start').notEmpty().withMessage('缺少开始时间'),
  query('end').notEmpty().withMessage('缺少结束时间'),
];

router.get('/events', listValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  }
  const userId = parseInt(req.query.userId, 10);
  const userRole = req.query.userRole;
  const rangeStart = parseDate(req.query.start);
  const rangeEnd = parseDate(req.query.end);
  if (!rangeStart || !rangeEnd) {
    return res.status(400).json({ ok: false, message: '无效的时间格式' });
  }

  try {
    let enrolledCourses = [];
    if (userRole === 'student') {
      const enrollments = await Enrollment.findAll({
        where: { studentId: userId },
        include: [{ model: Course, as: 'Course', attributes: ['id', 'code', 'name', 'schedules', 'examTime', 'examDuration'] }],
      });
      enrolledCourses = enrollments.map((e) => e.Course).filter(Boolean);
    }

    const customWhere = {
      userId,
      userRole,
      startTime: { [Op.lt]: new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000) },
      endTime: { [Op.gte]: rangeStart },
    };
    const customRows = await CalendarEvent.findAll({ where: customWhere, order: [['startTime', 'ASC']] });
    const customEvents = customRows.map((r) => ({
      id: `custom_${r.id}`,
      sourceId: r.id,
      title: r.title,
      category: 'custom',
      startTime: r.startTime.toISOString(),
      endTime: r.endTime.toISOString(),
      color: r.color || '#6366f1',
      editable: true,
    }));

    const holidayEvents = generateHolidays(rangeStart, rangeEnd);

    const scheduleEvents = generateCourseScheduleEvents(enrolledCourses, rangeStart, rangeEnd);

    const all = [...scheduleEvents, ...customEvents, ...holidayEvents];
    all.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: all });
  } catch (e) {
    logger.error('Calendar events error', { error: e.message, stack: e.stack });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

function generateHolidays(rangeStart, rangeEnd) {
  const holidays = [
    { name: '清明节', start: '2026-04-04T00:00:00', end: '2026-04-06T23:59:59' },
    { name: '劳动节', start: '2026-05-01T00:00:00', end: '2026-05-05T23:59:59' },
    { name: '端午节', start: '2026-06-19T00:00:00', end: '2026-06-21T23:59:59' },
    { name: '中秋节', start: '2026-09-25T00:00:00', end: '2026-09-27T23:59:59' },
    { name: '国庆节', start: '2026-10-01T00:00:00', end: '2026-10-07T23:59:59' },
    { name: '元旦', start: '2027-01-01T00:00:00', end: '2027-01-03T23:59:59' },
  ];
  const events = [];
  holidays.forEach((h, idx) => {
    const s = new Date(h.start);
    const e = new Date(h.end);
    if (e >= rangeStart && s <= addDays(rangeEnd, 1)) {
      events.push({
        id: `holiday_${idx}`,
        sourceId: idx,
        title: h.name,
        category: 'holiday',
        startTime: s.toISOString(),
        endTime: e.toISOString(),
        color: '#10b981',
        editable: false,
      });
    }
  });
  return events;
}

const createValidators = [
  body('userId').isInt({ min: 1 }).withMessage('无效的用户 ID'),
  body('userRole').isIn(['student', 'teacher']).withMessage('无效的用户角色'),
  body('title').trim().notEmpty().withMessage('标题不能为空'),
  body('startTime').notEmpty().withMessage('缺少开始时间'),
  body('endTime').notEmpty().withMessage('缺少结束时间'),
];

router.post('/events', createValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  }
  const { userId, userRole, title, color } = req.body;
  const startTime = parseDate(req.body.startTime);
  const endTime = parseDate(req.body.endTime);
  if (!startTime || !endTime) {
    return res.status(400).json({ ok: false, message: '无效的时间格式' });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ ok: false, message: '结束时间必须晚于开始时间' });
  }
  try {
    if (userRole === 'student') {
      const exists = await Student.findByPk(userId);
      if (!exists) return res.status(404).json({ ok: false, message: '用户不存在' });
    } else {
      const exists = await Teacher.findByPk(userId);
      if (!exists) return res.status(404).json({ ok: false, message: '用户不存在' });
    }
    const event = await CalendarEvent.create({
      userId,
      userRole,
      title: title.trim(),
      startTime,
      endTime,
      color: (color || '').trim() || '#6366f1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      data: {
        id: event.id,
        title: event.title,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        color: event.color,
      },
    });
  } catch (e) {
    logger.error('Create calendar event error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const updateValidators = [
  param('id').isInt({ min: 1 }).withMessage('无效的事件 ID'),
  body('userId').isInt({ min: 1 }).withMessage('无效的用户 ID'),
  body('userRole').isIn(['student', 'teacher']).withMessage('无效的用户角色'),
];

router.put('/events/:id', updateValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const { userId, userRole, title, color } = req.body;
  const startTime = req.body.startTime ? parseDate(req.body.startTime) : null;
  const endTime = req.body.endTime ? parseDate(req.body.endTime) : null;
  if (req.body.startTime && !startTime) return res.status(400).json({ ok: false, message: '无效的开始时间' });
  if (req.body.endTime && !endTime) return res.status(400).json({ ok: false, message: '无效的结束时间' });
  try {
    const event = await CalendarEvent.findByPk(id);
    if (!event) return res.status(404).json({ ok: false, message: '事件不存在' });
    if (event.userId !== userId || event.userRole !== userRole) {
      return res.status(403).json({ ok: false, message: '无权编辑此事件' });
    }
    const updateData = {};
    if (title !== undefined && title.trim() !== '') updateData.title = title.trim();
    if (startTime) updateData.startTime = startTime;
    if (endTime) updateData.endTime = endTime;
    if (color !== undefined && color.trim() !== '') updateData.color = color.trim();
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ ok: false, message: '没有可更新的字段' });
    }
    if (updateData.startTime && updateData.endTime && updateData.startTime >= updateData.endTime) {
      return res.status(400).json({ ok: false, message: '结束时间必须晚于开始时间' });
    }
    if (!updateData.startTime && updateData.endTime && updateData.endTime <= event.startTime) {
      return res.status(400).json({ ok: false, message: '结束时间必须晚于开始时间' });
    }
    if (updateData.startTime && !updateData.endTime && updateData.startTime >= event.endTime) {
      return res.status(400).json({ ok: false, message: '结束时间必须晚于开始时间' });
    }
    updateData.updatedAt = new Date();
    await event.update(updateData);
    return res.set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      data: {
        id: event.id,
        title: event.title,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        color: event.color,
      },
    });
  } catch (e) {
    logger.error('Update calendar event error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const deleteValidators = [
  param('id').isInt({ min: 1 }).withMessage('无效的事件 ID'),
  body('userId').isInt({ min: 1 }).withMessage('无效的用户 ID'),
  body('userRole').isIn(['student', 'teacher']).withMessage('无效的用户角色'),
];

router.delete('/events/:id', deleteValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const { userId, userRole } = req.body;
  try {
    const event = await CalendarEvent.findByPk(id);
    if (!event) return res.status(404).json({ ok: false, message: '事件不存在' });
    if (event.userId !== userId || event.userRole !== userRole) {
      return res.status(403).json({ ok: false, message: '无权删除此事件' });
    }
    await event.destroy();
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '删除成功' });
  } catch (e) {
    logger.error('Delete calendar event error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
