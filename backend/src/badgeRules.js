const { Op } = require('sequelize');
const {
  Badge,
  StudentBadge,
  PointRecord,
  Enrollment,
  AttendanceRecord,
  AttendanceSession,
  CourseEvaluation,
  Course,
  Student,
  sequelize,
} = require('./models');
const logger = require('./logger');

const BADGE_DEFINITIONS = [
  {
    name: '准时选手',
    description: '选课开放首日完成选课',
    icon: '⏰',
    color: '#f59e0b',
    ruleType: 'first_day_enroll',
    ruleConfig: JSON.stringify({ days: 1 }),
    points: 20,
  },
  {
    name: '全勤先锋',
    description: '一学期签到无缺勤（已选课程全部签到）',
    icon: '🏆',
    color: '#22c55e',
    ruleType: 'perfect_attendance',
    ruleConfig: JSON.stringify({ threshold: 1 }),
    points: 50,
  },
  {
    name: '评教达人',
    description: '完成 3 门及以上课程评教',
    icon: '⭐',
    color: '#a855f7',
    ruleType: 'evaluation_master',
    ruleConfig: JSON.stringify({ count: 3 }),
    points: 30,
  },
  {
    name: '选课狂人',
    description: '一学期选修 5 门及以上课程',
    icon: '📚',
    color: '#3b82f6',
    ruleType: 'course_enthusiast',
    ruleConfig: JSON.stringify({ count: 5 }),
    points: 25,
  },
  {
    name: '早起签到者',
    description: '在签到开始后 1 分钟内完成签到累计 5 次',
    icon: '🌅',
    color: '#ef4444',
    ruleType: 'early_bird',
    ruleConfig: JSON.stringify({ seconds: 60, count: 5 }),
    points: 20,
  },
  {
    name: '幸运儿',
    description: '在抽签模式课程中成功中签',
    icon: '🎰',
    color: '#ec4899',
    ruleType: 'lottery_winner',
    ruleConfig: JSON.stringify({}),
    points: 15,
  },
  {
    name: '活跃学者',
    description: '累计签到 10 次',
    icon: '🔥',
    color: '#f97316',
    ruleType: 'signin_streak',
    ruleConfig: JSON.stringify({ count: 10 }),
    points: 25,
  },
  {
    name: '意见领袖',
    description: '评教平均评分不低于 4 分且完成 2 门以上评教',
    icon: '💎',
    color: '#06b6d4',
    ruleType: 'thought_leader',
    ruleConfig: JSON.stringify({ minRating: 4, minCount: 2 }),
    points: 35,
  },
];

const ACTION_POINTS = {
  enroll: 5,
  signin: 3,
  evaluate: 10,
  lottery_won: 5,
};

async function ensureBadgesSeeded() {
  const count = await Badge.count();
  if (count === 0) {
    await Badge.bulkCreate(BADGE_DEFINITIONS);
    logger.info('Badge definitions seeded');
  } else {
    for (const def of BADGE_DEFINITIONS) {
      const existing = await Badge.findOne({ where: { name: def.name } });
      if (!existing) {
        await Badge.create(def);
        logger.info(`New badge seeded: ${def.name}`);
      }
    }
  }
}

async function addPoints(studentId, action, actionDetail, points) {
  if (points === 0) return;
  await PointRecord.create({
    studentId,
    action,
    actionDetail,
    points,
  });
}

async function getTotalPoints(studentId) {
  const result = await PointRecord.sum('points', { where: { studentId } });
  return result || 0;
}

async function awardBadge(studentId, badge) {
  const existing = await StudentBadge.findOne({
    where: { studentId, badgeId: badge.id },
  });
  if (existing) return false;

  await StudentBadge.create({
    studentId,
    badgeId: badge.id,
    earnedAt: new Date(),
  });
  await addPoints(studentId, 'badge_award', `获得勋章：${badge.name}`, badge.points);
  logger.info(`Badge awarded: student=${studentId}, badge=${badge.name}`);
  return true;
}

async function checkFirstDayEnroll(studentId) {
  const badge = await Badge.findOne({ where: { ruleType: 'first_day_enroll' } });
  if (!badge) return;

  const firstEnrollment = await Enrollment.findOne({
    where: { studentId },
    order: [['enrolledAt', 'ASC']],
  });
  if (!firstEnrollment) return;

  const enrollDate = new Date(firstEnrollment.enrolledAt);
  const now = new Date();
  const isSameDay =
    enrollDate.getFullYear() === now.getFullYear() &&
    enrollDate.getMonth() === now.getMonth() &&
    enrollDate.getDate() === now.getDate();

  if (isSameDay) {
    await awardBadge(studentId, badge);
  }
}

async function checkPerfectAttendance(studentId) {
  const badge = await Badge.findOne({ where: { ruleType: 'perfect_attendance' } });
  if (!badge) return;

  const enrollments = await Enrollment.findAll({ where: { studentId } });
  if (enrollments.length === 0) return;

  let allPerfect = true;
  for (const enrollment of enrollments) {
    const sessions = await AttendanceSession.findAll({
      where: { courseId: enrollment.courseId, status: 0 },
    });
    for (const session of sessions) {
      const record = await AttendanceRecord.findOne({
        where: { studentId, sessionId: session.id },
      });
      if (!record) {
        allPerfect = false;
        break;
      }
    }
    if (!allPerfect) break;
  }

  if (allPerfect && enrollments.length >= 1) {
    await awardBadge(studentId, badge);
  }
}

async function checkEvaluationMaster(studentId) {
  const badge = await Badge.findOne({ where: { ruleType: 'evaluation_master' } });
  if (!badge) return;

  const count = await CourseEvaluation.count({ where: { studentId } });
  if (count >= 3) {
    await awardBadge(studentId, badge);
  }
}

async function checkCourseEnthusiast(studentId) {
  const badge = await Badge.findOne({ where: { ruleType: 'course_enthusiast' } });
  if (!badge) return;

  const count = await Enrollment.count({ where: { studentId } });
  if (count >= 5) {
    await awardBadge(studentId, badge);
  }
}

async function checkEarlyBird(studentId) {
  const badge = await Badge.findOne({ where: { ruleType: 'early_bird' } });
  if (!badge) return;

  const config = badge.ruleConfig ? JSON.parse(badge.ruleConfig) : { seconds: 60, count: 5 };

  const records = await AttendanceRecord.findAll({
    where: { studentId },
    include: [{ model: AttendanceSession, as: 'AttendanceSession' }],
  });

  let earlyCount = 0;
  for (const r of records) {
    if (!r.AttendanceSession) continue;
    const signIn = new Date(r.signInTime).getTime();
    const start = new Date(r.AttendanceSession.startTime).getTime();
    if (signIn - start <= config.seconds * 1000) {
      earlyCount++;
    }
  }

  if (earlyCount >= config.count) {
    await awardBadge(studentId, badge);
  }
}

async function checkLotteryWinner(studentId, wonCourseId) {
  const badge = await Badge.findOne({ where: { ruleType: 'lottery_winner' } });
  if (!badge) return;
  await awardBadge(studentId, badge);
}

async function checkSigninStreak(studentId) {
  const badge = await Badge.findOne({ where: { ruleType: 'signin_streak' } });
  if (!badge) return;

  const config = badge.ruleConfig ? JSON.parse(badge.ruleConfig) : { count: 10 };
  const count = await AttendanceRecord.count({ where: { studentId } });
  if (count >= config.count) {
    await awardBadge(studentId, badge);
  }
}

async function checkThoughtLeader(studentId) {
  const badge = await Badge.findOne({ where: { ruleType: 'thought_leader' } });
  if (!badge) return;

  const config = badge.ruleConfig ? JSON.parse(badge.ruleConfig) : { minRating: 4, minCount: 2 };
  const evaluations = await CourseEvaluation.findAll({ where: { studentId } });
  if (evaluations.length < config.minCount) return;

  const avg = evaluations.reduce((s, e) => s + (e.rating || 0), 0) / evaluations.length;
  if (avg >= config.minRating) {
    await awardBadge(studentId, badge);
  }
}

async function processEvent(eventType, studentId, context = {}) {
  try {
    switch (eventType) {
      case 'enroll':
        await addPoints(studentId, 'enroll', context.courseName || '选课', ACTION_POINTS.enroll);
        await checkFirstDayEnroll(studentId);
        await checkCourseEnthusiast(studentId);
        break;
      case 'signin':
        await addPoints(studentId, 'signin', context.courseName || '签到', ACTION_POINTS.signin);
        await checkEarlyBird(studentId);
        await checkSigninStreak(studentId);
        await checkPerfectAttendance(studentId);
        break;
      case 'evaluate':
        await addPoints(studentId, 'evaluate', context.courseName || '评教', ACTION_POINTS.evaluate);
        await checkEvaluationMaster(studentId);
        await checkThoughtLeader(studentId);
        break;
      case 'lottery_won':
        await addPoints(studentId, 'lottery_won', context.courseName || '中签', ACTION_POINTS.lottery_won);
        await checkLotteryWinner(studentId);
        break;
    }
  } catch (e) {
    logger.error('Badge rule engine error', { eventType, studentId, error: e.message });
  }
}

function triggerEvent(eventType, studentId, context = {}) {
  setImmediate(() => {
    processEvent(eventType, studentId, context).catch((e) => {
      logger.error('Async rule engine error', { error: e.message });
    });
  });
}

async function getStudentBadges(studentId) {
  const allBadges = await Badge.findAll({ order: [['id', 'ASC']] });
  const earned = await StudentBadge.findAll({
    where: { studentId },
    include: [{ model: Badge, as: 'Badge' }],
  });
  const earnedIds = new Set(earned.map((e) => e.badgeId));
  const earnedMap = Object.fromEntries(
    earned.map((e) => [e.badgeId, e.earnedAt])
  );

  return allBadges.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    icon: b.icon,
    color: b.color,
    points: b.points,
    earned: earnedIds.has(b.id),
    earnedAt: earnedMap[b.id] || null,
  }));
}

async function getLeaderboard(limit = 10) {
  const results = await PointRecord.findAll({
    attributes: [
      'studentId',
      [sequelize.fn('SUM', sequelize.col('points')), 'totalPoints'],
    ],
    group: ['studentId'],
    order: [[sequelize.fn('SUM', sequelize.col('points')), 'DESC']],
    limit,
    raw: true,
  });

  const studentIds = results.map((r) => r.studentId);
  const students = await Student.findAll({
    where: { id: { [Op.in]: studentIds } },
    attributes: ['id', 'studentNo', 'name'],
    raw: true,
  });
  const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));

  return results.map((r, idx) => ({
    rank: idx + 1,
    studentId: r.studentId,
    studentNo: studentMap[r.studentId]?.studentNo || '',
    studentName: studentMap[r.studentId]?.name || '未知',
    totalPoints: Number(r.totalPoints) || 0,
  }));
}

module.exports = {
  ensureBadgesSeeded,
  triggerEvent,
  processEvent,
  getStudentBadges,
  getTotalPoints,
  getLeaderboard,
  addPoints,
  BADGE_DEFINITIONS,
  ACTION_POINTS,
};
