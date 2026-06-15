const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const { TrainingProgram, TrainingProgramCourse, Course, Student, Enrollment, sequelize } = require('../models');
const logger = require('../logger');

const CATEGORY_MAP = {
  required: '必修',
  limited_elective: '限选',
  elective: '任选',
};

router.get('/', async (req, res) => {
  try {
    const { major, enrollmentYear } = req.query;
    const where = {};
    if (major) where.major = major;
    if (enrollmentYear) where.enrollmentYear = parseInt(enrollmentYear, 10);

    const list = await TrainingProgram.findAll({
      where,
      order: [['enrollmentYear', 'DESC'], ['major', 'ASC']],
    });

    const data = list.map((p) => ({
      id: p.id,
      major: p.major,
      enrollmentYear: p.enrollmentYear,
      name: p.name,
      totalCreditsRequired: p.totalCreditsRequired,
      requiredCredits: p.requiredCredits,
      limitedElectiveCredits: p.limitedElectiveCredits,
      electiveCredits: p.electiveCredits,
      createdAt: p.createdAt,
    }));

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Training program list error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const programValidators = [
  body('major').trim().notEmpty().withMessage('专业不能为空'),
  body('enrollmentYear').isInt({ min: 2000, max: 2100 }).withMessage('请输入有效的入学年份'),
  body('name').trim().notEmpty().withMessage('培养方案名称不能为空'),
  body('totalCreditsRequired').isInt({ min: 0 }).withMessage('毕业总学分必须为非负整数'),
  body('requiredCredits').isInt({ min: 0 }).withMessage('必修最低学分必须为非负整数'),
  body('limitedElectiveCredits').isInt({ min: 0 }).withMessage('限选最低学分必须为非负整数'),
  body('electiveCredits').isInt({ min: 0 }).withMessage('任选最低学分必须为非负整数'),
];

router.post('/', programValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });

  const { major, enrollmentYear, name, totalCreditsRequired, requiredCredits, limitedElectiveCredits, electiveCredits } = req.body;

  const t = await sequelize.transaction();
  try {
    const existing = await TrainingProgram.findOne({
      where: { major: major.trim(), enrollmentYear: parseInt(enrollmentYear, 10) },
      transaction: t,
    });
    if (existing) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: '该专业该入学年份的培养方案已存在' });
    }

    const row = await TrainingProgram.create(
      {
        major: major.trim(),
        enrollmentYear: parseInt(enrollmentYear, 10),
        name: name.trim(),
        totalCreditsRequired: parseInt(totalCreditsRequired, 10),
        requiredCredits: parseInt(requiredCredits, 10),
        limitedElectiveCredits: parseInt(limitedElectiveCredits, 10),
        electiveCredits: parseInt(electiveCredits, 10),
      },
      { transaction: t }
    );

    await t.commit();
    return res
      .status(201)
      .set('Content-Type', 'application/json; charset=utf-8')
      .json({ ok: true, data: { id: row.id, ...row.toJSON() } });
  } catch (e) {
    await t.rollback();
    logger.error('Create training program error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/:id', param('id').isInt({ min: 1 }), programValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });

  const id = parseInt(req.params.id, 10);
  const { major, enrollmentYear, name, totalCreditsRequired, requiredCredits, limitedElectiveCredits, electiveCredits } = req.body;

  const t = await sequelize.transaction();
  try {
    const row = await TrainingProgram.findByPk(id, { transaction: t });
    if (!row) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: '培养方案不存在' });
    }

    const existing = await TrainingProgram.findOne({
      where: {
        major: major.trim(),
        enrollmentYear: parseInt(enrollmentYear, 10),
        id: { [Op.ne]: id },
      },
      transaction: t,
    });
    if (existing) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: '该专业该入学年份的培养方案已存在' });
    }

    await TrainingProgram.update(
      {
        major: major.trim(),
        enrollmentYear: parseInt(enrollmentYear, 10),
        name: name.trim(),
        totalCreditsRequired: parseInt(totalCreditsRequired, 10),
        requiredCredits: parseInt(requiredCredits, 10),
        limitedElectiveCredits: parseInt(limitedElectiveCredits, 10),
        electiveCredits: parseInt(electiveCredits, 10),
      },
      { where: { id }, transaction: t }
    );

    await t.commit();
    const updated = await TrainingProgram.findByPk(id);
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated.toJSON() });
  } catch (e) {
    await t.rollback();
    logger.error('Update training program error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const t = await sequelize.transaction();
  try {
    await TrainingProgramCourse.destroy({ where: { programId: id }, transaction: t });
    const n = await TrainingProgram.destroy({ where: { id }, transaction: t });
    if (n === 0) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: '培养方案不存在' });
    }
    await t.commit();
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    await t.rollback();
    logger.error('Delete training program error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const program = await TrainingProgram.findByPk(id, {
      include: [
        {
          model: TrainingProgramCourse,
          as: 'programCourses',
          include: [
            {
              model: Course,
              as: 'course',
              attributes: ['id', 'code', 'name', 'credit'],
            },
          ],
        },
      ],
    });

    if (!program) return res.status(404).json({ ok: false, message: '培养方案不存在' });

    const courses = {
      required: [],
      limited_elective: [],
      elective: [],
    };

    if (program.programCourses) {
      program.programCourses.forEach((pc) => {
        if (pc.course) {
          courses[pc.category].push({
            id: pc.id,
            courseId: pc.courseId,
            code: pc.course.code,
            name: pc.course.name,
            credit: pc.course.credit,
            category: pc.category,
            categoryText: CATEGORY_MAP[pc.category],
          });
        }
      });
    }

    const data = {
      id: program.id,
      major: program.major,
      enrollmentYear: program.enrollmentYear,
      name: program.name,
      totalCreditsRequired: program.totalCreditsRequired,
      requiredCredits: program.requiredCredits,
      limitedElectiveCredits: program.limitedElectiveCredits,
      electiveCredits: program.electiveCredits,
      courses,
    };

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Training program detail error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/by-major-year', async (req, res) => {
  const { major, enrollmentYear } = req.query;
  if (!major || !enrollmentYear) {
    return res.status(400).json({ ok: false, message: '请提供专业和入学年份' });
  }
  try {
    const program = await TrainingProgram.findOne({
      where: { major, enrollmentYear: parseInt(enrollmentYear, 10) },
      include: [
        {
          model: TrainingProgramCourse,
          as: 'programCourses',
          include: [
            {
              model: Course,
              as: 'course',
              attributes: ['id', 'code', 'name', 'credit'],
            },
          ],
        },
      ],
    });

    if (!program) return res.status(404).json({ ok: false, message: '未找到对应的培养方案' });

    const courses = {
      required: [],
      limited_elective: [],
      elective: [],
    };

    if (program.programCourses) {
      program.programCourses.forEach((pc) => {
        if (pc.course) {
          courses[pc.category].push({
            id: pc.id,
            courseId: pc.courseId,
            code: pc.course.code,
            name: pc.course.name,
            credit: pc.course.credit,
            category: pc.category,
            categoryText: CATEGORY_MAP[pc.category],
          });
        }
      });
    }

    const data = {
      id: program.id,
      major: program.major,
      enrollmentYear: program.enrollmentYear,
      name: program.name,
      totalCreditsRequired: program.totalCreditsRequired,
      requiredCredits: program.requiredCredits,
      limitedElectiveCredits: program.limitedElectiveCredits,
      electiveCredits: program.electiveCredits,
      courses,
    };

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Training program by major year error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const courseValidators = [
  body('courseId').isInt({ min: 1 }).withMessage('请选择有效的课程'),
  body('category').isIn(['required', 'limited_elective', 'elective']).withMessage('分类必须是 required、limited_elective 或 elective'),
];

router.post('/:id/courses', param('id').isInt({ min: 1 }), courseValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });

  const programId = parseInt(req.params.id, 10);
  const { courseId, category } = req.body;

  try {
    const program = await TrainingProgram.findByPk(programId);
    if (!program) return res.status(404).json({ ok: false, message: '培养方案不存在' });

    const course = await Course.findByPk(courseId);
    if (!course) return res.status(404).json({ ok: false, message: '课程不存在' });

    const existing = await TrainingProgramCourse.findOne({ where: { programId, courseId } });
    if (existing) return res.status(400).json({ ok: false, message: '该课程已在培养方案中' });

    const row = await TrainingProgramCourse.create({ programId, courseId, category });

    const pc = await TrainingProgramCourse.findByPk(row.id, {
      include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'name', 'credit'] }],
    });

    const data = {
      id: pc.id,
      courseId: pc.courseId,
      code: pc.course.code,
      name: pc.course.name,
      credit: pc.course.credit,
      category: pc.category,
      categoryText: CATEGORY_MAP[pc.category],
    };

    return res
      .status(201)
      .set('Content-Type', 'application/json; charset=utf-8')
      .json({ ok: true, data });
  } catch (e) {
    logger.error('Add program course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/:id/courses/:pcId', param('id').isInt({ min: 1 }), param('pcId').isInt({ min: 1 }), body('category').isIn(['required', 'limited_elective', 'elective']).withMessage('分类必须是 required、limited_elective 或 elective'), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });

  const pcId = parseInt(req.params.pcId, 10);
  const { category } = req.body;

  try {
    const pc = await TrainingProgramCourse.findByPk(pcId);
    if (!pc) return res.status(404).json({ ok: false, message: '课程关联不存在' });

    await TrainingProgramCourse.update({ category }, { where: { id: pcId } });

    const updated = await TrainingProgramCourse.findByPk(pcId, {
      include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'name', 'credit'] }],
    });

    const data = {
      id: updated.id,
      courseId: updated.courseId,
      code: updated.course.code,
      name: updated.course.name,
      credit: updated.course.credit,
      category: updated.category,
      categoryText: CATEGORY_MAP[updated.category],
    };

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Update program course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/:id/courses/:pcId', param('id').isInt({ min: 1 }), param('pcId').isInt({ min: 1 }), async (req, res) => {
  const pcId = parseInt(req.params.pcId, 10);
  try {
    const n = await TrainingProgramCourse.destroy({ where: { id: pcId } });
    if (n === 0) return res.status(404).json({ ok: false, message: '课程关联不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已从培养方案中移除' });
  } catch (e) {
    logger.error('Remove program course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/student/:studentId', param('studentId').isInt({ min: 1 }), async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  try {
    const student = await Student.findByPk(studentId);
    if (!student) return res.status(404).json({ ok: false, message: '学生不存在' });

    if (!student.major || !student.enrollmentYear) {
      return res.status(400).json({ ok: false, message: '该学生未设置专业或入学年份' });
    }

    const program = await TrainingProgram.findOne({
      where: { major: student.major, enrollmentYear: student.enrollmentYear },
      include: [
        {
          model: TrainingProgramCourse,
          as: 'programCourses',
          include: [
            {
              model: Course,
              as: 'course',
              attributes: ['id', 'code', 'name', 'credit'],
            },
          ],
        },
      ],
    });

    if (!program) return res.status(404).json({ ok: false, message: '未找到对应专业和入学年份的培养方案' });

    const enrollments = await Enrollment.findAll({
      where: { studentId },
      attributes: ['courseId', 'enrolledAt'],
      raw: true,
    });

    const enrolledCourseIds = new Set(enrollments.map((e) => e.courseId));

    const courses = {
      required: [],
      limited_elective: [],
      elective: [],
    };

    let earnedTotalCredits = 0;
    let earnedRequiredCredits = 0;
    let earnedLimitedElectiveCredits = 0;
    let earnedElectiveCredits = 0;

    if (program.programCourses) {
      program.programCourses.forEach((pc) => {
        if (pc.course) {
          let status = 'not_taken';
          let statusText = '未修';

          if (enrolledCourseIds.has(pc.courseId)) {
            status = 'studying';
            statusText = '在修';
            if (pc.category === 'required') {
              earnedRequiredCredits += pc.course.credit;
            } else if (pc.category === 'limited_elective') {
              earnedLimitedElectiveCredits += pc.course.credit;
            } else {
              earnedElectiveCredits += pc.course.credit;
            }
            earnedTotalCredits += pc.course.credit;
          }

          courses[pc.category].push({
            id: pc.id,
            courseId: pc.courseId,
            code: pc.course.code,
            name: pc.course.name,
            credit: pc.course.credit,
            category: pc.category,
            categoryText: CATEGORY_MAP[pc.category],
            status,
            statusText,
          });
        }
      });
    }

    const remainingCredits = Math.max(0, program.totalCreditsRequired - earnedTotalCredits);

    const data = {
      program: {
        id: program.id,
        major: program.major,
        enrollmentYear: program.enrollmentYear,
        name: program.name,
        totalCreditsRequired: program.totalCreditsRequired,
        requiredCredits: program.requiredCredits,
        limitedElectiveCredits: program.limitedElectiveCredits,
        electiveCredits: program.electiveCredits,
      },
      courses,
      progress: {
        earnedTotalCredits,
        earnedRequiredCredits,
        earnedLimitedElectiveCredits,
        earnedElectiveCredits,
        remainingCredits,
        progressPercent: program.totalCreditsRequired > 0 ? Math.min(100, Math.round((earnedTotalCredits / program.totalCreditsRequired) * 100)) : 0,
      },
    };

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Student training program error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/student/:studentId/summary', param('studentId').isInt({ min: 1 }), async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  try {
    const student = await Student.findByPk(studentId);
    if (!student) return res.status(404).json({ ok: false, message: '学生不存在' });

    if (!student.major || !student.enrollmentYear) {
      return res.status(400).json({ ok: false, message: '该学生未设置专业或入学年份' });
    }

    const program = await TrainingProgram.findOne({
      where: { major: student.major, enrollmentYear: student.enrollmentYear },
      include: [
        {
          model: TrainingProgramCourse,
          as: 'programCourses',
          include: [
            {
              model: Course,
              as: 'course',
              attributes: ['id', 'credit'],
            },
          ],
        },
      ],
    });

    if (!program) return res.status(404).json({ ok: false, message: '未找到对应专业和入学年份的培养方案' });

    const enrollments = await Enrollment.findAll({
      where: { studentId },
      attributes: ['courseId'],
      raw: true,
    });

    const enrolledCourseIds = new Set(enrollments.map((e) => e.courseId));

    let earnedTotalCredits = 0;
    let earnedRequiredCredits = 0;
    let earnedLimitedElectiveCredits = 0;
    let earnedElectiveCredits = 0;

    if (program.programCourses) {
      program.programCourses.forEach((pc) => {
        if (pc.course && enrolledCourseIds.has(pc.courseId)) {
          if (pc.category === 'required') {
            earnedRequiredCredits += pc.course.credit;
          } else if (pc.category === 'limited_elective') {
            earnedLimitedElectiveCredits += pc.course.credit;
          } else {
            earnedElectiveCredits += pc.course.credit;
          }
          earnedTotalCredits += pc.course.credit;
        }
      });
    }

    const remainingCredits = Math.max(0, program.totalCreditsRequired - earnedTotalCredits);

    const data = {
      totalCreditsRequired: program.totalCreditsRequired,
      requiredCredits: program.requiredCredits,
      limitedElectiveCredits: program.limitedElectiveCredits,
      electiveCredits: program.electiveCredits,
      earnedTotalCredits,
      earnedRequiredCredits,
      earnedLimitedElectiveCredits,
      earnedElectiveCredits,
      remainingCredits,
      progressPercent: program.totalCreditsRequired > 0 ? Math.min(100, Math.round((earnedTotalCredits / program.totalCreditsRequired) * 100)) : 0,
    };

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Student summary error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
