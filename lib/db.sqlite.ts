import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Define interfaces for tables
export interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  copilot_token: string | null;
  created_at: string;
}

export interface List {
  id: number;
  user_id: string | null;
  name: string;
  created_at: string;
}

export interface Rating {
  user_id: string;
  title_id: string;
  score: number | null;
  review: string | null;
  rated_at: string;
}

export interface ListItem {
  id: number;
  list_id: number;
  title_id: string;
  added_at: string;
}

export interface AIChat {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface StreamMapping {
  imdb_id: string;
  provider_id: string | null;
  type: string | null;
  cached_stream_url: string | null;
  expires_at: number | null;
  metadata: string | null;
  created_at: string;
}

// Wrapper types
type RunResult = Database.RunResult;

interface DBWrapper extends Database.Database {
   // Add specific overrides if necessary, otherwise it inherits from Database.Database
}

const defaultDbPath = process.env.VERCEL ? '/tmp/better-imdb.db' : 'better-imdb.db';
const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || defaultDbPath);

function initializeDatabase(db: Database.Database) {
  try {
    db.pragma('foreign_keys = OFF'); // Disable momentarily for migrations

    // 1. Users Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        image TEXT,
        copilot_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: Add copilot_token to users if it doesn't exist
    const userColumns = db.pragma('table_info(users)') as Array<{ name: string }>;
    const hasCopilotToken = userColumns.some(c => c.name === 'copilot_token');
    if (!hasCopilotToken) {
      console.log('Adding copilot_token column to users...');
      db.exec('ALTER TABLE users ADD COLUMN copilot_token TEXT');
    }

    // 2. Check for schema migration needs
    const listTableExists = (db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='lists'").get() as { count: number }).count > 0;
    
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
      const listColumns = db.pragma('table_info(lists)') as Array<{ name: string }>;
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

    const ratingsTableExists = (db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='ratings'").get() as { count: number }).count > 0;

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
      const ratingsColumns = db.pragma('table_info(ratings)') as Array<{ name: string }>;
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

      -- Stream Mappings Table
      CREATE TABLE IF NOT EXISTS stream_mappings (
        imdb_id TEXT PRIMARY KEY,
        provider_id TEXT,
        type TEXT,
        cached_stream_url TEXT,
        expires_at INTEGER,
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    const testUser = db.prepare('SELECT * FROM users WHERE id = ?').get('test-user-123') as User | undefined;
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

function getDatabase(): Database.Database {
  let db: Database.Database;
  try {
    db = new Database(dbPath);
  } catch (err: any) {
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

export interface CreateUserParams {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

// DB Accessors for Auth
export const createUser = (user: CreateUserParams): CreateUserParams => {
  const stmt = db.prepare('INSERT INTO users (id, name, email, image) VALUES (?, ?, ?, ?)');
  stmt.run(user.id, user.name, user.email, user.image);
  return user;
};

export const getUserByEmail = (email: string): User | undefined => {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
};

export const getUserById = (id: string): User | undefined => {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
};

export const updateUserCopilotToken = (userId: string, token: string): RunResult => {
  const stmt = db.prepare('UPDATE users SET copilot_token = ? WHERE id = ?');
  return stmt.run(token, userId);
};

export default db;
