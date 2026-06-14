const express = require('express');
const path = require('path');
const fs = require('fs');
const { body, param, validationResult } = require('express-validator');
const multer = require('multer');
const router = express.Router();
const { Exam, Course, Enrollment, Teacher, Student } = require('../models');
const logger = require('../logger');

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'data', 'exam_papers');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const ext = path.extname(file.originalname) || '';
    cb(null, `exam_${ts}_${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.zip', '.rar', '.txt', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('不支持的文件类型'));
  },
});

const EXAM_TYPES = ['closed', 'open', 'computer'];
const EXAM_TYPE_LABELS = { closed: '闭卷', open: '开卷', computer: '机试' };

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

function formatExam(exam, opts = {}) {
  const now = new Date();
  const examTime = new Date(exam.examTime);
  const endTime = new Date(examTime.getTime() + (exam.duration || 120) * 60 * 1000);
  const canDownloadPaper = opts.allowDownload !== false && now >= examTime && !!exam.paperFile;
  const examEnded = now >= endTime;
  const obj = {
    id: exam.id,
    courseId: exam.courseId,
    teacherId: exam.teacherId,
    examTime: exam.examTime,
    duration: exam.duration,
    location: exam.location,
    examType: exam.examType,
    examTypeText: EXAM_TYPE_LABELS[exam.examType] || exam.examType,
    hasPaper: !!exam.paperFile,
    paperFileName: exam.paperFileName || null,
    canDownloadPaper,
    examEnded,
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
  };
  if (exam.course) {
    obj.course = {
      id: exam.course.id,
      code: exam.course.code,
      name: exam.course.name,
      credit: exam.course.credit,
    };
  }
  if (exam.teacher) {
    obj.teacher = {
      id: exam.teacher.id,
      teacherNo: exam.teacher.teacherNo,
      name: exam.teacher.name,
    };
  }
  return obj;
}

const createValidators = [
  body('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  body('teacherId').isInt({ min: 1 }).withMessage('无效的教师 ID'),
  body('examTime').notEmpty().withMessage('请选择考试时间'),
  body('duration').optional().isInt({ min: 1 }).withMessage('时长必须为正整数'),
  body('location').trim().notEmpty().withMessage('请填写考试地点'),
  body('examType').isIn(EXAM_TYPES).withMessage('无效的考试类型'),
];

router.post('/', createValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const { courseId, teacherId, examTime, duration, location, examType } = req.body;
  try {
    const course = await Course.findByPk(courseId, { attributes: ['id', 'teacherId'] });
    if (!course) return sendJson(res, 404, { ok: false, message: '课程不存在' });
    if (course.teacherId && course.teacherId !== Number(teacherId)) {
      return sendJson(res, 403, { ok: false, message: '您不是该课程的授课教师' });
    }
    if (!course.teacherId) {
      await course.update({ teacherId: Number(teacherId) });
    }
    const exam = await Exam.create({
      courseId: Number(courseId),
      teacherId: Number(teacherId),
      examTime,
      duration: duration ? Number(duration) : 120,
      location,
      examType,
    });
    return sendJson(res, 200, { ok: true, data: formatExam(exam) });
  } catch (e) {
    logger.error('Create exam error', { error: e.message, stack: e.stack });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

const updateValidators = [
  param('id').isInt({ min: 1 }).withMessage('无效的考试 ID'),
  body('teacherId').isInt({ min: 1 }).withMessage('无效的教师 ID'),
  body('examTime').optional().notEmpty().withMessage('请选择考试时间'),
  body('duration').optional().isInt({ min: 1 }).withMessage('时长必须为正整数'),
  body('location').optional().trim().notEmpty().withMessage('请填写考试地点'),
  body('examType').optional().isIn(EXAM_TYPES).withMessage('无效的考试类型'),
];

router.put('/:id', updateValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { teacherId, examTime, duration, location, examType } = req.body;
  try {
    const exam = await Exam.findByPk(id);
    if (!exam) return sendJson(res, 404, { ok: false, message: '考试不存在' });
    if (exam.teacherId !== Number(teacherId)) {
      return sendJson(res, 403, { ok: false, message: '仅授课教师本人可编辑' });
    }
    const patch = { updatedAt: new Date() };
    if (examTime !== undefined) patch.examTime = examTime;
    if (duration !== undefined) patch.duration = Number(duration);
    if (location !== undefined) patch.location = location;
    if (examType !== undefined) patch.examType = examType;
    await exam.update(patch);
    await exam.reload();
    return sendJson(res, 200, { ok: true, data: formatExam(exam) });
  } catch (e) {
    logger.error('Update exam error', { error: e.message, stack: e.stack });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

const deleteValidators = [
  param('id').isInt({ min: 1 }).withMessage('无效的考试 ID'),
  body('teacherId').isInt({ min: 1 }).withMessage('无效的教师 ID'),
];

router.delete('/:id', deleteValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const teacherId = Number(req.body.teacherId);
  try {
    const exam = await Exam.findByPk(id);
    if (!exam) return sendJson(res, 404, { ok: false, message: '考试不存在' });
    if (exam.teacherId !== teacherId) {
      return sendJson(res, 403, { ok: false, message: '仅授课教师本人可删除' });
    }
    if (exam.paperFile) {
      const filePath = path.join(UPLOAD_DIR, path.basename(exam.paperFile));
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }
    await exam.destroy();
    return sendJson(res, 200, { ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete exam error', { error: e.message, stack: e.stack });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.post('/:id/upload', (req, res) => {
  upload.single('paper')(req, res, async (err) => {
    const id = parseInt(req.params.id, 10);
    const teacherId = Number(req.body.teacherId);
    if (Number.isNaN(id)) return sendJson(res, 400, { ok: false, message: '无效的考试 ID' });
    if (!teacherId) return sendJson(res, 400, { ok: false, message: '缺少教师 ID' });
    if (err) {
      logger.warn('Upload error', { error: err.message });
      return sendJson(res, 400, { ok: false, message: err.message || '上传失败' });
    }
    if (!req.file) return sendJson(res, 400, { ok: false, message: '请选择文件' });
    try {
      const exam = await Exam.findByPk(id);
      if (!exam) return sendJson(res, 404, { ok: false, message: '考试不存在' });
      if (exam.teacherId !== teacherId) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return sendJson(res, 403, { ok: false, message: '仅授课教师本人可上传' });
      }
      if (exam.paperFile) {
        const oldPath = path.join(UPLOAD_DIR, path.basename(exam.paperFile));
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch (_) {}
        }
      }
      await exam.update({
        paperFile: req.file.filename,
        paperFileName: req.file.originalname,
        updatedAt: new Date(),
      });
      await exam.reload();
      return sendJson(res, 200, { ok: true, data: formatExam(exam) });
    } catch (e) {
      logger.error('Exam upload error', { error: e.message, stack: e.stack });
      try { if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (_) {}
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  });
});

router.get('/course/:courseId', param('courseId').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const courseId = parseInt(req.params.courseId, 10);
  try {
    const list = await Exam.findAll({
      where: { courseId },
      include: [
        { model: Course, as: 'course', attributes: ['id', 'code', 'name', 'credit'] },
        { model: Teacher, as: 'teacher', attributes: ['id', 'teacherNo', 'name'] },
      ],
      order: [['examTime', 'ASC']],
    });
    const data = list.map((e) => formatExam(e, { allowDownload: true }));
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    logger.error('List exams by course error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.get('/teacher/:teacherId', param('teacherId').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const teacherId = parseInt(req.params.teacherId, 10);
  try {
    const list = await Exam.findAll({
      where: { teacherId },
      include: [
        { model: Course, as: 'course', attributes: ['id', 'code', 'name', 'credit'] },
        { model: Teacher, as: 'teacher', attributes: ['id', 'teacherNo', 'name'] },
      ],
      order: [['examTime', 'ASC']],
    });
    const data = list.map((e) => formatExam(e, { allowDownload: true }));
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    logger.error('List exams by teacher error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.get('/student/:studentId', param('studentId').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const studentId = parseInt(req.params.studentId, 10);
  try {
    const student = await Student.findByPk(studentId);
    if (!student) return sendJson(res, 404, { ok: false, message: '学生不存在' });
    const enrollments = await Enrollment.findAll({
      where: { studentId },
      attributes: ['courseId'],
    });
    const courseIds = enrollments.map((e) => e.courseId);
    if (courseIds.length === 0) {
      return sendJson(res, 200, { ok: true, data: [] });
    }
    const list = await Exam.findAll({
      where: { courseId: courseIds },
      include: [
        { model: Course, as: 'course', attributes: ['id', 'code', 'name', 'credit'] },
        { model: Teacher, as: 'teacher', attributes: ['id', 'teacherNo', 'name'] },
      ],
      order: [['examTime', 'ASC']],
    });
    const data = list.map((e) => formatExam(e));
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    logger.error('List exams by student error', { error: e.message, stack: e.stack });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.get('/student/:studentId/grades', param('studentId').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const studentId = parseInt(req.params.studentId, 10);
  try {
    const enrollments = await Enrollment.findAll({
      where: { studentId },
      include: [{ model: Course, as: 'Course', attributes: ['id', 'code', 'name', 'credit', 'examTime', 'examDuration'] }],
      order: [['enrolledAt', 'ASC']],
    });
    const courseIds = enrollments.map((e) => e.courseId);
    const examsMap = {};
    if (courseIds.length > 0) {
      const exams = await Exam.findAll({
        where: { courseId: courseIds },
        attributes: ['id', 'courseId', 'examTime', 'duration', 'location', 'examType'],
      });
      exams.forEach((ex) => { examsMap[ex.courseId] = ex; });
    }
    const now = new Date();
    const data = enrollments.map((r) => {
      const course = r.Course;
      const exam = examsMap[course.id];
      let examEndTime = null;
      let examEnded = false;
      if (exam && exam.examTime) {
        examEndTime = new Date(new Date(exam.examTime).getTime() + (exam.duration || 120) * 60 * 1000);
        examEnded = now >= examEndTime;
      } else if (course.examTime) {
        examEndTime = new Date(new Date(course.examTime).getTime() + (course.examDuration || 120) * 60 * 1000);
        examEnded = now >= examEndTime;
      }
      const status = examEnded ? 'pending_grade' : 'not_taken';
      const statusText = examEnded ? '成绩待录入' : '未考试';
      return {
        course: {
          id: course.id,
          code: course.code,
          name: course.name,
          credit: course.credit,
        },
        exam: exam
          ? {
              id: exam.id,
              examTime: exam.examTime,
              duration: exam.duration,
              location: exam.location,
              examType: exam.examType,
            }
          : course.examTime
          ? {
              id: null,
              examTime: course.examTime,
              duration: course.examDuration || 120,
            }
          : null,
        status,
        statusText,
        grade: null,
      };
    });
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    logger.error('List grades error', { error: e.message, stack: e.stack });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.get('/:id/paper', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const studentId = req.query.studentId ? Number(req.query.studentId) : null;
  const teacherId = req.query.teacherId ? Number(req.query.teacherId) : null;
  try {
    const exam = await Exam.findByPk(id, { include: [{ model: Course, as: 'course', attributes: ['id'] }] });
    if (!exam) return sendJson(res, 404, { ok: false, message: '考试不存在' });
    if (!exam.paperFile) return sendJson(res, 404, { ok: false, message: '试卷尚未上传' });
    const now = new Date();
    const examTime = new Date(exam.examTime);
    if (teacherId && exam.teacherId === teacherId) {
    } else {
      if (studentId) {
        const enrolled = await Enrollment.findOne({ where: { studentId, courseId: exam.courseId } });
        if (!enrolled) return sendJson(res, 403, { ok: false, message: '您未选该课程，无法下载试卷' });
      }
      if (now < examTime) {
        return sendJson(res, 403, { ok: false, message: '尚未到考试开始时间，无法下载试卷' });
      }
    }
    const filePath = path.join(UPLOAD_DIR, path.basename(exam.paperFile));
    if (!fs.existsSync(filePath)) {
      return sendJson(res, 404, { ok: false, message: '试卷文件不存在' });
    }
    const fileName = exam.paperFileName || exam.paperFile;
    const encodedName = encodeURIComponent(fileName);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', (e) => {
      logger.error('Paper download error', { error: e.message });
      if (!res.headersSent) sendJson(res, 500, { ok: false, message: '下载失败' });
    });
  } catch (e) {
    logger.error('Get paper error', { error: e.message, stack: e.stack });
    if (!res.headersSent) sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.get('/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  try {
    const exam = await Exam.findByPk(id, {
      include: [
        { model: Course, as: 'course', attributes: ['id', 'code', 'name', 'credit'] },
        { model: Teacher, as: 'teacher', attributes: ['id', 'teacherNo', 'name'] },
      ],
    });
    if (!exam) return sendJson(res, 404, { ok: false, message: '考试不存在' });
    return sendJson(res, 200, { ok: true, data: formatExam(exam) });
  } catch (e) {
    logger.error('Get exam error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

module.exports = router;
