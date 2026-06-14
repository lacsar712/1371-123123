const path = require('path');
const { Sequelize } = require('sequelize');
const logger = require('../logger');

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
const CalendarEvent = require('./CalendarEvent')(sequelize);
const Badge = require('./Badge')(sequelize);
const StudentBadge = require('./StudentBadge')(sequelize);
const PointRecord = require('./PointRecord')(sequelize);
const CourseEvaluation = require('./CourseEvaluation')(sequelize);

Student.hasMany(Enrollment, { foreignKey: 'studentId' });
Student.hasMany(CalendarEvent, { foreignKey: 'userId', constraints: false });
Teacher.hasMany(CalendarEvent, { foreignKey: 'userId', constraints: false });
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

Student.hasMany(StudentBadge, { foreignKey: 'studentId' });
StudentBadge.belongsTo(Student, { foreignKey: 'studentId' });
Badge.hasMany(StudentBadge, { foreignKey: 'badgeId' });
StudentBadge.belongsTo(Badge, { foreignKey: 'badgeId' });

Student.hasMany(PointRecord, { foreignKey: 'studentId' });
PointRecord.belongsTo(Student, { foreignKey: 'studentId' });

Student.hasMany(CourseEvaluation, { foreignKey: 'studentId' });
CourseEvaluation.belongsTo(Student, { foreignKey: 'studentId' });
Course.hasMany(CourseEvaluation, { foreignKey: 'courseId' });
CourseEvaluation.belongsTo(Course, { foreignKey: 'courseId' });

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
  CalendarEvent,
  Badge,
  StudentBadge,
  PointRecord,
  CourseEvaluation,
};
