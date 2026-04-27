const admin = require('firebase-admin');
const crypto = require('crypto');

let _db = null;
let _initialized = false;

// Rebuild PEM from raw base64 — guarantees exactly 64-char lines that node-forge accepts
function normalizePEM(rawKey) {
  const pem = rawKey.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

function initFirebase() {
  if (_initialized) return;

  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
    );
    serviceAccount.private_key = normalizePEM(serviceAccount.private_key);
    console.log('[Firebase] using B64, key length:', serviceAccount.private_key.length);
  } else {
    const key = process.env.FIREBASE_PRIVATE_KEY || '';
    serviceAccount = {
      project_id:   process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key:  normalizePEM(key),
    };
    console.log('[Firebase] using env vars, project_id:', serviceAccount.project_id);
  }

  const credential = admin.credential.cert(serviceAccount);
  admin.initializeApp({ credential, projectId: serviceAccount.project_id });

  _db = admin.firestore();
  _initialized = true;
  console.log('Firebase initialized');
}

function getDb() {
  if (!_initialized) initFirebase();
  return _db;
}

async function savePriceSnapshot(prices) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  await db.collection('price_snapshots').doc(today).set({
    prices,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: prices[0]?._mock ? 'mock' : 'talaadthai',
  });
}

async function getLatestPrices() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const doc = await db.collection('price_snapshots').doc(today).get();
  return doc.exists ? doc.data().prices : null;
}

async function saveUser(userId, displayName = '') {
  const db = getDb();
  await db.collection('users').doc(userId).set(
    { userId, displayName, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function getAllUserIds() {
  const db = getDb();
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map((d) => d.id);
}

module.exports = { initFirebase, getDb, savePriceSnapshot, getLatestPrices, saveUser, getAllUserIds };
