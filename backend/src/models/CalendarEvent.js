const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'CalendarEvent',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
      userRole: { type: DataTypes.STRING(16), allowNull: false, field: 'user_role' },
      title: { type: DataTypes.STRING(200), allowNull: false },
      startTime: { type: DataTypes.DATE, allowNull: false, field: 'start_time' },
      endTime: { type: DataTypes.DATE, allowNull: false, field: 'end_time' },
      color: { type: DataTypes.STRING(16), allowNull: false, defaultValue: '#6366f1' },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'updated_at' },
    },
    { tableName: 'calendar_event', timestamps: false }
  );
};
