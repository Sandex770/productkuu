const db = require('./db');
const rows = db.prepare('SELECT * FROM products').all();
console.log(rows);
