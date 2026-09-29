/**
 * Inventory Microservice — Stock Reservation & Verification
 */
import express from 'express';

const app = express();
app.use(express.json());

// In-memory inventory catalog
const inventoryStock = new Map([
  ['sku_101', 500],
  ['sku_202', 120],
  ['sku_303', 0],
]);

app.post('/api/inventory/reserve', (req, res) => {
  const { sku, quantity = 1 } = req.body;
  const current = inventoryStock.get(sku) || 0;

  if (current < quantity) {
    return res.status(409).json({ error: 'Insufficient stock available', sku, requested: quantity, available: current });
  }

  inventoryStock.set(sku, current - quantity);
  return res.json({ status: 'reserved', sku, remaining: current - quantity });
});

app.get('/health', (req, res) => {
  res.json({ service: 'inventory', status: 'healthy', version: '1.0.0' });
});

export default app;
