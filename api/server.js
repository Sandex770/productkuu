require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_super_aman_productkuu';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:4000';
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || 'secret-key-pilihanmu';

// ============================================
// AUTHENTICATION (LOGIN & REGISTER)
// ============================================

// 1. Endpoint Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, whatsapp, displayName, role, storeName } = req.body;
        
        if (!email || !password || !displayName) {
            return res.status(400).json({ error: 'Email, password, dan nama wajib diisi' });
        }

        // Cek apakah email sudah terdaftar (Prepared Statement)
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) return res.status(400).json({ error: 'Email sudah terdaftar' });

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const finalRole = role === 'admin' ? 'admin' : 'seller';

        // Simpan ke SQLite
        const stmt = db.prepare(`
            INSERT INTO users (
                id, email, password, whatsapp, displayName, role, 
                storeName, status, createdAt, wallet
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run(
            id, 
            email, 
            hashedPassword, 
            whatsapp || '', 
            displayName, 
            finalRole, 
            storeName || (displayName + "'s Store"), 
            'active', 
            now,
            JSON.stringify({ available: 0, holding: 0, totalRevenue: 0, totalWithdraw: 0 })
        );

        res.json({ success: true, message: 'Registrasi berhasil, silakan login.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Endpoint Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Cari user
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) return res.status(401).json({ error: 'Email atau password salah' });

        // Cek password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ error: 'Email atau password salah' });

        // Buat JWT Token (berlaku 7 hari)
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role }, 
            JWT_SECRET, 
            { expiresIn: '7d' }
        );

        // Bersihkan data sensitif sebelum dikirim ke frontend
        delete user.password;
        if (user.wallet) {
            try { user.wallet = JSON.parse(user.wallet); } catch(e) {}
        }

        res.json({ success: true, token, user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// HELPER: map DB row -> format Firebase-style
// ============================================
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

// ============================================
// PRODUCTS
// ============================================
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

// ============================================
// GENERIC COLLECTION (UNTUK ADMIN PANEL & API)
// ============================================
const ALLOWED = ['products','orders','categories','banners','withdrawals','notifications','reviews','settings'];

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
// PAYMENT GATEWAY (ShopeePay OSS)
// ============================================
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

app.post('/api/payment/create-qris', async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount tidak valid' });

    const uniqueAmount = parseInt(amount) + Math.floor(Math.random() * 99) + 1;
    const { ok, status, data } = await gatewayFetch('/create-qris', {
      method: 'POST',
      body: JSON.stringify({ amount: uniqueAmount })
    });

    if (!ok) return res.status(status).json({ error: data.error || 'Gagal membuat QRIS' });
    const qrId = data.id || data.qrId || data.qrisId;

    if (orderId) {
      ensureTable('orders');
      const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (row) {
        const obj = rowToObj(row);
        obj.uniqueAmount = uniqueAmount;
        obj.qrId = qrId;
        db.prepare('UPDATE orders SET data = ? WHERE id = ?').run(JSON.stringify(obj), orderId);
      }
    }
    res.json({ success: true, amount: uniqueAmount, qrId, qrUrl: `/api/payment/qr/${qrId}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/payment/qr/:id', async (req, res) => {
  try {
    const imgRes = await fetch(`${GATEWAY_URL}/qr/${req.params.id}`);
    if (!imgRes.ok) return res.status(imgRes.status).send('QR not found');
    res.set('Content-Type', imgRes.headers.get('content-type') || 'image/png');
    res.send(Buffer.from(await imgRes.arrayBuffer()));
  } catch (e) { res.status(500).send('QR proxy error'); }
});

app.post('/api/payment/check', async (req, res) => {
  try {
    const { amount, startTime } = req.body;
    const { ok, status, data } = await gatewayFetch('/check-payment', {
      method: 'POST',
      body: JSON.stringify({ amount: parseInt(amount), startTime: startTime || Math.floor(Date.now() / 1000) - 900 })
    });
    if (!ok) return res.status(status).json({ error: data.error || 'Gagal cek' });
    res.json({ success: true, paid: !!data.paid, transaction: data.transaction || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/payment/health', async (req, res) => {
  try {
    const { ok, data } = await gatewayFetch('/api/health');
    res.json({ server: 'ok', gateway: ok ? 'ok' : 'down', gatewayResponse: data });
  } catch (e) { res.json({ server: 'ok', gateway: 'down', error: e.message }); }
});

// ============================================
// AUTO-CLEANUP: hapus order pending > 30 menit
// ============================================
const EXPIRY_MINUTES = 30;
const CLEANUP_INTERVAL_MS = 60 * 1000;

function cleanupExpiredOrders() {
    try {
        ensureTable('orders');
        const cutoff = Date.now() - EXPIRY_MINUTES * 60 * 1000;
        const rows = db.prepare('SELECT * FROM orders').all();
        let deleted = 0;
        for (const row of rows) {
            let obj;
            try { obj = JSON.parse(row.data || '{}'); } catch(e) { continue; }
            if ((obj.paymentStatus || obj.status) !== 'pending') continue;
            const createdMs = new Date(obj.createdAt || obj.created_at || row.created_at).getTime();
            if (createdMs < cutoff) {
                db.prepare('DELETE FROM orders WHERE id = ?').run(row.id);
                deleted++;
            }
        }
        if (deleted > 0) console.log(`🗑️ Cleanup: ${deleted} order kadaluarsa dihapus`);
    } catch (e) { console.error('Cleanup error:', e); }
}

cleanupExpiredOrders();
setInterval(cleanupExpiredOrders, CLEANUP_INTERVAL_MS);

// ============================================
// HTML ROUTES — CLEAN URL
// ============================================
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.get('/payment.html', (req, res) => res.redirect(301, '/payment'));
app.get('/payment', (req, res) => res.sendFile(path.join(publicDir, 'payment.html')));

app.get('/success.html', (req, res) => res.redirect(301, '/success'));
app.get('/success', (req, res) => res.sendFile(path.join(publicDir, 'success.html')));

app.get('/cek-order.html', (req, res) => res.redirect(301, '/cek-order'));
app.get('/cek-order', (req, res) => res.sendFile(path.join(publicDir, 'cek-order.html')));

app.get('/product-seller.html', (req, res) => res.redirect(301, '/product-seller'));
app.get('/product-seller', (req, res) => res.sendFile(path.join(publicDir, 'product-seller.html')));

// ===== SELLER =====
app.get('/seller/login', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/login.html')));
app.get('/seller/register', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/register.html')));
app.get('/seller/dashboard', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/dashboard.html')));
app.get('/seller/products', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/products.html')));
app.get('/seller/wallet', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/wallet.html')));
app.get('/seller/transactions', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/transactions.html')));
app.get('/seller/withdraw', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/withdraw.html')));
app.get('/seller/settings', (req, res) => res.sendFile(path.join(publicDir, 'pages/seller/settings.html')));

// ===== ADMIN =====
app.get('/admin/login', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/login.html')));
app.get('/admin/register', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/register.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/dashboard.html')));
app.get('/admin/sellers', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/sellers.html')));
app.get('/admin/products', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/products.html')));
app.get('/admin/orders', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/orders.html')));
app.get('/admin/banners', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/banners.html')));
app.get('/admin/settings', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/settings.html')));
app.get('/admin/withdrawals', (req, res) => res.sendFile(path.join(publicDir, 'pages/admin/withdrawals.html')));

app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  if (page.includes('.') || ['seller','admin','api','payment','success','cek-order','product-seller'].includes(page)) return next();
  res.sendFile(path.join(publicDir, page + '.html'), (err) => { if (err) next(); });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, req.path), (err) => {
    if (err) res.status(404).send('Page not found');
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('🚀 API jalan di port ' + PORT);
});