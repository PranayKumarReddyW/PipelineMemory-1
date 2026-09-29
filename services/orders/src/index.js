/**
 * Orders Microservice
 */
import express from 'express';

const app = express();
app.use(express.json());

app.post('/api/orders', async (req, res) => {
  const { customerId, items = [], totalAmount } = req.body;
  if (!items.length || !totalAmount) {
    return res.status(400).json({ error: 'Order must contain items and totalAmount' });
  }

  const order = {
    id: `ord_${Math.random().toString(36).slice(2, 9)}`,
    customerId,
    itemsCount: items.length,
    totalAmount,
    status: 'created',
    createdAt: new Date().toISOString(),
  };

  return res.status(201).json({ order });
});

app.get('/health', (req, res) => {
  res.json({ service: 'orders', status: 'healthy', version: '1.0.0' });
});

export default app;
