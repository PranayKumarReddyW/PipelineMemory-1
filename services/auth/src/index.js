/**
 * Auth Microservice — Entry Point
 */
import express from 'express';
import { signAccessToken, verifyAccessToken } from './jwt.js';

const app = express();
app.use(express.json());

app.post('/api/auth/token', (req, res) => {
  const { userId, role } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const token = signAccessToken({ userId, role: role || 'user' });
  return res.json({ token, expiresIn: 3600 });
});

app.post('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  return res.json({ valid: true, user: payload });
});

app.get('/health', (req, res) => {
  res.json({ service: 'auth', status: 'healthy', version: '1.0.0' });
});

export default app;
