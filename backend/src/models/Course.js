const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Course',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(128), allowNull: false },
      credit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lotteryMode: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'lottery_mode' },
      schedules: { type: DataTypes.TEXT, allowNull: true, field: 'schedules' },
      examTime: { type: DataTypes.DATE, allowNull: true, field: 'exam_time' },
      examDuration: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120, field: 'exam_duration' },
    },
    { tableName: 'course' }
  );
};
