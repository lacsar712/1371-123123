const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'TrainingProgramCourse',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      programId: { type: DataTypes.INTEGER, allowNull: false, field: 'program_id' },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      category: { type: DataTypes.ENUM('required', 'limited_elective', 'elective'), allowNull: false },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    },
    { tableName: 'training_program_course', timestamps: false, indexes: [{ unique: true, fields: ['program_id', 'course_id'] }] }
  );
};
