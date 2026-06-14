-- SQLite 支持中文：使用 UTF-8 编码（默认），连接时显式设置 PRAGMA
PRAGMA encoding = 'UTF-8';
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS teacher (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS student (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS course (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  credit INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 0,
  lottery_mode INTEGER NOT NULL DEFAULT 0,
  schedules TEXT,
  exam_time TEXT,
  exam_duration INTEGER NOT NULL DEFAULT 120,
  teacher_id INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (teacher_id) REFERENCES teacher(id)
);
CREATE INDEX IF NOT EXISTS idx_course_teacher ON course(teacher_id);

CREATE TABLE IF NOT EXISTS exam (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  exam_time TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 120,
  location TEXT NOT NULL DEFAULT '',
  exam_type TEXT(16) NOT NULL DEFAULT 'closed',
  paper_file TEXT,
  paper_file_name TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (course_id) REFERENCES course(id),
  FOREIGN KEY (teacher_id) REFERENCES teacher(id)
);
CREATE INDEX IF NOT EXISTS idx_exam_course ON exam(course_id);
CREATE INDEX IF NOT EXISTS idx_exam_teacher ON exam(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exam_time ON exam(exam_time);

CREATE TABLE IF NOT EXISTS enrollment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  enrolled_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES student(id),
  FOREIGN KEY (course_id) REFERENCES course(id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_student ON enrollment(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_course ON enrollment(course_id);

CREATE TABLE IF NOT EXISTS attendance_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  code TEXT(6) NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 300,
  status TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (course_id) REFERENCES course(id)
);

CREATE TABLE IF NOT EXISTS attendance_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  sign_in_time TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(session_id, student_id),
  FOREIGN KEY (session_id) REFERENCES attendance_session(id),
  FOREIGN KEY (student_id) REFERENCES student(id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_session_course ON attendance_session(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session_code ON attendance_session(code);
CREATE INDEX IF NOT EXISTS idx_attendance_record_session ON attendance_record(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_record_student ON attendance_record(student_id);

CREATE TABLE IF NOT EXISTS lottery_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES student(id),
  FOREIGN KEY (course_id) REFERENCES course(id)
);

CREATE INDEX IF NOT EXISTS idx_lottery_entry_student ON lottery_entry(student_id);
CREATE INDEX IF NOT EXISTS idx_lottery_entry_course ON lottery_entry(course_id);

CREATE TABLE IF NOT EXISTS calendar_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  user_role TEXT(16) NOT NULL,
  title TEXT(200) NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  color TEXT(16) NOT NULL DEFAULT '#6366f1',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_event_user ON calendar_event(user_id, user_role);
CREATE INDEX IF NOT EXISTS idx_calendar_event_time ON calendar_event(start_time, end_time);

CREATE TABLE IF NOT EXISTS badge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  rule_type TEXT NOT NULL,
  rule_config TEXT,
  points INTEGER NOT NULL DEFAULT 10,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS student_badge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  badge_id INTEGER NOT NULL,
  earned_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(student_id, badge_id),
  FOREIGN KEY (student_id) REFERENCES student(id),
  FOREIGN KEY (badge_id) REFERENCES badge(id)
);

CREATE INDEX IF NOT EXISTS idx_student_badge_student ON student_badge(student_id);

CREATE TABLE IF NOT EXISTS point_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  action_detail TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (student_id) REFERENCES student(id)
);

CREATE INDEX IF NOT EXISTS idx_point_record_student ON point_record(student_id);
CREATE INDEX IF NOT EXISTS idx_point_record_created ON point_record(created_at);

CREATE TABLE IF NOT EXISTS course_evaluation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5,
  comment TEXT(500),
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES student(id),
  FOREIGN KEY (course_id) REFERENCES course(id)
);
