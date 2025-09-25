<<<<<<< HEAD
const express = require('express');
const path = require('path'); // MUST be declared BEFORE using it
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = './mayhem.db';
const SECRET = 'supersecretkey';

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const upload = multer({ dest: uploadDir });
const pfpUpload = multer({ dest: uploadDir });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files with error logging
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path, stat) => {
        res.set('Cache-Control', 'no-cache');
    }
}));

app.use((req, res, next) => {
    console.log('Request:', req.method, req.url);
    next();
});

// Set up SQLite DB
const db = new sqlite3.Database(DB_FILE);

// Create tables if not exist
const initDb = () => {
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  db.serialize(() => {
    // Create tables without dropping existing ones to preserve data
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'user',
      post_count INTEGER DEFAULT 0,
      pfp TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS communities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      banner_image TEXT,
      rules TEXT,
      member_count INTEGER DEFAULT 0,
      is_private BOOLEAN DEFAULT 0,
      FOREIGN KEY(creator_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS community_moderators (
      community_id INTEGER,
      user_id INTEGER,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      added_by INTEGER,
      PRIMARY KEY (community_id, user_id),
      FOREIGN KEY(community_id) REFERENCES communities(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(added_by) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS community_members (
      community_id INTEGER,
      user_id INTEGER,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (community_id, user_id),
      FOREIGN KEY(community_id) REFERENCES communities(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      community_id INTEGER,
      title TEXT,
      content TEXT,
      image TEXT,
      tags TEXT,
      pinned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(community_id) REFERENCES communities(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER,
      parent_reply_id INTEGER,
      user_id INTEGER,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_reply_id) REFERENCES replies(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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

    // Create triggers to maintain member_count
    db.run(`
      CREATE TRIGGER IF NOT EXISTS increment_member_count
      AFTER INSERT ON community_members
      BEGIN
        UPDATE communities 
        SET member_count = member_count + 1
        WHERE id = NEW.community_id;
      END;
    `);

    db.run(`
      CREATE TRIGGER IF NOT EXISTS decrement_member_count
      AFTER DELETE ON community_members
      BEGIN
        UPDATE communities 
        SET member_count = member_count - 1
        WHERE id = OLD.community_id;
      END;
    `);

    // Create admin account if it doesn't exist, or update existing one
    db.get('SELECT id FROM users WHERE email = ? OR username = ?', ['conor.mci@outlook.com', 'admin'], (err, user) => {
      if (!err) {
        if (user) {
          // Update existing user to be admin and update password
          bcrypt.hash('XXmayhemXX', 10, (err, hash) => {
            if (err) {
              console.error('Failed to update admin password hash:', err);
              return;
            }
            db.run(`UPDATE users SET role = 'admin', email = ?, username = ?, password_hash = ? WHERE id = ?`, 
              ['conor.mci@outlook.com', 'admin', hash, user.id], (err) => {
                if (err) console.error('Failed to update admin user:', err);
                else console.log('Updated admin user successfully with new password');
              });
          });
        } else {
          // Create new admin user with password 'XXmayhemXX'
          bcrypt.hash('XXmayhemXX', 10, (err, hash) => {
            if (err) {
              console.error('Failed to create admin password hash:', err);
              return;
            }
            db.run(`INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')`,
              ['admin', 'conor.mci@outlook.com', hash], function(err) {
                if (err) console.error('Failed to create admin user:', err);
                else console.log('Created admin user successfully');
              });
          });
        }
      }
    });

    // Create default "General Discussion" community if it doesn't exist
    db.get('SELECT id FROM communities WHERE name = ?', ['General Discussion'], (err, community) => {
      if (!err && !community) {
        db.run(`
          INSERT INTO communities (name, description, rules) 
          VALUES (?, ?, ?)
        `, [
          'General Discussion',
          'Welcome to the General Discussion community! This is the default community for all forum members.',
          '1. Be respectful to others\n2. No spam or self-promotion\n3. Stay on topic'
        ], function(err) {
          if (err) console.error('Error creating default community:', err);
          else console.log('Created default community');
        });
      }
    });

    console.log('Database schema and triggers updated successfully');
  });
};

// Initialize database
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

// Update user profile picture
app.post('/api/profile/pfp', authenticateToken, pfpUpload.single('pfp'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const pfpUrl = `/uploads/${req.file.filename}`;
  db.run('UPDATE users SET pfp = ? WHERE id = ?', [pfpUrl, req.user.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update profile picture' });
    res.json({ success: true, pfp: pfpUrl });
  });
});

// Create thread (with optional image upload)
app.post('/api/threads', authenticateToken, upload.single('image'), (req, res) => {
  const { title, content, tags, community_id } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  
  if (!req.user || !req.user.id) {
    console.error('No user info in JWT:', req.user);
    return res.status(401).json({ error: 'User not authenticated' });
  }
  if (!title || !content) {
    console.error('Missing title or content:', { title, content });
    return res.status(400).json({ error: 'Title and content are required.' });
  }
  
  // If no community_id provided, use General Discussion community
  const getCommunityId = () => {
    if (community_id) return Promise.resolve(community_id);
    return new Promise((resolve, reject) => {
      db.get('SELECT id FROM communities WHERE name = ?', ['General Discussion'], (err, row) => {
        if (err) reject(err);
        else if (!row) reject(new Error('Default community not found'));
        else resolve(row.id);
      });
    });
  };

  getCommunityId()
    .then(finalCommunityId => {
      db.run(
        'INSERT INTO threads (user_id, community_id, title, content, image, tags) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, finalCommunityId, title, content, image, tags || ''],
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
    })
    .catch(err => {
      console.error('Error creating thread:', err);
      res.status(500).json({ error: 'Failed to create thread', details: err.message });
    });
});

// Get recent threads across all communities
app.get('/api/threads', (req, res) => {
  // First, check if we have any communities
  db.get('SELECT COUNT(*) as count FROM communities', [], (err, result) => {
    if (err) {
      console.error('Error checking communities:', err);
      return res.status(500).json({ error: 'Database error', details: err.message });
    }

    if (result.count === 0) {
      // No communities exist yet
      return res.json([]);
    }

    // We have communities, now get threads
    db.all(`
      SELECT t.*, u.username, u.role, u.pfp, c.name as community_name 
      FROM threads t 
      LEFT JOIN users u ON t.user_id = u.id 
      LEFT JOIN communities c ON t.community_id = c.id 
      WHERE t.community_id IS NOT NULL
      ORDER BY t.pinned DESC, t.created_at DESC 
      LIMIT 20
    `, [], (err, threads) => {
      if (err) {
        console.error('Error fetching threads:', err);
        return res.status(500).json({ error: 'Failed to fetch threads', details: err.message });
      }

      if (!threads || threads.length === 0) {
        return res.json([]);
      }

      // Process threads sequentially to avoid race conditions
      const processThread = (index) => {
        if (index >= threads.length) {
          return res.json(threads);
        }

        const thread = threads[index];
        db.all(
          'SELECT r.*, u.username, u.role, u.pfp FROM replies r LEFT JOIN users u ON r.user_id = u.id WHERE r.thread_id = ? ORDER BY r.created_at ASC',
          [thread.id],
          (err, replies) => {
            thread.replies = err ? [] : buildReplyTree(replies);
            thread.created_at_formatted = new Date(thread.created_at).toLocaleString();
            thread.updated_at_formatted = thread.updated_at ? new Date(thread.updated_at).toLocaleString() : null;
            thread.pinned = thread.pinned ? 1 : 0;
            processThread(index + 1);
          }
        );
      };

      processThread(0);
    });
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
// Pin/unpin thread
app.post('/api/admin/pin/:id', authenticateToken, requireAdmin, (req, res) => {
  console.log('Admin pin request:', req.params.id, 'by user:', req.user);
  db.run('UPDATE threads SET pinned = 1 WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      console.error('Failed to pin thread:', err);
      return res.status(500).json({ error: 'Failed to pin thread' });
    }
    console.log('Thread pinned successfully:', req.params.id);
    db.run('INSERT INTO admin_logs (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.user.id, 'pin', 'thread', req.params.id]);
    res.json({ success: true });
  });
});

app.post('/api/admin/unpin/:id', authenticateToken, requireAdmin, (req, res) => {
  console.log('Admin unpin request:', req.params.id, 'by user:', req.user);
  db.run('UPDATE threads SET pinned = 0 WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      console.error('Failed to unpin thread:', err);
      return res.status(500).json({ error: 'Failed to unpin thread' });
    }
    console.log('Thread unpinned successfully:', req.params.id);
    db.run('INSERT INTO admin_logs (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.user.id, 'unpin', 'thread', req.params.id]);
    res.json({ success: true });
  });
});

app.put('/api/admin/thread/:id', authenticateToken, requireAdmin, (req, res) => {
  console.log('Admin edit thread request:', req.params.id, 'by user:', req.user);
  const { title, content } = req.body;
  
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }
  
  db.run('UPDATE threads SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
    [title, content, req.params.id], 
    function (err) {
      if (err) {
        console.error('Failed to update thread:', err);
        return res.status(500).json({ error: 'Failed to update thread' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      
      // Log admin action
      db.run('INSERT INTO admin_logs (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.id, 'edit_thread', 'thread', req.params.id]);
      
      console.log('Thread updated successfully:', req.params.id);
      res.json({ success: true });
    }
  );
});

app.delete('/api/admin/thread/:id', authenticateToken, requireAdmin, (req, res) => {
  console.log('Attempting to delete thread:', req.params.id, 'by user:', req.user);
  // First get thread details for logging
  db.get('SELECT title FROM threads WHERE id = ?', [req.params.id], (err, thread) => {
    if (err) {
      console.error('Error fetching thread details:', err);
      return res.status(500).json({ error: 'Failed to fetch thread details' });
    }
    
    db.run('DELETE FROM threads WHERE id = ?', [req.params.id], function (err) {
      if (err) {
        console.error('Failed to delete thread:', err);
        return res.status(500).json({ error: 'Failed to delete thread' });
      }
      if (this.changes === 0) {
        console.warn('No thread deleted. Thread may not exist:', req.params.id);
        return res.json({ success: false, error: 'Thread not found or not deleted.' });
      }
      
      // Log admin action
      db.run('INSERT INTO admin_logs (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.id, 'delete_thread', 'thread', req.params.id]);
        
      console.log('Thread deleted:', req.params.id);
      res.json({ success: true });
    });
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

// Community endpoints
app.post('/api/communities', authenticateToken, (req, res) => {
  const { name, description, rules, is_private } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'Name and description are required' });
  }

  db.run(
    'INSERT INTO communities (name, description, creator_id, rules, is_private) VALUES (?, ?, ?, ?, ?)',
    [name, description, req.user.id, rules || '', is_private ? 1 : 0],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Community name already exists' });
        }
        return res.status(500).json({ error: 'Failed to create community' });
      }
      const communityId = this.lastID;
      
      // Add creator as member and moderator
      db.run('INSERT INTO community_members (community_id, user_id) VALUES (?, ?)', [communityId, req.user.id]);
      db.run('INSERT INTO community_moderators (community_id, user_id, added_by) VALUES (?, ?, ?)', 
        [communityId, req.user.id, req.user.id]);
      
      res.json({ id: communityId });
    }
  );
});

app.get('/api/communities', (req, res) => {
  console.log('Fetching communities...');
  
  // First, ensure the General Discussion community exists
  db.get('SELECT id FROM communities WHERE name = ?', ['General Discussion'], (err, community) => {
    if (err) {
      console.error('Error checking for General Discussion:', err);
      return res.status(500).json({ error: 'Database error', details: err.message });
    }
    
    if (!community) {
      console.log('Creating missing General Discussion community...');
      db.run(`
        INSERT INTO communities (name, description, rules) 
        VALUES (?, ?, ?)
      `, [
        'General Discussion',
        'Welcome to the General Discussion community! This is the default community for all forum members.',
        '1. Be respectful to others\n2. No spam or self-promotion\n3. Stay on topic'
      ]);
    }
    
    // Now fetch all communities with their stats
    db.all(`
      SELECT 
        c.*,
        u.username as creator_name,
        COALESCE(cm.member_count, 0) as member_count,
        COALESCE(t.thread_count, 0) as thread_count,
        CASE 
          WHEN c.name = 'General Discussion' THEN 1 
          ELSE 0 
        END as is_general
      FROM communities c
      LEFT JOIN users u ON c.creator_id = u.id
      LEFT JOIN (SELECT community_id, COUNT(*) as member_count FROM community_members GROUP BY community_id) cm ON cm.community_id = c.id
      LEFT JOIN (SELECT community_id, COUNT(*) as thread_count FROM threads GROUP BY community_id) t ON t.community_id = c.id
      ORDER BY is_general DESC, c.created_at DESC
    `, [], (err, communities) => {
      if (err) {
        console.error('Error fetching communities:', err);
        return res.status(500).json({ error: 'Failed to fetch communities', details: err.message });
      }
      
      if (!communities) {
        console.warn('No communities found in database');
        return res.json([]);
      }
      
      console.log(`Found ${communities.length} communities`);
      res.json(communities);
    });
  });
});

// Fallback route: serve index.html for all unknown GET requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`The MAYHEM Forum running on http://localhost:${PORT}`);
});

app.get('/api/communities/:id', (req, res) => {
  db.get(`
    SELECT c.*, u.username as creator_name,
           COUNT(DISTINCT cm.user_id) as member_count,
           COUNT(DISTINCT t.id) as thread_count
    FROM communities c
    LEFT JOIN users u ON c.creator_id = u.id
    LEFT JOIN community_members cm ON c.id = cm.community_id
    LEFT JOIN threads t ON c.id = t.community_id
    WHERE c.id = ?
    GROUP BY c.id
  `, [req.params.id], (err, community) => {
    if (err || !community) return res.status(404).json({ error: 'Community not found' });
    res.json(community);
  });
});

app.post('/api/communities/:id/join', authenticateToken, (req, res) => {
  db.run('INSERT INTO community_members (community_id, user_id) VALUES (?, ?)',
    [req.params.id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to join community' });
      res.json({ success: true });
    }
  );
});

app.post('/api/communities/:id/leave', authenticateToken, (req, res) => {
  db.run('DELETE FROM community_members WHERE community_id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to leave community' });
      res.json({ success: true });
    }
  );
});

// Get threads for a specific community
app.get('/api/communities/:id/threads', (req, res) => {
  db.all(`
    SELECT t.*, u.username, u.role, u.pfp 
    FROM threads t 
    JOIN users u ON t.user_id = u.id 
    WHERE t.community_id = ?
    ORDER BY t.pinned DESC, t.created_at DESC
  `, [req.params.id], (err, threads) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch threads' });
    if (!threads || threads.length === 0) return res.json([]);

    let count = threads.length;
    let done = false;

    threads.forEach((thread, i) => {
      db.all('SELECT r.*, u.username, u.role, u.pfp FROM replies r JOIN users u ON r.user_id = u.id WHERE r.thread_id = ? ORDER BY r.created_at ASC', 
        [thread.id], (err, replies) => {
          if (err) {
            thread.replies = [];
          } else {
            thread.replies = buildReplyTree(replies);
          }
          thread.created_at_formatted = new Date(thread.created_at).toLocaleString();
          count--;
          if (count === 0 && !done) {
            done = true;
            res.json(threads);
          }
        });
    });
  });
});

// Start server
=======
const express = require('express');
const path = require('path'); // MUST be declared BEFORE using it
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = './mayhem.db';
const SECRET = 'supersecretkey';

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const upload = multer({ dest: uploadDir });
const pfpUpload = multer({ dest: uploadDir });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files with error logging
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path, stat) => {
        res.set('Cache-Control', 'no-cache');
    }
}));

app.use((req, res, next) => {
    console.log('Request:', req.method, req.url);
    next();
});

// Set up SQLite DB
const db = new sqlite3.Database(DB_FILE);

// Create tables if not exist
const initDb = () => {
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  db.serialize(() => {
    // Create tables without dropping existing ones to preserve data
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'user',
      post_count INTEGER DEFAULT 0,
      pfp TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS communities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      banner_image TEXT,
      rules TEXT,
      member_count INTEGER DEFAULT 0,
      is_private BOOLEAN DEFAULT 0,
      FOREIGN KEY(creator_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS community_moderators (
      community_id INTEGER,
      user_id INTEGER,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      added_by INTEGER,
      PRIMARY KEY (community_id, user_id),
      FOREIGN KEY(community_id) REFERENCES communities(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(added_by) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS community_members (
      community_id INTEGER,
      user_id INTEGER,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (community_id, user_id),
      FOREIGN KEY(community_id) REFERENCES communities(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      community_id INTEGER,
      title TEXT,
      content TEXT,
      image TEXT,
      tags TEXT,
      pinned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(community_id) REFERENCES communities(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER,
      parent_reply_id INTEGER,
      user_id INTEGER,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_reply_id) REFERENCES replies(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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

    // Create triggers to maintain member_count
    db.run(`
      CREATE TRIGGER IF NOT EXISTS increment_member_count
      AFTER INSERT ON community_members
      BEGIN
        UPDATE communities 
        SET member_count = member_count + 1
        WHERE id = NEW.community_id;
      END;
    `);

    db.run(`
      CREATE TRIGGER IF NOT EXISTS decrement_member_count
      AFTER DELETE ON community_members
      BEGIN
        UPDATE communities 
        SET member_count = member_count - 1
        WHERE id = OLD.community_id;
      END;
    `);

    // Create admin account if it doesn't exist, or update existing one
    db.get('SELECT id FROM users WHERE email = ? OR username = ?', ['conor.mci@outlook.com', 'admin'], (err, user) => {
      if (!err) {
        if (user) {
          // Update existing user to be admin and update password
          bcrypt.hash('XXmayhemXX', 10, (err, hash) => {
            if (err) {
              console.error('Failed to update admin password hash:', err);
              return;
            }
            db.run(`UPDATE users SET role = 'admin', email = ?, username = ?, password_hash = ? WHERE id = ?`, 
              ['conor.mci@outlook.com', 'admin', hash, user.id], (err) => {
                if (err) console.error('Failed to update admin user:', err);
                else console.log('Updated admin user successfully with new password');
              });
          });
        } else {
          // Create new admin user with password 'XXmayhemXX'
          bcrypt.hash('XXmayhemXX', 10, (err, hash) => {
            if (err) {
              console.error('Failed to create admin password hash:', err);
              return;
            }
            db.run(`INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')`,
              ['admin', 'conor.mci@outlook.com', hash], function(err) {
                if (err) console.error('Failed to create admin user:', err);
                else console.log('Created admin user successfully');
              });
          });
        }
      }
    });

    // Create default "General Discussion" community if it doesn't exist
    db.get('SELECT id FROM communities WHERE name = ?', ['General Discussion'], (err, community) => {
      if (!err && !community) {
        db.run(`
          INSERT INTO communities (name, description, rules) 
          VALUES (?, ?, ?)
        `, [
          'General Discussion',
          'Welcome to the General Discussion community! This is the default community for all forum members.',
          '1. Be respectful to others\n2. No spam or self-promotion\n3. Stay on topic'
        ], function(err) {
          if (err) console.error('Error creating default community:', err);
          else console.log('Created default community');
        });
      }
    });

    console.log('Database schema and triggers updated successfully');
  });
};

// Initialize database
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

// Update user profile picture
app.post('/api/profile/pfp', authenticateToken, pfpUpload.single('pfp'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const pfpUrl = `/uploads/${req.file.filename}`;
  db.run('UPDATE users SET pfp = ? WHERE id = ?', [pfpUrl, req.user.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update profile picture' });
    res.json({ success: true, pfp: pfpUrl });
  });
});

// Create thread (with optional image upload)
app.post('/api/threads', authenticateToken, upload.single('image'), (req, res) => {
  const { title, content, tags, community_id } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  
  if (!req.user || !req.user.id) {
    console.error('No user info in JWT:', req.user);
    return res.status(401).json({ error: 'User not authenticated' });
  }
  if (!title || !content) {
    console.error('Missing title or content:', { title, content });
    return res.status(400).json({ error: 'Title and content are required.' });
  }
  
  // If no community_id provided, use General Discussion community
  const getCommunityId = () => {
    if (community_id) return Promise.resolve(community_id);
    return new Promise((resolve, reject) => {
      db.get('SELECT id FROM communities WHERE name = ?', ['General Discussion'], (err, row) => {
        if (err) reject(err);
        else if (!row) reject(new Error('Default community not found'));
        else resolve(row.id);
      });
    });
  };

  getCommunityId()
    .then(finalCommunityId => {
      db.run(
        'INSERT INTO threads (user_id, community_id, title, content, image, tags) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, finalCommunityId, title, content, image, tags || ''],
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
    })
    .catch(err => {
      console.error('Error creating thread:', err);
      res.status(500).json({ error: 'Failed to create thread', details: err.message });
    });
});

// Get recent threads across all communities
app.get('/api/threads', (req, res) => {
  // First, check if we have any communities
  db.get('SELECT COUNT(*) as count FROM communities', [], (err, result) => {
    if (err) {
      console.error('Error checking communities:', err);
      return res.status(500).json({ error: 'Database error', details: err.message });
    }

    if (result.count === 0) {
      // No communities exist yet
      return res.json([]);
    }

    // We have communities, now get threads
    db.all(`
      SELECT t.*, u.username, u.role, u.pfp, c.name as community_name 
      FROM threads t 
      LEFT JOIN users u ON t.user_id = u.id 
      LEFT JOIN communities c ON t.community_id = c.id 
      WHERE t.community_id IS NOT NULL
      ORDER BY t.pinned DESC, t.created_at DESC 
      LIMIT 20
    `, [], (err, threads) => {
      if (err) {
        console.error('Error fetching threads:', err);
        return res.status(500).json({ error: 'Failed to fetch threads', details: err.message });
      }

      if (!threads || threads.length === 0) {
        return res.json([]);
      }

      // Process threads sequentially to avoid race conditions
      const processThread = (index) => {
        if (index >= threads.length) {
          return res.json(threads);
        }

        const thread = threads[index];
        db.all(
          'SELECT r.*, u.username, u.role, u.pfp FROM replies r LEFT JOIN users u ON r.user_id = u.id WHERE r.thread_id = ? ORDER BY r.created_at ASC',
          [thread.id],
          (err, replies) => {
            thread.replies = err ? [] : buildReplyTree(replies);
            thread.created_at_formatted = new Date(thread.created_at).toLocaleString();
            thread.updated_at_formatted = thread.updated_at ? new Date(thread.updated_at).toLocaleString() : null;
            thread.pinned = thread.pinned ? 1 : 0;
            processThread(index + 1);
          }
        );
      };

      processThread(0);
    });
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
// Pin/unpin thread
app.post('/api/admin/pin/:id', authenticateToken, requireAdmin, (req, res) => {
  console.log('Admin pin request:', req.params.id, 'by user:', req.user);
  db.run('UPDATE threads SET pinned = 1 WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      console.error('Failed to pin thread:', err);
      return res.status(500).json({ error: 'Failed to pin thread' });
    }
    console.log('Thread pinned successfully:', req.params.id);
    db.run('INSERT INTO admin_logs (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.user.id, 'pin', 'thread', req.params.id]);
    res.json({ success: true });
  });
});

app.post('/api/admin/unpin/:id', authenticateToken, requireAdmin, (req, res) => {
  console.log('Admin unpin request:', req.params.id, 'by user:', req.user);
  db.run('UPDATE threads SET pinned = 0 WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      console.error('Failed to unpin thread:', err);
      return res.status(500).json({ error: 'Failed to unpin thread' });
    }
    console.log('Thread unpinned successfully:', req.params.id);
    db.run('INSERT INTO admin_logs (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.user.id, 'unpin', 'thread', req.params.id]);
    res.json({ success: true });
  });
});

app.put('/api/admin/thread/:id', authenticateToken, requireAdmin, (req, res) => {
  console.log('Admin edit thread request:', req.params.id, 'by user:', req.user);
  const { title, content } = req.body;
  
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }
  
  db.run('UPDATE threads SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
    [title, content, req.params.id], 
    function (err) {
      if (err) {
        console.error('Failed to update thread:', err);
        return res.status(500).json({ error: 'Failed to update thread' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      
      // Log admin action
      db.run('INSERT INTO admin_logs (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.id, 'edit_thread', 'thread', req.params.id]);
      
      console.log('Thread updated successfully:', req.params.id);
      res.json({ success: true });
    }
  );
});

app.delete('/api/admin/thread/:id', authenticateToken, requireAdmin, (req, res) => {
  console.log('Attempting to delete thread:', req.params.id, 'by user:', req.user);
  // First get thread details for logging
  db.get('SELECT title FROM threads WHERE id = ?', [req.params.id], (err, thread) => {
    if (err) {
      console.error('Error fetching thread details:', err);
      return res.status(500).json({ error: 'Failed to fetch thread details' });
    }
    
    db.run('DELETE FROM threads WHERE id = ?', [req.params.id], function (err) {
      if (err) {
        console.error('Failed to delete thread:', err);
        return res.status(500).json({ error: 'Failed to delete thread' });
      }
      if (this.changes === 0) {
        console.warn('No thread deleted. Thread may not exist:', req.params.id);
        return res.json({ success: false, error: 'Thread not found or not deleted.' });
      }
      
      // Log admin action
      db.run('INSERT INTO admin_logs (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
        [req.user.id, 'delete_thread', 'thread', req.params.id]);
        
      console.log('Thread deleted:', req.params.id);
      res.json({ success: true });
    });
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

// Community endpoints
app.post('/api/communities', authenticateToken, (req, res) => {
  const { name, description, rules, is_private } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'Name and description are required' });
  }

  db.run(
    'INSERT INTO communities (name, description, creator_id, rules, is_private) VALUES (?, ?, ?, ?, ?)',
    [name, description, req.user.id, rules || '', is_private ? 1 : 0],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Community name already exists' });
        }
        return res.status(500).json({ error: 'Failed to create community' });
      }
      const communityId = this.lastID;
      
      // Add creator as member and moderator
      db.run('INSERT INTO community_members (community_id, user_id) VALUES (?, ?)', [communityId, req.user.id]);
      db.run('INSERT INTO community_moderators (community_id, user_id, added_by) VALUES (?, ?, ?)', 
        [communityId, req.user.id, req.user.id]);
      
      res.json({ id: communityId });
    }
  );
});

app.get('/api/communities', (req, res) => {
  console.log('Fetching communities...');
  
  // First, ensure the General Discussion community exists
  db.get('SELECT id FROM communities WHERE name = ?', ['General Discussion'], (err, community) => {
    if (err) {
      console.error('Error checking for General Discussion:', err);
      return res.status(500).json({ error: 'Database error', details: err.message });
    }
    
    if (!community) {
      console.log('Creating missing General Discussion community...');
      db.run(`
        INSERT INTO communities (name, description, rules) 
        VALUES (?, ?, ?)
      `, [
        'General Discussion',
        'Welcome to the General Discussion community! This is the default community for all forum members.',
        '1. Be respectful to others\n2. No spam or self-promotion\n3. Stay on topic'
      ]);
    }
    
    // Now fetch all communities with their stats
    db.all(`
      SELECT 
        c.*,
        u.username as creator_name,
        COALESCE(cm.member_count, 0) as member_count,
        COALESCE(t.thread_count, 0) as thread_count,
        CASE 
          WHEN c.name = 'General Discussion' THEN 1 
          ELSE 0 
        END as is_general
      FROM communities c
      LEFT JOIN users u ON c.creator_id = u.id
      LEFT JOIN (SELECT community_id, COUNT(*) as member_count FROM community_members GROUP BY community_id) cm ON cm.community_id = c.id
      LEFT JOIN (SELECT community_id, COUNT(*) as thread_count FROM threads GROUP BY community_id) t ON t.community_id = c.id
      ORDER BY is_general DESC, c.created_at DESC
    `, [], (err, communities) => {
      if (err) {
        console.error('Error fetching communities:', err);
        return res.status(500).json({ error: 'Failed to fetch communities', details: err.message });
      }
      
      if (!communities) {
        console.warn('No communities found in database');
        return res.json([]);
      }
      
      console.log(`Found ${communities.length} communities`);
      res.json(communities);
    });
  });
});

// Fallback route: serve index.html for all unknown GET requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`The MAYHEM Forum running on http://localhost:${PORT}`);
});

app.get('/api/communities/:id', (req, res) => {
  db.get(`
    SELECT c.*, u.username as creator_name,
           COUNT(DISTINCT cm.user_id) as member_count,
           COUNT(DISTINCT t.id) as thread_count
    FROM communities c
    LEFT JOIN users u ON c.creator_id = u.id
    LEFT JOIN community_members cm ON c.id = cm.community_id
    LEFT JOIN threads t ON c.id = t.community_id
    WHERE c.id = ?
    GROUP BY c.id
  `, [req.params.id], (err, community) => {
    if (err || !community) return res.status(404).json({ error: 'Community not found' });
    res.json(community);
  });
});

app.post('/api/communities/:id/join', authenticateToken, (req, res) => {
  db.run('INSERT INTO community_members (community_id, user_id) VALUES (?, ?)',
    [req.params.id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to join community' });
      res.json({ success: true });
    }
  );
});

app.post('/api/communities/:id/leave', authenticateToken, (req, res) => {
  db.run('DELETE FROM community_members WHERE community_id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to leave community' });
      res.json({ success: true });
    }
  );
});

// Get threads for a specific community
app.get('/api/communities/:id/threads', (req, res) => {
  db.all(`
    SELECT t.*, u.username, u.role, u.pfp 
    FROM threads t 
    JOIN users u ON t.user_id = u.id 
    WHERE t.community_id = ?
    ORDER BY t.pinned DESC, t.created_at DESC
  `, [req.params.id], (err, threads) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch threads' });
    if (!threads || threads.length === 0) return res.json([]);

    let count = threads.length;
    let done = false;

    threads.forEach((thread, i) => {
      db.all('SELECT r.*, u.username, u.role, u.pfp FROM replies r JOIN users u ON r.user_id = u.id WHERE r.thread_id = ? ORDER BY r.created_at ASC', 
        [thread.id], (err, replies) => {
          if (err) {
            thread.replies = [];
          } else {
            thread.replies = buildReplyTree(replies);
          }
          thread.created_at_formatted = new Date(thread.created_at).toLocaleString();
          count--;
          if (count === 0 && !done) {
            done = true;
            res.json(threads);
          }
        });
    });
  });
});

// Start server
>>>>>>> 0dc2ce92c8998b150edd5707fdda9203f2f6353f
