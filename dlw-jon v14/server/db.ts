import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('learning_platform.db');

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initDb() {
  // Users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      preferred_study_time_per_day INTEGER,
      exam_date TEXT,
      target_grade TEXT
    )
  `);

  // Subjects
  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject_name TEXT NOT NULL,
      exam_date TEXT,
      target_grade TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Migration: Add target_grade to subjects if it doesn't exist
  try {
    db.exec('ALTER TABLE subjects ADD COLUMN target_grade TEXT');
  } catch (e) {
    // Column likely already exists
  }

  // Topics
  db.exec(`
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      topic_name TEXT NOT NULL,
      description TEXT,
      goal TEXT,
      weight INTEGER DEFAULT 1,
      FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE
    )
  `);

  // Migration: Add description and goal columns if they don't exist
  try {
    db.exec('ALTER TABLE topics ADD COLUMN description TEXT');
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec('ALTER TABLE topics ADD COLUMN goal TEXT');
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec('ALTER TABLE topics ADD COLUMN mastery_score REAL');
  } catch (e) {
    // Column likely already exists
  }

  // Questions
  // Storing options as JSON string since SQLite doesn't have array types
  // Storing concept_tags as JSON string
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      options TEXT NOT NULL, 
      correct_answer TEXT NOT NULL,
      difficulty INTEGER CHECK(difficulty >= 1 AND difficulty <= 5),
      concept_tags TEXT,
      FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
    )
  `);

  // Attempts
  db.exec(`
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      topic_id INTEGER NOT NULL,
      selected_answer TEXT NOT NULL,
      correct BOOLEAN NOT NULL,
      time_spent_seconds INTEGER,
      difficulty INTEGER,
      attempt_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      session_id TEXT,
      ai_explanation TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
      FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
    )
  `);

  // Migration: Add session_id and ai_explanation columns if they don't exist
  try {
    db.exec('ALTER TABLE attempts ADD COLUMN session_id TEXT');
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec('ALTER TABLE attempts ADD COLUMN ai_explanation TEXT');
  } catch (e) {
    // Column likely already exists
  }

  // Migration: Add confidence_level column if it doesn't exist
  try {
    db.exec("ALTER TABLE attempts ADD COLUMN confidence_level TEXT CHECK(confidence_level IN ('low', 'medium', 'high'))");
  } catch (e) {
    // Column likely already exists
  }

  // Migration: Drop legacy careless_flag column (requires SQLite 3.35.0+)
  try {
    db.exec('ALTER TABLE attempts DROP COLUMN careless_flag');
  } catch (e) {
    // Column already removed or SQLite version too old — safe to ignore
  }

  // Migration: Add cached_explanation to questions
  try {
    db.exec('ALTER TABLE questions ADD COLUMN cached_explanation TEXT');
  } catch (e) {
    // Column likely already exists
  }

  // Contexts (text or parsed PDF content linked to a topic)
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      source_type TEXT NOT NULL,
      filename TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
    )
  `);

  // Documents
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
    )
  `);

  // Calendar Events
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      topic_id INTEGER,
      event_date TEXT NOT NULL,
      event_time TEXT NOT NULL,
      event_type TEXT DEFAULT 'study',
      title TEXT,
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE,
      FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE SET NULL
    )
  `);

  // Migration: Add event_type and title columns if they don't exist
  try {
    db.exec("ALTER TABLE calendar_events ADD COLUMN event_type TEXT DEFAULT 'study'");
  } catch (e) {
    // Column likely already exists
  }
  try {
    db.exec('ALTER TABLE calendar_events ADD COLUMN title TEXT');
  } catch (e) {
    // Column likely already exists
  }

  // Calendar AI chat history
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_ai_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  
  // Concept-level BKT mastery (persisted across sessions, updated after each quiz submission)
  db.exec(`
    CREATE TABLE IF NOT EXISTS concept_mastery (
      user_id INTEGER NOT NULL,
      concept_tag TEXT NOT NULL,
      mastery REAL NOT NULL DEFAULT 0.4,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, concept_tag),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Report insights cache (keyed by user + hash of report data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_insights_cache (
      user_id INTEGER NOT NULL,
      data_hash TEXT NOT NULL,
      insights TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, data_hash),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  console.log('Database initialized successfully');
}

export default db;
