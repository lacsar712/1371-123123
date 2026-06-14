const crypto = require('crypto');
const logger = require('./logger');
const { Admin, Student, Teacher, Course, Enrollment, Exam } = require('./models');
const { ensureBadgesSeeded } = require('./badgeRules');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}

const TEST_PASSWORD_HASH = hashPassword('123456');

/** 每次启动都确保测试账号存在且密码为 123456，避免旧库导致登录失败 */
async function ensureTestAccounts() {
  const [admin] = await Admin.findOrCreate({
    where: { username: 'admin' },
    defaults: { passwordHash: TEST_PASSWORD_HASH },
  });
  if (admin && admin.passwordHash !== TEST_PASSWORD_HASH) {
    await admin.update({ passwordHash: TEST_PASSWORD_HASH });
  }
  const testStudents = [
    { studentNo: 'S2024001', name: '张三' },
    { studentNo: 'S2024002', name: '李四' },
    { studentNo: 'S2024003', name: '王五' },
  ];
  for (const s of testStudents) {
    const [student, created] = await Student.findOrCreate({
      where: { studentNo: s.studentNo },
      defaults: { name: s.name, passwordHash: TEST_PASSWORD_HASH },
    });
    if (!created && student.passwordHash !== TEST_PASSWORD_HASH) {
      await student.update({ passwordHash: TEST_PASSWORD_HASH, name: s.name });
    }
  }
  const testTeachers = [
    { teacherNo: 'teacher', name: '李老师' },
    { teacherNo: 'T2024001', name: '王教授' },
  ];
  for (const t of testTeachers) {
    const [teacher, created] = await Teacher.findOrCreate({
      where: { teacherNo: t.teacherNo },
      defaults: { name: t.name, passwordHash: TEST_PASSWORD_HASH },
    });
    if (!created && teacher.passwordHash !== TEST_PASSWORD_HASH) {
      await teacher.update({ passwordHash: TEST_PASSWORD_HASH, name: t.name });
    }
  }
  logger.info('Test accounts ensured');
}

async function seed() {
  await ensureBadgesSeeded();
  await ensureTestAccounts();

  const teachers = await Teacher.findAll({ attributes: ['id', 'teacherNo'] });
  const teacher1 = teachers.find((t) => t.teacherNo === 'teacher') || teachers[0];
  const teacher2 = teachers.find((t) => t.teacherNo === 'T2024001') || teachers[0];

  const courseCount = await Course.count();
  const schedulesCS101 = JSON.stringify([
    { dayOfWeek: 1, startTime: '08:00', endTime: '09:40', startWeek: 1, endWeek: 16, location: 'A101' },
    { dayOfWeek: 3, startTime: '10:00', endTime: '11:40', startWeek: 1, endWeek: 16, location: 'A101' },
  ]);
  const schedulesCS102 = JSON.stringify([
    { dayOfWeek: 2, startTime: '14:00', endTime: '15:40', startWeek: 1, endWeek: 16, location: 'B202' },
    { dayOfWeek: 4, startTime: '08:00', endTime: '09:40', startWeek: 1, endWeek: 16, location: 'B202' },
  ]);
  const schedulesCS103 = JSON.stringify([
    { dayOfWeek: 2, startTime: '08:00', endTime: '09:40', startWeek: 1, endWeek: 16, location: 'C303' },
    { dayOfWeek: 5, startTime: '10:00', endTime: '11:40', startWeek: 1, endWeek: 16, location: 'C303' },
  ]);
  const schedulesMATH201 = JSON.stringify([
    { dayOfWeek: 1, startTime: '10:00', endTime: '11:40', startWeek: 1, endWeek: 18, location: 'D101' },
    { dayOfWeek: 3, startTime: '14:00', endTime: '15:40', startWeek: 1, endWeek: 18, location: 'D101' },
    { dayOfWeek: 5, startTime: '08:00', endTime: '09:40', startWeek: 1, endWeek: 18, location: 'D101' },
  ]);
  const schedulesENG101 = JSON.stringify([
    { dayOfWeek: 4, startTime: '14:00', endTime: '15:40', startWeek: 1, endWeek: 16, location: 'E404' },
  ]);
  const courseData = [
    { code: 'CS101', name: '数据结构', credit: 4, capacity: 60, schedules: schedulesCS101, examTime: '2026-06-16T09:00:00', examDuration: 120, teacherId: teacher1.id },
    { code: 'CS102', name: '计算机网络', credit: 3, capacity: 50, schedules: schedulesCS102, examTime: '2026-06-18T14:00:00', examDuration: 120, teacherId: teacher1.id },
    { code: 'CS103', name: '操作系统', credit: 4, capacity: 55, schedules: schedulesCS103, examTime: '2026-06-20T09:00:00', examDuration: 120, teacherId: teacher2.id },
    { code: 'MATH201', name: '高等数学', credit: 5, capacity: 80, schedules: schedulesMATH201, examTime: '2026-06-22T09:00:00', examDuration: 150, teacherId: teacher2.id },
    { code: 'ENG101', name: '大学英语', credit: 2, capacity: 100, schedules: schedulesENG101, examTime: '2026-06-24T14:00:00', examDuration: 120, teacherId: teacher1.id },
  ];

  let createdCourses = [];
  if (courseCount === 0) {
    createdCourses = await Course.bulkCreate(courseData);
    await Enrollment.bulkCreate([
      { studentId: 1, courseId: 1 },
      { studentId: 1, courseId: 2 },
      { studentId: 2, courseId: 1 },
    ]);
    logger.info('Seed completed');
  } else {
    createdCourses = [];
    for (const cd of courseData) {
      const existing = await Course.findOne({ where: { code: cd.code } });
      if (existing) {
        const patch = {};
        if (!existing.schedules && cd.schedules) patch.schedules = cd.schedules;
        if (!existing.examTime && cd.examTime) patch.examTime = cd.examTime;
        if ((existing.examDuration || 0) < 1 && cd.examDuration) patch.examDuration = cd.examDuration;
        if (!existing.teacherId && cd.teacherId) patch.teacherId = cd.teacherId;
        if (Object.keys(patch).length > 0) {
          await existing.update(patch);
          logger.info(`Updated course schedule for ${cd.code}`);
        }
        createdCourses.push(existing);
      } else {
        const c = await Course.create(cd);
        createdCourses.push(c);
      }
    }
    logger.info('Seed patches applied');
  }

  const examCount = await Exam.count();
  if (examCount === 0) {
    const examData = [];
    for (const course of createdCourses) {
      if (course.examTime) {
        examData.push({
          courseId: course.id,
          teacherId: course.teacherId || teacher1.id,
          examTime: course.examTime,
          duration: course.examDuration || 120,
          location: `${course.code}考场`,
          examType: 'closed',
        });
      }
    }
    if (examData.length > 0) {
      await Exam.bulkCreate(examData);
      logger.info('Seed exams completed');
    }
  }
}

module.exports = { seed, hashPassword };

if (require.main === module) {
  const { sequelize } = require('./models');
  (async () => {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await seed();
    process.exit(0);
  })().catch((e) => {
    logger.error('Seed failed', { error: e.message });
    process.exit(1);
  });
}
