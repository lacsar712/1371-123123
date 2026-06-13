const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'AttendanceSession',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      code: { type: DataTypes.STRING(6), allowNull: false },
      startTime: { type: DataTypes.DATE, allowNull: false, field: 'start_time' },
      endTime: { type: DataTypes.DATE, allowNull: false, field: 'end_time' },
      duration: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 300 },
      status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    },
    { tableName: 'attendance_session', timestamps: false }
  );
};
