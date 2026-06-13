# 阶段一：系统架构与数据库设计

## 1. 数据库设计 (MySQL)

项目使用 **MySQL 8.0**，字符集 **CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci**，完整支持中文。后端 Sequelize 连接时指定 `charset: 'utf8mb4'`、`collate: 'utf8mb4_0900_ai_ci'`，API 响应头为 `Content-Type: application/json; charset=utf-8`。

### 建表（由 Sequelize sync 自动创建，等价于）

```sql
-- 管理员表
CREATE TABLE admin (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(64) NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 学生表
CREATE TABLE student (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_no VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL,
  password_hash VARCHAR(64) NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 课程表
CREATE TABLE course (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  credit INT NOT NULL DEFAULT 0,
  capacity INT NOT NULL DEFAULT 0
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 选课关联表
CREATE TABLE enrollment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES student(id),
  FOREIGN KEY (course_id) REFERENCES course(id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## 2. API 接口约定 (RESTful)

| 方法 | 路径 | 说明 | 请求体示例 |
|------|------|------|------------|
| POST | /api/auth/login | 登录（学生/管理员） | `{ "username", "password", "role": "student" \| "admin" }` |
| GET | /api/courses | 获取课程列表（支持 ?keyword=） | - |
| GET | /api/courses/:id | 获取课程详情 | - |
| GET | /api/students/:id/courses | 学生已选课程 | - |
| POST | /api/students/:id/enroll | 学生选课 | `{ "courseId": number }` |
| DELETE | /api/students/:id/enroll/:courseId | 学生退课 | - |
| GET | /api/admin/courses | 管理员-课程列表 | - |
| POST | /api/admin/courses | 管理员-新增课程 | `{ "code", "name", "credit", "capacity" }` |
| PUT | /api/admin/courses/:id | 管理员-更新课程 | 同上 |
| DELETE | /api/admin/courses/:id | 管理员-删除课程 | - |

统一响应格式：`{ "ok": boolean, "data"?: any, "message"?: string }`

## 3. 目录结构

```
/
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── index.js          # 入口、CORS、路由挂载
│   │   ├── db.js             # SQLite 连接、建表、Seed
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── courses.js
│   │   │   ├── enrollment.js
│   │   │   └── admin.js
│   │   └── middleware/
│   │       └── validate.js
│   └── Dockerfile
├── frontend/
│   ├── index.html            # 登录页
│   ├── student.html          # 学生-课程列表与选课
│   ├── admin.html            # 管理端-课程 CRUD
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── auth.js
│       ├── student.js
│       └── admin.js
├── docker-compose.yml
├── .gitignore
└── README.md
```
