import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import conversationRoutes from './routes/conversation';
import translateRoutes from './routes/translate';
import { errorHandler } from './middleware/errorHandler';

// Load environment variables first, before any other imports
dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/conversation', conversationRoutes);
app.use('/api/translate', translateRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use(errorHandler);

export default app;
