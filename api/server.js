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
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || 'Sanzzdexsad';

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

        // Cek apakah email sudah terdaftar
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
            id, email, hashedPassword, whatsapp || '', displayName, 
            finalRole, storeName || (displayName + "'s Store"), 'active', 
            now, JSON.stringify({ available: 0, holding: 0, totalRevenue: 0, totalWithdraw: 0 })
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

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) return res.status(401).json({ error: 'Email atau password salah' });

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ error: 'Email atau password salah' });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role }, 
            JWT_SECRET, 
            { expiresIn: '7d' }
        );

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
// HELPER: MAP DB ROW
// ============================================
function toProduct(row) {
  if (!row) return null;
  // Gabungkan data kolom dasar dengan kolom 'data' (JSON)
  let detail = {};
  if (row.data) {
    try { detail = JSON.parse(row.data); } catch(e) {}
  }
  
  // Buang data sensitif (password akun premium)
  if (detail.premiumAccounts) delete detail.premiumAccounts;

  return {
    id: row.id,
    name: row.nama,
    price: row.harga,
    description: row.deskripsi || '',
    imageUrl: row.gambar || '',
    sales: row.terjual || 0,
    status: detail.status || 'published',
    createdAt: row.created_at,
    ...detail // Gabungkan sisa data (type, kategori, dll)
  };
}

// ============================================
// KHUSUS USERS
// ============================================
app.get('/api/users', (req, res) => {
    try {
        const users = db.prepare('SELECT * FROM users').all();
        
        // Ambil semua produk dan order untuk menghitung statistik
        ensureTable('products');
        ensureTable('orders');
        const allProducts = db.prepare('SELECT * FROM products').all();
        const allOrders = db.prepare('SELECT * FROM orders').all();

        users.forEach(u => {
            if (u.wallet) { try { u.wallet = JSON.parse(u.wallet); } catch(e){} }
            delete u.password; 

            // Hitung jumlah produk seller ini
            const myProducts = allProducts.filter(p => p.seller_id === u.id || JSON.parse(p.data || '{}').sellerId === u.id);
            u.productCount = myProducts.length;

            // Hitung total penjualan dari order yang sukses
            let sales = 0;
            allOrders.forEach(o => {
                const orderData = JSON.parse(o.data || '{}');
                if (orderData.sellerId === u.id && (orderData.paymentStatus === 'settlement' || orderData.paymentStatus === 'paid')) {
                    sales += (orderData.qty || 1);
                }
            });
            u.totalSales = sales;
        });
        
        res.json(users); 
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/users/:id', (req, res) => {
    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // PERBAIKAN: Parse string JSON kembali menjadi object sebelum dikirim ke frontend
        if (user.wallet && typeof user.wallet === 'string') {
            try { user.wallet = JSON.parse(user.wallet); } catch(e) { user.wallet = { available: 0, holding: 0, totalRevenue: 0, totalWithdraw: 0 }; }
        }
        
        delete user.password;
        res.json(user); 
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/users/:id', (req, res) => {
    try {
        const id = req.params.id;
        const b = req.body;
        
        const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!existing) return res.status(404).json({ error: 'User tidak ditemukan' });

        const displayName = b.displayName || existing.displayName;
        const role = b.role || existing.role;
        const status = b.status || existing.status;
        const storeName = b.storeName || existing.storeName;
        const level = b.level || existing.level;
        const verified = b.verified !== undefined ? (b.verified ? 1 : 0) : existing.verified;
        
        // PERBAIKAN: Pastikan wallet disimpan sebagai String JSON
        let walletStr = existing.wallet;
        if (b.wallet) {
            walletStr = typeof b.wallet === 'string' ? b.wallet : JSON.stringify(b.wallet);
        }

        db.prepare(`
            UPDATE users SET 
                displayName = ?, role = ?, status = ?, 
                storeName = ?, level = ?, verified = ?, 
                wallet = ? 
            WHERE id = ?
        `).run(
            displayName, role, status, 
            storeName, level, verified, 
            walletStr, id
        );

        res.json({ ok: true, message: 'Data user berhasil diperbarui' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


app.put('/api/withdrawals/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { status, adminNote } = req.body;

        // 1. Ambil data withdraw
        const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
        if (!w) return res.status(404).json({ error: 'Withdraw tidak ditemukan' });
        
        let wData = JSON.parse(w.data || '{}');
        const oldStatus = wData.status;
        const newStatus = status;
        const amount = parseInt(wData.amount) || 0;
        const sellerId = wData.sellerId;

        // Jika statusnya sama, tidak perlu proses saldo
        if (oldStatus === newStatus) {
            return res.json({ ok: true, message: 'Status tidak berubah' });
        }

        // 2. Update data Withdraw
        wData.status = newStatus;
        wData.adminNote = adminNote || '';
        wData.updatedAt = new Date().toISOString();
        db.prepare('UPDATE withdrawals SET data = ? WHERE id = ?').run(JSON.stringify(wData), id);

        // 3. Update Saldo Seller (Jika ada sellerId)
        if (sellerId) {
            const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(sellerId);
            if (userRow) {
                let wallet = JSON.parse(userRow.wallet || '{"available":0,"holding":0,"totalRevenue":0,"totalWithdraw":0}');
                let pending = wallet.pendingWithdraw || 0;

                if (newStatus === 'rejected' && oldStatus === 'pending') {
                    // JIKA DITOLAK: Kembalikan saldo ke Available
                    wallet.available = (wallet.available || 0) + amount;
                    wallet.pendingWithdraw = Math.max(0, pending - amount);
                } 
                else if (newStatus === 'approved' && oldStatus === 'pending') {
                    // JIKA DISETUJUI: Kurangi pending, tambah total withdraw
                    wallet.pendingWithdraw = Math.max(0, pending - amount);
                    wallet.totalWithdraw = (wallet.totalWithdraw || 0) + amount;
                }

                // Simpan perubahan wallet
                db.prepare('UPDATE users SET wallet = ? WHERE id = ?')
                  .run(JSON.stringify(wallet), sellerId);
            }
        }

        res.json({ ok: true, message: 'Status withdraw berhasil diupdate' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});




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
  const terjual = parseInt(b.sales || b.terjual || 0);
  
  // Simpan sisa data ke JSON (type, premiumAccounts, dll)
  const detailData = { ...b };
  delete detailData.id; delete detailData.nama; delete detailData.harga; 
  delete detailData.deskripsi; delete detailData.gambar; delete detailData.terjual;
  delete detailData.name; delete detailData.price; delete detailData.description; 
  delete detailData.imageUrl; delete detailData.sales; delete detailData.createdAt;
  delete detailData.created_at;

  db.prepare('INSERT OR REPLACE INTO products (id, nama, harga, deskripsi, gambar, terjual, data) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, nama, harga, deskripsi, gambar, terjual, JSON.stringify(detailData));
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
  const terjual = parseInt(b.sales || b.terjual || existing.terjual || 0);

  // Gabungkan data lama dengan data baru (JSON)
  let oldDetail = {};
  try { oldDetail = JSON.parse(existing.data || '{}'); } catch(e) {}
  
  const detailData = { ...oldDetail, ...b };
  delete detailData.id; delete detailData.nama; delete detailData.harga; 
  delete detailData.deskripsi; delete detailData.gambar; delete detailData.terjual;
  delete detailData.name; delete detailData.price; delete detailData.description; 
  delete detailData.imageUrl; delete detailData.sales; delete detailData.createdAt;
  delete detailData.created_at;

  db.prepare('UPDATE products SET nama=?, harga=?, deskripsi=?, gambar=?, terjual=?, data=? WHERE id=?')
    .run(nama, harga, deskripsi, gambar, terjual, JSON.stringify(detailData), req.params.id);
  res.json({ ok: true });
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================
// DELIVERY (PENGIRIMAN AKUN & POTONG STOK)
// ============================================
app.get('/api/orders/:orderId/delivery', (req, res) => {
    const orderId = req.params.orderId;
    
    // 1. Cek order
    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!orderRow) return res.status(404).json({ error: 'Order tidak ditemukan' });

    let orderData;
    try { orderData = JSON.parse(orderRow.data || '{}'); } catch(e) { return res.status(500).json({error: 'Format order rusak'}); }
    
    // 2. Pastikan sudah dibayar
    if (orderData.paymentStatus !== 'settlement' && orderData.paymentStatus !== 'paid') {
        return res.status(403).json({ error: 'Pembayaran belum diselesaikan' });
    }

    // 3. Jika sudah pernah diambil, kirim data yang tersimpan (Anti Double Claim)
    if (orderData.delivered && orderData.deliveryResult) {
        return res.json({
            success: true,
            order: { id: orderId, ...orderData },
            delivery: orderData.deliveryResult
        });
    }

    // 4. Proses pengiriman (jika belum)
    let deliveryResult = [];
    let items = orderData.items || [];

    for (const item of items) {
        const productRow = db.prepare('SELECT * FROM products WHERE id = ?').get(item.id);
        if (!productRow) continue;

        let productData = JSON.parse(productRow.data || '{}');
        let qty = item.qty || 1;
        let deliveredItem = { ...item, accounts: [], downloadLink: null };

        // Jika Akun Premium (Potong Stok)
        if (productData.type === 'premium-account' || productData.premiumAccounts) {
            let accounts = productData.premiumAccounts || [];
            
            if (accounts.length < qty) {
                qty = accounts.length; // Jika stok kurang, ambil sisa
            }

            // Ambil akun sebanyak Qty
            deliveredItem.accounts = accounts.slice(0, qty);
            
            // Simpan sisa stok
            productData.premiumAccounts = accounts.slice(qty);
            productData.stock = productData.premiumAccounts.length;
            
            // Update produk di DB
            db.prepare('UPDATE products SET data = ? WHERE id = ?').run(JSON.stringify(productData), item.id);
        } 
        // Jika Produk Digital (Link)
        else {
            deliveredItem.downloadLink = productData.downloadLink || null;
        }

        // Update jumlah terjual (sales)
        const currentSales = parseInt(productRow.terjual) || 0;
        db.prepare('UPDATE products SET terjual = ? WHERE id = ?').run(currentSales + qty, item.id);

        deliveryResult.push(deliveredItem);
    }

    // 5. Simpan hasil delivery ke order (agar tidak bisa di-refresh berkali-kali)
    orderData.delivered = true;
    orderData.deliveryResult = deliveryResult;
    
    db.prepare('UPDATE orders SET data = ? WHERE id = ?').run(JSON.stringify(orderData), orderId);

    res.json({
        success: true,
        order: { id: orderId, ...orderData },
        delivery: deliveryResult
    });
});

// ============================================
// GENERIC COLLECTION (UNTUK ADMIN PANEL & API)
// ============================================
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
    
    // PERBAIKAN: Cari ID dari semua kemungkinan nama properti
    const qrId = data.id || data.qrId || data.qr_id || data.qrisId || data.qris_id || (data.data && data.data.id) || (data.qr && data.qr.id);
    // PERBAIKAN: Tangkap teks mentah QR jika ada
    const qrString = data.qris || data.qr_string || data.qrString || (data.data && data.data.qris);

    if (orderId) {
      ensureTable('orders');
      const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (row) {
        const obj = rowToObj(row);
        obj.uniqueAmount = uniqueAmount;
        if (qrId) obj.qrId = qrId;
        if (qrString) obj.qris = qrString;
        db.prepare('UPDATE orders SET data = ? WHERE id = ?').run(JSON.stringify(obj), orderId);
      }
    }
    
    // Kirim semua kemungkinan ke frontend
    res.json({ 
        success: true, 
        amount: uniqueAmount, 
        qrId: qrId || null,
        qris: qrString || null,
        qrUrl: qrId ? `/api/payment/qr/${qrId}` : null
    });
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