/**
 * Payments Microservice — Core Transaction Processor
 */
import express from 'express';
import { executePayment } from './stripeClient.js';

const app = express();
app.use(express.json());

app.post('/api/payments/charge', async (req, res) => {
  const { amount, currency = 'USD', customerId, idempotencyKey } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  try {
    const receipt = await executePayment({ amount, currency, customerId, idempotencyKey });
    return res.status(200).json({ status: 'succeeded', receipt });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ service: 'payments', status: 'healthy', version: '1.0.0' });
});

export default app;
