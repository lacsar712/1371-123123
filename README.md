# 学生选课系统

## 🛠 技术栈

- **Frontend**: 纯静态 HTML + 原生 CSS + 原生 JavaScript
- **Backend**: Node.js + Express + Sequelize
- **Database**: SQLite（UTF-8 编码，完整支持中文）

## 🚀 启动指南 (How to Run)

1. 确保 Docker Desktop 已启动。
2. 在根目录执行：`docker compose up --build`
3. 等待容器启动完成（后端会自动创建 SQLite 数据库并执行建表与 Seed）。

## 🔗 服务地址 (Services)

- **Frontend**: http://localhost:31371
- **Backend API**: http://localhost:8137
- **Database**: SQLite 文件挂载于后端容器 `/app/data/course.sqlite`（通过 Volume `backend_data` 持久化）

## 🧪 测试账号

| 角色   | 用户名/学号 | 密码   |
|--------|-------------|--------|
| 管理员 | admin       | 123456 |
| 学生   | S2024001    | 123456 |
| 学生   | S2024002    | 123456 |
| 学生   | S2024003    | 123456 |

## 数据库与字符集

- 使用 **SQLite 3**，默认 **UTF-8** 编码，完整支持中文。
- 数据文件路径可通过环境变量 `SQLITE_PATH` 配置（默认 `backend/data/course.sqlite`）。
- API 响应头统一为：`Content-Type: application/json; charset=utf-8`。

## 项目结构

```
├── backend/           # Node + Express + Sequelize
│   ├── src/
│   │   ├── index.js   # 入口、CORS、路由
│   │   ├── logger.js  # Winston 日志
│   │   ├── db.js      # 密码哈希
│   │   ├── seed.js    # 建表 + Seed
│   │   ├── models/    # Sequelize 模型
│   │   ├── routes/    # auth / courses / enrollment / admin
│   │   └── middleware/
│   ├── Dockerfile
│   └── package.json
├── frontend/           # 纯静态 HTML + CSS + JS
│   ├── index.html      # 登录页（表单直接调用后端 API）
│   ├── student.html    # 学生端课程选课页面
│   ├── admin.html      # 管理端课程管理页面
│   ├── css/style.css   # 所有页面共用的样式
│   ├── js/auth.js      # 登录逻辑（原生 JS，fetch 调用后端）
│   ├── js/student.js   # 学生端操作逻辑
│   ├── js/admin.js     # 管理端操作逻辑
│   ├── nginx.conf      # 代理 /api 到 backend
│   └── Dockerfile
├── docker-compose.yml  # backend（SQLite）+ frontend
└── README.md
```

## Docker 构建说明

- 前端为纯静态资源（HTML/CSS/JS），无需 npm 构建，直接由 Nginx 托管。
- 后端使用 `npm ci` 安装依赖。
- SQLite 数据持久化：Volume `backend_data`（挂载到后端 `/app/data`）。
- 前端通过 Nginx 将 `/api` 代理到 `http://backend:8137`，浏览器访问同一域名无需 CORS。
