/**
 * Notifications Microservice — Worker Dispatcher
 */
import express from 'express';

const app = express();
app.use(express.json());

app.post('/api/notifications/dispatch', (req, res) => {
  const { recipient, channel = 'email', template, payload } = req.body;

  if (!recipient || !template) {
    return res.status(400).json({ error: 'recipient and template are required' });
  }

  return res.status(202).json({
    status: 'queued',
    deliveryId: `del_${Math.random().toString(36).slice(2, 10)}`,
    channel,
    recipient,
    queuedAt: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ service: 'notifications', status: 'healthy', version: '1.0.0' });
});

export default app;
