const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Exam',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      teacherId: { type: DataTypes.INTEGER, allowNull: false, field: 'teacher_id' },
      examTime: { type: DataTypes.DATE, allowNull: false, field: 'exam_time' },
      duration: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120, comment: '考试时长，单位分钟' },
      location: { type: DataTypes.STRING(128), allowNull: false, defaultValue: '' },
      examType: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'closed',
        field: 'exam_type',
        comment: 'closed:闭卷, open:开卷, computer:机试',
      },
      paperFile: { type: DataTypes.STRING(255), allowNull: true, field: 'paper_file', comment: '试卷文件存储路径' },
      paperFileName: { type: DataTypes.STRING(255), allowNull: true, field: 'paper_file_name', comment: '原始文件名' },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'updated_at' },
    },
    { tableName: 'exam', timestamps: false }
  );
};
