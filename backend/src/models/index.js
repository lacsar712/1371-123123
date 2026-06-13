const path = require('path');
const { Sequelize } = require('sequelize');
const logger = require('../logger');

// SQLite 存储路径，支持中文（SQLite 3 默认 UTF-8 编码）
const SQLITE_PATH =
  process.env.SQLITE_PATH ||
  path.resolve(__dirname, '../../data/course.sqlite');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: SQLITE_PATH,
  define: {
    timestamps: false,
  },
  logging: (msg) => logger.debug(msg),
});

// SQLite 3 默认使用 UTF-8 编码，完整支持中文

const Admin = require('./Admin')(sequelize);
const Student = require('./Student')(sequelize);
const Teacher = require('./Teacher')(sequelize);
const Course = require('./Course')(sequelize);
const Enrollment = require('./Enrollment')(sequelize);
const LotteryEntry = require('./LotteryEntry')(sequelize);
const AttendanceSession = require('./AttendanceSession')(sequelize);
const AttendanceRecord = require('./AttendanceRecord')(sequelize);
const Ticket = require('./Ticket')(sequelize);
const TicketReply = require('./TicketReply')(sequelize);
const Notification = require('./Notification')(sequelize);

Student.hasMany(Enrollment, { foreignKey: 'studentId' });
Enrollment.belongsTo(Student, { foreignKey: 'studentId' });
Course.hasMany(Enrollment, { foreignKey: 'courseId' });
Enrollment.belongsTo(Course, { foreignKey: 'courseId' });

Student.hasMany(LotteryEntry, { foreignKey: 'studentId' });
LotteryEntry.belongsTo(Student, { foreignKey: 'studentId' });
Course.hasMany(LotteryEntry, { foreignKey: 'courseId' });
LotteryEntry.belongsTo(Course, { foreignKey: 'courseId' });

Course.hasMany(AttendanceSession, { foreignKey: 'courseId' });
AttendanceSession.belongsTo(Course, { foreignKey: 'courseId' });

AttendanceSession.hasMany(AttendanceRecord, { foreignKey: 'sessionId' });
AttendanceRecord.belongsTo(AttendanceSession, { foreignKey: 'sessionId' });

Student.hasMany(AttendanceRecord, { foreignKey: 'studentId' });
AttendanceRecord.belongsTo(Student, { foreignKey: 'studentId' });

Ticket.hasMany(TicketReply, { foreignKey: 'ticketId', as: 'replies' });
TicketReply.belongsTo(Ticket, { foreignKey: 'ticketId' });

module.exports = {
  sequelize,
  Admin,
  Student,
  Teacher,
  Course,
  Enrollment,
  LotteryEntry,
  AttendanceSession,
  AttendanceRecord,
  Ticket,
  TicketReply,
  Notification,
};
