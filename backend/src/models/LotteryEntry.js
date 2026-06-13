const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'LotteryEntry',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'waiting' },
    },
    { tableName: 'lottery_entry', timestamps: false }
  );
};
