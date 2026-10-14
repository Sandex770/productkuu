const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ===== GENERIC TABLE HELPER =====
const ALLOWED = ['products','orders','users','categories','banners','withdrawals','notifications','reviews','settings'];

function ensureTable(name) {
  db.exec('CREATE TABLE IF NOT EXISTS ' + name + ' (id TEXT PRIMARY KEY, data TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
}

function rowToObj(r) {
  if (!r) return null;
  try {
    const parsed = JSON.parse(r.data || '{}');
    return { id: r.id, ...parsed, created_at: r.created_at };
  } catch(e) {
    return { id: r.id, created_at: r.created_at };
  }
}

// ===== PRODUCTS (khusus) =====
app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(rows);
});

app.get('/api/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.post('/api/products', (req, res) => {
  const { id, nama, harga, deskripsi, gambar } = req.body;
  db.prepare('INSERT OR REPLACE INTO products (id, nama, harga, deskripsi, gambar) VALUES (?, ?, ?, ?, ?)')
    .run(id || Date.now().toString(), nama, harga, deskripsi || '', gambar || '');
  res.json({ ok: true });
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== GENERIC COLLECTION =====
app.get('/api/:col', (req, res) => {
  const col = req.params.col;
  if (!ALLOWED.includes(col)) return res.status(400).json({ error: 'Invalid collection' });
  ensureTable(col);
  const rows = db.prepare('SELECT * FROM ' + col + ' ORDER BY created_at DESC').all();
  res.json(rows.map(rowToObj));
});

app.get('/api/:col/:id', (req, res) => {
  const col = req.params.col;
  if (!ALLOWED.includes(col)) return res.status(400).json({ error: 'Invalid collection' });
  ensureTable(col);
  const row = db.prepare('SELECT * FROM ' + col + ' WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToObj(row));
});

app.post('/api/:col', (req, res) => {
  const col = req.params.col;
  if (!ALLOWED.includes(col)) return res.status(400).json({ error: 'Invalid collection' });
  ensureTable(col);
  const id = req.body.id || Date.now().toString();
  const data = { ...req.body };
  delete data.id;
  db.prepare('INSERT OR REPLACE INTO ' + col + ' (id, data) VALUES (?, ?)')
    .run(id, JSON.stringify(data));
  res.json({ ok: true, id });
});

app.delete('/api/:col/:id', (req, res) => {
  const col = req.params.col;
  if (!ALLOWED.includes(col)) return res.status(400).json({ error: 'Invalid collection' });
  ensureTable(col);
  db.prepare('DELETE FROM ' + col + ' WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const PORT = 3001;
app.listen(PORT, () => console.log('API jalan di port ' + PORT));
