const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Ticket',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      category: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'other',
        comment: 'course_enrollment: 选课问题, grade_appeal: 成绩异议, system_fault: 系统故障, other: 其他',
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'pending: 待处理, processing: 处理中, resolved: 已解决, closed: 已关闭',
      },
      submitterId: { type: DataTypes.INTEGER, allowNull: false, field: 'submitter_id' },
      submitterRole: { type: DataTypes.STRING(16), allowNull: false, field: 'submitter_role', comment: 'student / teacher / admin' },
      submitterName: { type: DataTypes.STRING(64), allowNull: false, field: 'submitter_name' },
      handlerId: { type: DataTypes.INTEGER, allowNull: true, field: 'handler_id' },
      handlerName: { type: DataTypes.STRING(64), allowNull: true, field: 'handler_name' },
      createdAt: { type: DataTypes.DATE, field: 'created_at', defaultValue: DataTypes.NOW },
      lastReplyAt: { type: DataTypes.DATE, field: 'last_reply_at', defaultValue: DataTypes.NOW },
    },
    { tableName: 'ticket', timestamps: false }
  );
};
