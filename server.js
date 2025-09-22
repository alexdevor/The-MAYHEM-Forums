const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = './mayhem.db';
const SECRET = 'supersecretkey';

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set up SQLite DB
const db = new sqlite3.Database(DB_FILE);

// Create tables if not exist
const initDb = () => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    email TEXT,
    role TEXT DEFAULT 'user',
    post_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Ensure 'pfp' column exists
  db.get("PRAGMA table_info(users)", (err, info) => {
    if (err) return;
    db.all("PRAGMA table_info(users)", (err, columns) => {
      if (err) return;
      const hasPfp = columns.some(col => col.name === 'pfp');
      if (!hasPfp) {
        db.run("ALTER TABLE users ADD COLUMN pfp TEXT", (err) => {
          if (err) console.error('Failed to add pfp column:', err);
          else console.log("Added 'pfp' column to users table.");
        });
      }
    });
  });
// Update user profile picture
const pfpUpload = multer({ dest: 'public/uploads/' });
app.post('/api/profile/pfp', authenticateToken, pfpUpload.single('pfp'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const pfpUrl = `/uploads/${req.file.filename}`;
  db.run('UPDATE users SET pfp = ? WHERE id = ?', [pfpUrl, req.user.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update profile picture' });
    res.json({ success: true, pfp: pfpUrl });
  });
});
  db.run(`CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    content TEXT,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
    db.run(`CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      content TEXT,
      image TEXT,
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    // Ensure 'tags' column exists
    db.all("PRAGMA table_info(threads)", (err, columns) => {
      if (err) return;
      const hasTags = columns.some(col => col.name === 'tags');
      if (!hasTags) {
        db.run("ALTER TABLE threads ADD COLUMN tags TEXT", (err) => {
          if (err) console.error('Failed to add tags column:', err);
          else console.log("Added 'tags' column to threads table.");
        });
      }
    });
  db.run(`CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER,
    parent_reply_id INTEGER,
    user_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    FOREIGN KEY(thread_id) REFERENCES threads(id),
    FOREIGN KEY(parent_reply_id) REFERENCES replies(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    action TEXT,
    target_type TEXT,
    target_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(admin_id) REFERENCES users(id)
  )`);

  // Set user with email 'conor.mci@outlook.com' as admin if exists
  db.run(`UPDATE users SET role = 'admin' WHERE email = 'conor.mci@outlook.com'`);
};
initDb();

// Middleware for JWT authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Middleware for admin check
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  next();
}

// User signup
app.post('/api/signup', (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    db.run(
      'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
      [username, hash, email],
      function (err) {
        if (err) return res.status(400).json({ error: 'Username taken' });
        res.json({ success: true });
      }
    );
  });
});

// User login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Invalid credentials' });
    bcrypt.compare(password, user.password_hash, (err, result) => {
      if (!result) return res.status(400).json({ error: 'Invalid credentials' });
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET);
      res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    });
  });
});

// Get user profile
app.get('/api/profile', authenticateToken, (req, res) => {
  db.get('SELECT id, username, email, role, post_count, created_at, pfp FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
});

// Public user info (no email)
app.get('/api/user/:id', (req, res) => {
  db.get('SELECT id, username, role, post_count, created_at, pfp FROM users WHERE id = ?', [req.params.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
});

// Create thread (with optional image upload)
const upload = multer({ dest: 'public/uploads/' });
app.post('/api/threads', authenticateToken, upload.single('image'), (req, res) => {
  const { title, content, tags } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  if (!req.user || !req.user.id) {
    console.error('No user info in JWT:', req.user);
    return res.status(401).json({ error: 'User not authenticated' });
  }
  if (!title || !content) {
    console.error('Missing title or content:', { title, content });
    return res.status(400).json({ error: 'Title and content are required.' });
  }
  db.run(
    'INSERT INTO threads (user_id, title, content, image, tags) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, title, content, image, tags || ''],
    function (err) {
      if (err) {
        console.error('DB error creating thread:', err);
        return res.status(500).json({ error: 'Failed to create thread', details: err.message });
      }
      // Increment post_count for user
      db.run('UPDATE users SET post_count = post_count + 1 WHERE id = ?', [req.user.id]);
      res.json({ id: this.lastID });
    }
  );
});

// Get all threads with nested replies
app.get('/api/threads', (req, res) => {
  db.all('SELECT t.*, u.username, u.role, u.pfp FROM threads t JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC', [], (err, threads) => {
    if (err) {
      console.error('Error fetching threads:', err);
      return res.status(500).json({ error: 'Failed to fetch threads', details: err.message });
    }
    if (!threads || threads.length === 0) return res.json([]);
    let count = threads.length;
    let done = false;
    threads.forEach((thread, i) => {
      db.all('SELECT r.*, u.username, u.role, u.pfp FROM replies r JOIN users u ON r.user_id = u.id WHERE r.thread_id = ? ORDER BY r.created_at ASC', [thread.id], (err, replies) => {
        if (err) {
          console.error('Error fetching replies for thread', thread.id, ':', err);
          thread.replies = [];
        } else {
          thread.replies = buildReplyTree(replies);
        }
        thread.created_at_formatted = new Date(thread.created_at).toLocaleString();
        thread.updated_at_formatted = thread.updated_at ? new Date(thread.updated_at).toLocaleString() : null;
        count--;
        if (count === 0 && !done) {
          done = true;
          res.json(threads);
        }
      });
    });
    setTimeout(() => {
      if (!done) {
        done = true;
        threads.forEach(thread => {
          thread.created_at_formatted = new Date(thread.created_at).toLocaleString();
          thread.updated_at_formatted = thread.updated_at ? new Date(thread.updated_at).toLocaleString() : null;
        });
        res.json(threads);
      }
    }, 300);
  });
});

// Helper: build nested reply tree
function buildReplyTree(replies) {
  const map = {};
  replies.forEach(r => (map[r.id] = { ...r, children: [] }));
  const tree = [];
  replies.forEach(r => {
    if (r.parent_reply_id) {
      map[r.parent_reply_id]?.children.push(map[r.id]);
    } else {
      tree.push(map[r.id]);
    }
  });
  return tree;
}

// Create reply (to thread or reply)
app.post('/api/replies', authenticateToken, (req, res) => {
  const { thread_id, parent_reply_id, content } = req.body;
  db.run(
    'INSERT INTO replies (thread_id, parent_reply_id, user_id, content) VALUES (?, ?, ?, ?)',
    [thread_id, parent_reply_id || null, req.user.id, content],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to reply' });
      // Increment post_count for user
      db.run('UPDATE users SET post_count = post_count + 1 WHERE id = ?', [req.user.id]);
      res.json({ id: this.lastID });
    }
  );
});

// Admin: edit or delete thread/reply, ban user
app.put('/api/admin/thread/:id', authenticateToken, requireAdmin, (req, res) => {
  const { title, content } = req.body;
  db.run('UPDATE threads SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, content, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update thread' });
    res.json({ success: true });
  });
});
app.delete('/api/admin/thread/:id', authenticateToken, requireAdmin, (req, res) => {
  console.log('Attempting to delete thread:', req.params.id, 'by user:', req.user);
  db.run('DELETE FROM threads WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      console.error('Failed to delete thread:', err);
      return res.status(500).json({ error: 'Failed to delete thread' });
    }
    if (this.changes === 0) {
      console.warn('No thread deleted. Thread may not exist:', req.params.id);
      return res.json({ success: false, error: 'Thread not found or not deleted.' });
    }
    console.log('Thread deleted:', req.params.id);
    res.json({ success: true });
  });
});
app.put('/api/admin/reply/:id', authenticateToken, requireAdmin, (req, res) => {
  const { content } = req.body;
  db.run('UPDATE replies SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [content, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update reply' });
    res.json({ success: true });
  });
});
app.delete('/api/admin/reply/:id', authenticateToken, requireAdmin, (req, res) => {
  db.run('DELETE FROM replies WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete reply' });
    res.json({ success: true });
  });
});
app.post('/api/admin/ban/:id', authenticateToken, requireAdmin, (req, res) => {
  db.run('UPDATE users SET role = "banned" WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to ban user' });
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`The MAYHEM Forum running on http://localhost:${PORT}`);
});
