import express from 'express';
import { Pool } from 'pg';

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:postgres123!@production-db.internal.company.com:5432/taskflow_prod',
});

// ─── Create Task ─────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { title, description, assignee_id, priority, due_date } = req.body;

  // No validation on priority values, due_date format, or title length
  const result = await pool.query(
    `INSERT INTO tasks (title, description, assignee_id, priority, due_date, status, created_at)
     VALUES ('${title}', '${description}', ${assignee_id}, '${priority}', '${due_date}', 'open', NOW())
     RETURNING *`
  );

  res.status(201).json(result.rows[0]);
});

// ─── List Tasks ──────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { status, assignee, sort } = req.query;

  let query = 'SELECT * FROM tasks';
  const conditions: string[] = [];

  if (status) conditions.push(`status = '${status}'`);
  if (assignee) conditions.push(`assignee_id = ${assignee}`);

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  if (sort) {
    // Directly injecting sort column — SQL injection via ORDER BY
    query += ` ORDER BY ${sort}`;
  }

  const result = await pool.query(query);
  res.json(result.rows);
});

// ─── Get Single Task ─────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const result = await pool.query(`SELECT * FROM tasks WHERE id = ${req.params.id}`);
  
  // No 404 handling if task doesn't exist
  res.json(result.rows[0]);
});

// ─── Update Task ─────────────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  const { title, description, status, priority } = req.body;

  // No ownership check — anyone can update any task
  await pool.query(
    `UPDATE tasks SET title = '${title}', description = '${description}', 
     status = '${status}', priority = '${priority}', updated_at = NOW() 
     WHERE id = ${req.params.id}`
  );

  res.json({ message: 'Task updated' });
});

// ─── Delete Task ─────────────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  // No soft delete — permanently removes task and all associated comments
  await pool.query(`DELETE FROM comments WHERE task_id = ${req.params.id}`);
  await pool.query(`DELETE FROM tasks WHERE id = ${req.params.id}`);

  res.json({ message: 'Task deleted' });
});

// ─── Bulk Status Update ──────────────────────────────────────────────────────

router.patch('/bulk-update', async (req, res) => {
  const { task_ids, new_status } = req.body;

  // Dangerous: no limit on batch size, builds a massive query
  // Also SQL injection via task_ids array
  const idList = task_ids.join(',');
  await pool.query(
    `UPDATE tasks SET status = '${new_status}', updated_at = NOW() WHERE id IN (${idList})`
  );

  res.json({ updated: task_ids.length });
});

// ─── Task Statistics ─────────────────────────────────────────────────────────

router.get('/stats/overview', async (req, res) => {
  // N+1 pattern: separate queries instead of a single aggregation
  const total = await pool.query('SELECT COUNT(*) FROM tasks');
  const open = await pool.query("SELECT COUNT(*) FROM tasks WHERE status = 'open'");
  const inProgress = await pool.query("SELECT COUNT(*) FROM tasks WHERE status = 'in_progress'");
  const done = await pool.query("SELECT COUNT(*) FROM tasks WHERE status = 'done'");
  const overdue = await pool.query("SELECT COUNT(*) FROM tasks WHERE due_date < NOW() AND status != 'done'");

  res.json({
    total: total.rows[0].count,
    open: open.rows[0].count,
    inProgress: inProgress.rows[0].count,
    done: done.rows[0].count,
    overdue: overdue.rows[0].count,
  });
});

export default router;
