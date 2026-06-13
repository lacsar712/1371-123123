const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
      userRole: { type: DataTypes.STRING(16), allowNull: false, field: 'user_role', comment: 'student / teacher / admin' },
      title: { type: DataTypes.STRING(200), allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: true },
      type: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'info', comment: 'info / warning / success' },
      ticketId: { type: DataTypes.INTEGER, allowNull: true, field: 'ticket_id' },
      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_read' },
      createdAt: { type: DataTypes.DATE, field: 'created_at', defaultValue: DataTypes.NOW },
    },
    { tableName: 'notification', timestamps: false }
  );
};
