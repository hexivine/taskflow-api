import express from 'express';
import userRoutes from './routes/users';
import taskRoutes from './routes/tasks';

const app = express();
app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TaskFlow API running on port ${PORT}`);
});
