import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(process.cwd(), 'watcharr.db');

// Function to initialize database
function initializeDatabase(db) {
  try {
    // Enable foreign keys
    db.pragma('foreign_keys = ON');

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS list_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER,
    title_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ratings (
    title_id TEXT PRIMARY KEY,
    score REAL CHECK(score >= 0 AND score <= 10),
    review TEXT,
    rated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create default lists if they don't exist
const defaultLists = ['Watched', 'Watching', 'To Watch', 'Favorites'];
const insertList = db.prepare('INSERT OR IGNORE INTO lists (name) VALUES (?)');

defaultLists.forEach(listName => {
  insertList.run(listName);
});
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// Function to check if database is corrupted and recover
function getDatabase() {
  let db;
  
  try {
    // Try to open the database
    db = new Database(dbPath);
    
    // Test if database is accessible by running a simple query
    db.prepare('SELECT 1').get();
    
    // Initialize if needed
    initializeDatabase(db);
    
    return db;
  } catch (error) {
    // If database is corrupted, backup and recreate
    if (error.code === 'SQLITE_CORRUPT' || error.message.includes('malformed')) {
      console.warn('Database corrupted, recreating...');
      
      // Close the corrupted database if it was opened
      if (db) {
        try {
          db.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      
      // Backup corrupted database
      const backupPath = `${dbPath}.corrupted.${Date.now()}`;
      if (fs.existsSync(dbPath)) {
        try {
          fs.copyFileSync(dbPath, backupPath);
          console.log(`Corrupted database backed up to: ${backupPath}`);
        } catch (e) {
          console.warn('Could not backup corrupted database:', e);
        }
      }
      
      // Remove corrupted database
      try {
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }
      } catch (e) {
        console.warn('Could not remove corrupted database:', e);
      }
      
      // Create new database
      db = new Database(dbPath);
      initializeDatabase(db);
      
      console.log('Database recreated successfully');
      return db;
    }
    
    // Re-throw other errors
    throw error;
  }
}

const db = getDatabase();

export default db;
