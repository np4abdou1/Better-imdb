import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || 'better-imdb.db');

function initializeDatabase(db) {
  try {
    db.pragma('foreign_keys = OFF'); // Disable momentarily for migrations

    // 1. Users Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        image TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Check for schema migration needs
    const listTableExists = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='lists'").get().count > 0;
    
    if (!listTableExists) {
      // Create new schema directly if table doesn't exist
      db.exec(`
        CREATE TABLE lists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_lists_user_id ON lists(user_id);
      `);
    } else {
      const listColumns = db.pragma('table_info(lists)');
      const hasUserIdInLists = listColumns.some(c => c.name === 'user_id');

      if (!hasUserIdInLists) {
        console.log('Migrating lists table to multi-user schema...');
        db.exec(`
          CREATE TABLE lists_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          );
          
          -- Copy existing data (orphaned lists will have NULL user_id)
          INSERT INTO lists_new (id, name, created_at) SELECT id, name, created_at FROM lists;
          
          DROP TABLE lists;
          ALTER TABLE lists_new RENAME TO lists;
          
          -- Add index for user-scoped lists
          CREATE INDEX idx_lists_user_id ON lists(user_id);
        `);
      }
    }

    const ratingsTableExists = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='ratings'").get().count > 0;

    if (!ratingsTableExists) {
      db.exec(`
        CREATE TABLE ratings (
          user_id TEXT,
          title_id TEXT,
          score REAL CHECK(score >= 0 AND score <= 10),
          review TEXT,
          rated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, title_id),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
    } else {
      const ratingsColumns = db.pragma('table_info(ratings)');
      const hasUserIdInRatings = ratingsColumns.some(c => c.name === 'user_id');
  
      if (!hasUserIdInRatings) {
        console.log('Migrating ratings table to multi-user schema...');
        db.exec(`
          CREATE TABLE ratings_new (
            user_id TEXT,
            title_id TEXT,
            score REAL CHECK(score >= 0 AND score <= 10),
            review TEXT,
            rated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, title_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          );
          
          INSERT OR IGNORE INTO ratings_new (user_id, title_id, score, review, rated_at) 
          SELECT 'legacy', title_id, score, review, rated_at FROM ratings;
          
          DROP TABLE ratings;
          ALTER TABLE ratings_new RENAME TO ratings;
        `);
      }
    }

    // Re-enable Foreign Keys
    db.pragma('foreign_keys = ON');

    // Standard tables (idempotent)
    db.exec(`
      CREATE TABLE IF NOT EXISTS list_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER,
        title_id TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE
      );
    `);

    // AI Chat History
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_chats (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(chat_id) REFERENCES ai_chats(id) ON DELETE CASCADE
      );
    `);

    // Performance indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_list_items_list_id ON list_items(list_id);
      CREATE INDEX IF NOT EXISTS idx_list_items_title_id ON list_items(title_id);
      CREATE INDEX IF NOT EXISTS idx_lists_created_at ON lists(created_at);
      CREATE INDEX IF NOT EXISTS idx_ai_chats_user_id ON ai_chats(user_id);
      CREATE INDEX IF NOT EXISTS idx_ai_messages_chat_id ON ai_messages(chat_id);
    `);

    // We no longer create default list globally. We create them per-user on signup.

    // Create test user if not exists
    const testUser = db.prepare('SELECT * FROM users WHERE id = ?').get('test-user-123');
    if (!testUser) {
      console.log('Creating test user...');
      db.exec(`
        INSERT OR IGNORE INTO users (id, name, email, image) 
        VALUES ('test-user-123', 'Test User', 'test@better-imdb.dev', NULL);
      `);
      
      // Create default lists for test user
      const defaultLists = ['Watched', 'Watching', 'To Watch', 'Favorites'];
      const insertList = db.prepare('INSERT OR IGNORE INTO lists (user_id, name) VALUES (?, ?)');
      defaultLists.forEach(name => insertList.run('test-user-123', name));
    }

  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

function getDatabase() {
  let db;
  try {
    db = new Database(dbPath);
  } catch (err) {
    if (err.code === 'SQLITE_CORRUPT') {
      console.error('Database corrupt, recreating...');
      const corruptPath = `${dbPath}.corrupted.${Date.now()}`;
      fs.renameSync(dbPath, corruptPath);
      db = new Database(dbPath);
    } else {
      throw err;
    }
  }
  
  db.pragma('journal_mode = WAL');
  initializeDatabase(db);
  return db;
}

const db = getDatabase();

// DB Accessors for Auth
export const createUser = (user) => {
  const stmt = db.prepare('INSERT INTO users (id, name, email, image) VALUES (?, ?, ?, ?)');
  stmt.run(user.id, user.name, user.email, user.image);
  return user;
};

export const getUserByEmail = (email) => {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
};

export const getUserById = (id) => {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
};

export default db;
