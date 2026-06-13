const crypto = require('crypto');
const logger = require('./logger');
const { Admin, Student, Course, Enrollment } = require('./models');

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
  logger.info('Test accounts ensured');
}

async function seed() {
  await ensureTestAccounts();
  const courseCount = await Course.count();
  if (courseCount > 0) {
    logger.info('Seed already applied, skip');
    return;
  }
  await Course.bulkCreate([
    { code: 'CS101', name: '数据结构', credit: 4, capacity: 60 },
    { code: 'CS102', name: '计算机网络', credit: 3, capacity: 50 },
    { code: 'CS103', name: '操作系统', credit: 4, capacity: 55 },
    { code: 'MATH201', name: '高等数学', credit: 5, capacity: 80 },
    { code: 'ENG101', name: '大学英语', credit: 2, capacity: 100 },
  ]);
  await Enrollment.bulkCreate([
    { studentId: 1, courseId: 1 },
    { studentId: 1, courseId: 2 },
    { studentId: 2, courseId: 1 },
  ]);
  logger.info('Seed completed');
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
