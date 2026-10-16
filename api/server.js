require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// ===== HELPER: map DB row -> format Firebase-style =====
function toProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.nama,
    price: row.harga,
    description: row.deskripsi || '',
    imageUrl: row.gambar || '',
    status: 'published',
    createdAt: row.created_at
  };
}

// ===== PRODUCTS =====
app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json({ products: rows.map(toProduct), pagination: { page: 1, limit: rows.length, total: rows.length, pages: 1 } });
});

app.get('/api/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(toProduct(row));
});

app.post('/api/products', (req, res) => {
  const b = req.body;
  const id = b.id || Date.now().toString();
  const nama = b.name || b.nama || '-';
  const harga = parseInt(b.price || b.harga || 0);
  const deskripsi = b.description || b.deskripsi || '';
  const gambar = b.imageUrl || b.gambar || '';

  db.prepare('INSERT OR REPLACE INTO products (id, nama, harga, deskripsi, gambar) VALUES (?, ?, ?, ?, ?)')
    .run(id, nama, harga, deskripsi, gambar);
  res.json({ ok: true, id });
});

app.put('/api/products/:id', (req, res) => {
  const b = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const nama = b.name || b.nama || existing.nama;
  const harga = parseInt(b.price || b.harga || existing.harga);
  const deskripsi = b.description || b.deskripsi || existing.deskripsi;
  const gambar = b.imageUrl || b.gambar || existing.gambar;

  db.prepare('UPDATE products SET nama=?, harga=?, deskripsi=?, gambar=? WHERE id=?')
    .run(nama, harga, deskripsi, gambar, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== GENERIC COLLECTION =====
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

// ============================================
// PAYMENT GATEWAY (ShopeePay OSS) — Express Proxy
// ============================================
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:4000';
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || 'secret-key-pilihanmu';

async function gatewayFetch(endpoint, options = {}) {
  const res = await fetch(`${GATEWAY_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': GATEWAY_API_KEY,
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// POST /api/payment/create-qris
app.post('/api/payment/create-qris', async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount tidak valid' });
    }

    // Kode unik Rp1-99 (anti kolisi nominal kembar)
    const uniqueAmount = parseInt(amount) + Math.floor(Math.random() * 99) + 1;

    const { ok, status, data } = await gatewayFetch('/create-qris', {
      method: 'POST',
      body: JSON.stringify({ amount: uniqueAmount })
    });

    if (!ok) return res.status(status).json({ error: data.error || 'Gagal membuat QRIS' });

    const qrId = data.id || data.qrId || data.qrisId;

    // Simpan uniqueAmount & qrId ke order
    if (orderId) {
      ensureTable('orders');
      const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (row) {
        const obj = rowToObj(row);
        obj.uniqueAmount = uniqueAmount;
        obj.qrId = qrId;
        db.prepare('UPDATE orders SET data = ? WHERE id = ?')
          .run(JSON.stringify(obj), orderId);
      }
    }

    res.json({
      success: true,
      amount: uniqueAmount,
      qrId,
      qrUrl: `/api/payment/qr/${qrId}`
    });
  } catch (e) {
    console.error('create-qris error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/payment/qr/:id — proxy gambar QR
app.get('/api/payment/qr/:id', async (req, res) => {
  try {
    const url = `${GATEWAY_URL}/qr/${req.params.id}`;
    const imgRes = await fetch(url);
    if (!imgRes.ok) return res.status(imgRes.status).send('QR not found');
    res.set('Content-Type', imgRes.headers.get('content-type') || 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    const buf = Buffer.from(await imgRes.arrayBuffer());
    res.send(buf);
  } catch (e) {
    console.error('qr proxy error:', e);
    res.status(500).send('QR proxy error');
  }
});

// POST /api/payment/check
app.post('/api/payment/check', async (req, res) => {
  try {
    const { amount, startTime } = req.body;
    if (!amount) return res.status(400).json({ error: 'Amount wajib' });

    const { ok, status, data } = await gatewayFetch('/check-payment', {
      method: 'POST',
      body: JSON.stringify({
        amount: parseInt(amount),
        startTime: startTime || Math.floor(Date.now() / 1000) - 900
      })
    });

    if (!ok) return res.status(status).json({ error: data.error || 'Gagal cek' });

    res.json({
      success: true,
      paid: !!data.paid,
      transaction: data.transaction || null,
      source: data.source || null
    });
  } catch (e) {
    console.error('check-payment error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/payment/health
app.get('/api/payment/health', async (req, res) => {
  try {
    const { ok, data } = await gatewayFetch('/api/health');
    res.json({ server: 'ok', gateway: ok ? 'ok' : 'down', gatewayResponse: data });
  } catch (e) {
    res.json({ server: 'ok', gateway: 'down', error: e.message });
  }
});

// ===== HTML ROUTES =====
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.get('/payment.html', (req, res) => res.sendFile(path.join(publicDir, 'payment.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(publicDir, 'payment.html')));

app.get('/seller/login', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/login.html')));
app.get('/seller/register', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/register.html')));
app.get('/seller/dashboard', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/dashboard.html')));
app.get('/seller/products', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/products.html')));
app.get('/seller/wallet', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/wallet.html')));
app.get('/seller/transactions', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/transactions.html')));
app.get('/seller/withdraw', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/withdraw.html')));
app.get('/seller/settings', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/settings.html')));

app.get('/admin/login', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/login.html')));
app.get('/admin/register', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/register.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/dashboard.html')));
app.get('/admin/sellers', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/sellers.html')));
app.get('/admin/products', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/products.html')));
app.get('/admin/orders', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/orders.html')));
app.get('/admin/banners', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/banners.html')));
app.get('/admin/settings', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/settings.html')));
app.get('/admin/withdrawals', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/withdrawals.html')));

app.get('/cek-order', (req, res) => res.sendFile(path.join(publicDir, 'cek-order.html')));
app.get('/product-seller', (req, res) => res.sendFile(path.join(publicDir, 'product-seller.html')));
app.get('/success', (req, res) => res.sendFile(path.join(publicDir, 'success.html')));
app.get('/success.html', (req, res) => res.sendFile(path.join(publicDir, 'success.html')));

// Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, req.path), (err) => {
    if (err) res.status(404).send('Page not found');
  });
});

const PORT = 3001;
app.listen(PORT, () => console.log('API jalan di port ' + PORT));