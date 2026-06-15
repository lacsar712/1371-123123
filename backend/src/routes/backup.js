const express = require('express');
const multer = require('multer');
const zlib = require('zlib');
const {
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
  Exam,
  BackupRecord,
} = require('../models');
const logger = require('../logger');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const CORE_TABLES = [
  { key: 'admins', model: Admin, label: '管理员' },
  { key: 'teachers', model: Teacher, label: '教师' },
  { key: 'students', model: Student, label: '学生' },
  { key: 'courses', model: Course, label: '课程' },
  { key: 'enrollments', model: Enrollment, label: '选课记录' },
  { key: 'lotteryEntries', model: LotteryEntry, label: '抽签记录' },
  { key: 'attendanceSessions', model: AttendanceSession, label: '考勤会话' },
  { key: 'attendanceRecords', model: AttendanceRecord, label: '考勤记录' },
  { key: 'badges', model: Badge, label: '徽章' },
  { key: 'studentBadges', model: StudentBadge, label: '学生徽章' },
  { key: 'pointRecords', model: PointRecord, label: '积分记录' },
  { key: 'courseEvaluations', model: CourseEvaluation, label: '课程评价' },
  { key: 'exams', model: Exam, label: '考试' },
  { key: 'tickets', model: Ticket, label: '工单' },
  { key: 'ticketReplies', model: TicketReply, label: '工单回复' },
  { key: 'notifications', model: Notification, label: '通知' },
  { key: 'calendarEvents', model: CalendarEvent, label: '日历事件' },
];

router.get('/export', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      tables: {},
    };
    const affectedRows = {};

    for (const { key, model, label } of CORE_TABLES) {
      const rows = await model.findAll({ transaction: t, raw: true });
      exportData.tables[key] = rows;
      affectedRows[key] = rows.length;
    }

    await t.commit();

    const jsonStr = JSON.stringify(exportData, null, 0);
    const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf-8'));

    const dateStr = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 16);
    const fileName = `backup_${dateStr}.json.gz`;
    const fileSize = compressed.length;

    await BackupRecord.create({
      type: 'export',
      mode: null,
      operator: 'admin',
      fileName,
      fileSize,
      affectedRows: JSON.stringify(affectedRows),
      status: 'success',
    });

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );
    res.send(compressed);
  } catch (e) {
    await t.rollback();
    logger.error('Export backup error', { error: e.message });
    res.status(500).json({ ok: false, message: '导出失败：' + e.message });
  }
});

const deleteOrder = [
  'ticketReplies',
  'tickets',
  'attendanceRecords',
  'attendanceSessions',
  'notifications',
  'calendarEvents',
  'pointRecords',
  'courseEvaluations',
  'studentBadges',
  'enrollments',
  'lotteryEntries',
  'exams',
  'courses',
  'badges',
  'students',
  'teachers',
  'admins',
];

router.post('/import', upload.single('file'), async (req, res) => {
  const mode = req.body.mode || 'overwrite';
  if (!['overwrite', 'incremental'].includes(mode)) {
    return res.status(400).json({ ok: false, message: '无效的导入模式' });
  }
  if (!req.file) {
    return res.status(400).json({ ok: false, message: '请上传备份文件' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function flush() {
    try { if (typeof res.flush === 'function') res.flush(); } catch (_) {}
  }

  function writeLine(obj) {
    try {
      res.write(JSON.stringify(obj) + '\n');
      flush();
    } catch (_) {}
  }

  const t = await sequelize.transaction();
  const logs = [];
  const affectedRows = {};

  function addLog(level, message) {
    const entry = { type: 'log', time: new Date().toISOString(), level, message };
    logs.push(entry);
    writeLine(entry);
    logger.info(`[Import ${mode}] ${message}`);
  }

  let finalOk = false;
  let finalMessage = '';

  try {
    addLog('info', `开始导入，模式：${mode === 'overwrite' ? '覆盖模式' : '增量模式'}`);

    let rawData;
    try {
      rawData = zlib.gunzipSync(req.file.buffer).toString('utf-8');
    } catch (_) {
      rawData = req.file.buffer.toString('utf-8');
    }
    const data = JSON.parse(rawData);

    if (!data || !data.tables || typeof data.tables !== 'object') {
      throw new Error('备份文件格式无效');
    }

    addLog('info', `解析备份文件完成，版本：${data.version || '未知'}`);

    if (mode === 'overwrite') {
      addLog('info', '覆盖模式：正在清空现有数据...');
      for (const key of deleteOrder) {
        const tableConfig = CORE_TABLES.find((t) => t.key === key);
        if (!tableConfig) continue;
        const count = await tableConfig.model.count({ transaction: t });
        await tableConfig.model.destroy({ where: {}, transaction: t });
        affectedRows[key] = 0;
        addLog('info', `已清空 ${tableConfig.label}：${count} 条记录`);
      }
    }

    for (const { key, model, label } of CORE_TABLES) {
      const rows = data.tables[key] || [];
      if (!rows.length) {
        addLog('info', `跳过 ${label}：无数据`);
        affectedRows[key] = 0;
        continue;
      }

      addLog('info', `正在处理 ${label}：${rows.length} 条记录`);

      if (mode === 'overwrite') {
        await model.bulkCreate(rows, { transaction: t });
        affectedRows[key] = rows.length;
        addLog('success', `${label} 导入完成：${rows.length} 条`);
      } else {
        let inserted = 0;
        let updated = 0;
        const pkAttr = Object.keys(model.rawAttributes).find(
          (k) => model.rawAttributes[k].primaryKey
        );
        for (const row of rows) {
          if (pkAttr && row[pkAttr] != null) {
            const existing = await model.findByPk(row[pkAttr], { transaction: t });
            if (existing) {
              await model.update(row, { where: { [pkAttr]: row[pkAttr] }, transaction: t });
              updated++;
            } else {
              await model.create(row, { transaction: t });
              inserted++;
            }
          } else {
            await model.create(row, { transaction: t });
            inserted++;
          }
        }
        affectedRows[key] = inserted + updated;
        addLog('success', `${label} 合并完成：新增 ${inserted} 条，更新 ${updated} 条`);
      }
    }

    addLog('success', '所有数据导入完成，正在提交事务...');

    const fileName = req.file.originalname || 'backup.json.gz';
    const fileSize = req.file.size;

    await BackupRecord.create({
      type: 'import',
      mode,
      operator: 'admin',
      fileName,
      fileSize,
      affectedRows: JSON.stringify(affectedRows),
      status: 'success',
    }, { transaction: t });

    await t.commit();
    addLog('success', '事务已提交，导入成功！');
    finalOk = true;
    finalMessage = '导入成功';
  } catch (e) {
    try { await t.rollback(); } catch (_) {}
    addLog('error', '导入失败：' + e.message);
    logger.error('Import backup error', { error: e.message, mode });
    finalOk = false;
    finalMessage = '导入失败：' + e.message;
  }

  writeLine({
    type: 'done',
    ok: finalOk,
    message: finalMessage,
    affectedRows,
  });
  try { res.end(); } catch (_) {}
});

router.get('/records', async (req, res) => {
  try {
    const list = await BackupRecord.findAll({
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    const data = list.map((r) => ({
      id: r.id,
      type: r.type,
      mode: r.mode,
      operator: r.operator,
      fileName: r.fileName,
      fileSize: r.fileSize,
      affectedRows: r.affectedRows ? JSON.parse(r.affectedRows) : {},
      status: r.status,
      createdAt: r.createdAt,
    }));
    res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Backup records list error', { error: e.message });
    res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
