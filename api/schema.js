const db = require('./db'); db.exec(` 
  CREATE TABLE IF NOT EXISTS products 
  (
    id TEXT PRIMARY KEY, nama TEXT 
    NOT NULL, harga INTEGER NOT NULL, 
    deskripsi TEXT, gambar TEXT, 
    created_at TEXT DEFAULT 
    CURRENT_TIMESTAMP
  ); `);
console.log('Tabel products siap.');

