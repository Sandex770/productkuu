const fs = require('fs');
const path = require('path');
const db = require('./db');

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/products.json'), 'utf8')
);

const insert = db.prepare('INSERT OR REPLACE INTO products (id, nama, harga, deskripsi, gambar) VALUES (?, ?, ?, ?, ?)');

const tx = db.transaction(function (rows) {
  for (const r of rows) {
    insert.run(
      r.id,
      r.nama || r.name || '-',
      r.harga || r.price || 0,
      r.deskripsi || r.description || '',
      r.gambar || r.image || ''
    );
  }
});

tx(data);
console.log('Import selesai. Total:', data.length);
