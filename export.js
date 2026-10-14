const admin = require('firebase-admin');
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
});

const COLS = ['admin_revenue','orders','products','settings','users','withdrawals'];

(async () => {
  for (const col of COLS) {
    try {
      const snap = await admin.firestore().collection(col).get();
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      fs.writeFileSync(col + '.json', JSON.stringify(data, null, 2));
      console.log(col, '→', data.length);
    } catch (e) {
      console.log(col, 'ERROR:', e.message);
    }
  }
})();
