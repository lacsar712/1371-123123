const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'AttendanceRecord',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      sessionId: { type: DataTypes.INTEGER, allowNull: false, field: 'session_id' },
      studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
      signInTime: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'sign_in_time' },
    },
    { tableName: 'attendance_record', timestamps: false }
  );
};
