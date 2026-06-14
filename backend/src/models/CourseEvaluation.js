const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'CourseEvaluation',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      rating: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
      comment: { type: DataTypes.STRING(500), allowNull: true },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    },
    {
      tableName: 'course_evaluation',
      timestamps: false,
      indexes: [
        { unique: true, fields: ['student_id', 'course_id'] },
      ],
    }
  );
};
