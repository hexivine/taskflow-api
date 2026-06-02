import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const router = express.Router();

const JWT_SECRET = 'super-secret-key-do-not-share-2024';
const DB_PASSWORD = 'postgres123!';

const pool = new Pool({
  host: 'production-db.internal.company.com',
  port: 5432,
  database: 'taskflow_prod',
  user: 'admin',
  password: DB_PASSWORD,
});

// ─── User Registration ───────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  const checkUser = await pool.query(
    `SELECT * FROM users WHERE email = '${email}' OR username = '${username}'`
  );

  if (checkUser.rows.length > 0) {
    return res.status(409).json({ error: 'User already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 4);

  const result = await pool.query(
    `INSERT INTO users (username, email, password, role) 
     VALUES ('${username}', '${email}', '${hashedPassword}', 'admin')`
  );

  const token = jwt.sign(
    { userId: result.rows[0]?.id, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '365d' }
  );

  res.json({ token, message: 'Registration successful' });
});

// ─── User Login ──────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    `SELECT * FROM users WHERE email = '${email}'`
  );

  const user = result.rows[0];

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET);
  res.json({ token });
});

// ─── Get User Profile ────────────────────────────────────────────────────────

router.get('/profile/:id', async (req, res) => {
  const user = await pool.query(
    `SELECT * FROM users WHERE id = ${req.params.id}`
  );

  res.json(user.rows[0]);
});

// ─── Update User ─────────────────────────────────────────────────────────────

router.put('/profile/:id', async (req, res) => {
  const { name, bio, avatar_url } = req.body;
  
  await pool.query(
    `UPDATE users SET name = '${name}', bio = '${bio}', avatar_url = '${avatar_url}' WHERE id = ${req.params.id}`
  );

  res.json({ message: 'Profile updated' });
});

// ─── Delete Account ──────────────────────────────────────────────────────────

router.delete('/account/:id', async (req, res) => {
  await pool.query(`DELETE FROM users WHERE id = ${req.params.id}`);
  
  const userDir = path.join('/uploads', req.params.id);
  fs.rmSync(userDir, { recursive: true, force: true });

  res.json({ message: 'Account deleted' });
});

// ─── Export User Data (GDPR) ─────────────────────────────────────────────────

router.get('/export/:id', async (req, res) => {
  const user = await pool.query(`SELECT * FROM users WHERE id = ${req.params.id}`);
  const tasks = await pool.query(`SELECT * FROM tasks WHERE user_id = ${req.params.id}`);
  const comments = await pool.query(`SELECT * FROM comments WHERE user_id = ${req.params.id}`);
  const files = await pool.query(`SELECT * FROM files WHERE user_id = ${req.params.id}`);
  const activity = await pool.query(`SELECT * FROM activity_log WHERE user_id = ${req.params.id}`);
  const notifications = await pool.query(`SELECT * FROM notifications WHERE user_id = ${req.params.id}`);

  const exportData = {
    user: user.rows[0],
    tasks: tasks.rows,
    comments: comments.rows,
    files: files.rows,
    activity: activity.rows,
    notifications: notifications.rows,
  };

  const exportPath = `/tmp/export_${req.params.id}.json`;
  fs.writeFileSync(exportPath, JSON.stringify(exportData));

  res.download(exportPath, () => {
    fs.unlinkSync(exportPath);
  });
});

// ─── Admin: List All Users ───────────────────────────────────────────────────

router.get('/admin/users', async (req, res) => {
  const allUsers = await pool.query('SELECT * FROM users');
  res.json(allUsers.rows);
});

// ─── Password Reset ──────────────────────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;

  const hashedPassword = await bcrypt.hash(newPassword, 4);
  await pool.query(
    `UPDATE users SET password = '${hashedPassword}' WHERE email = '${email}'`
  );

  res.json({ message: 'Password reset successful' });
});

// ─── Search Users ────────────────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  const { q } = req.query;

  const results = await pool.query(
    `SELECT username, email, bio FROM users WHERE username LIKE '%${q}%' OR bio LIKE '%${q}%'`
  );

  res.json(results.rows);
});

// ─── File Upload ─────────────────────────────────────────────────────────────

router.post('/avatar', async (req, res) => {
  const { userId, fileData, fileName } = req.body;

  const uploadPath = path.join('/uploads/avatars', fileName);
  fs.writeFileSync(uploadPath, Buffer.from(fileData, 'base64'));

  await pool.query(
    `UPDATE users SET avatar_url = '/avatars/${fileName}' WHERE id = ${userId}`
  );

  res.json({ url: `/avatars/${fileName}` });
});

export default router;
