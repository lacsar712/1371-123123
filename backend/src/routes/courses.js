const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { Course, Enrollment, sequelize } = require('../models');
const logger = require('../logger');

router.get('/', async (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  try {
    const where = keyword
      ? { [Op.or]: [
          { name: { [Op.like]: `%${keyword}%` } },
          { code: { [Op.like]: `%${keyword}%` } },
        ] }
      : {};
    const list = await Course.findAll({
      where,
      order: [['id']],
      attributes: ['id', 'code', 'name', 'credit', 'capacity'],
    });
    const enrollCounts = await Enrollment.findAll({
      attributes: ['courseId', [sequelize.fn('COUNT', sequelize.col('id')), 'enrolled']],
      group: ['courseId'],
      raw: true,
    });
    const countMap = Object.fromEntries(enrollCounts.map((r) => [r.courseId, Number(r.enrolled) || 0]));
    const data = list.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      credit: c.credit,
      capacity: c.capacity,
      enrolled: countMap[c.id] ?? 0,
    }));
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Courses list error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ ok: false, message: '无效的课程 ID' });
  try {
    const course = await Course.findByPk(id, { attributes: ['id', 'code', 'name', 'credit', 'capacity'] });
    if (!course) return res.status(404).json({ ok: false, message: '课程不存在' });
    const enrolled = await Enrollment.count({ where: { courseId: id } });
    const data = { ...course.toJSON(), enrolled };
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Course detail error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
