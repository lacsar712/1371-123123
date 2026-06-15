const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'TrainingProgram',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      major: { type: DataTypes.STRING(64), allowNull: false },
      enrollmentYear: { type: DataTypes.INTEGER, allowNull: false, field: 'enrollment_year' },
      name: { type: DataTypes.STRING(128), allowNull: false },
      totalCreditsRequired: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_credits_required' },
      requiredCredits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'required_credits' },
      limitedElectiveCredits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'limited_elective_credits' },
      electiveCredits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'elective_credits' },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    },
    { tableName: 'training_program', timestamps: false, indexes: [{ unique: true, fields: ['major', 'enrollment_year'] }] }
  );
};
