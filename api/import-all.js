const fs = require('fs');
const path = require('path');
const db = require('./db');

const COLS = ['admin_revenue','orders','settings','users','withdrawals'];

for (const col of COLS) {
  const file = path.join(__dirname, '../data/' + col + '.json');
  if (!fs.existsSync(file)) { console.log(col, 'skip'); continue; }

  db.exec('CREATE TABLE IF NOT EXISTS ' + col + ' (id TEXT PRIMARY KEY, data TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');

  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stmt = db.prepare('INSERT OR REPLACE INTO ' + col + ' (id, data) VALUES (?, ?)');

  const tx = db.transaction(function (items) {
    for (const r of items) {
      const id = r.id || Date.now().toString() + Math.random();
      const copy = { ...r };
      delete copy.id;
      stmt.run(id, JSON.stringify(copy));
    }
  });
  tx(rows);
  console.log(col, '→', rows.length);
}
console.log('Selesai.');
