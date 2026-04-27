const admin = require('firebase-admin');

let _db = null;
let _initialized = false;

function initFirebase() {
  if (_initialized) return;

  const credential = admin.credential.cert({
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    // Render stores key as multi-line; local .env stores \n as literal — handle both
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  });

  admin.initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID,
  });

  _db = admin.firestore();
  _initialized = true;
  console.log('Firebase initialized');
}

function getDb() {
  if (!_initialized) initFirebase();
  return _db;
}

// Save today's price snapshot
async function savePriceSnapshot(prices) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  await db.collection('price_snapshots').doc(today).set({
    prices,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: prices[0]?._mock ? 'mock' : 'talaadthai',
  });
}

// Get latest price snapshot
async function getLatestPrices() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const doc = await db.collection('price_snapshots').doc(today).get();
  return doc.exists ? doc.data().prices : null;
}

// Save a LINE user ID when they add the bot
async function saveUser(userId, displayName = '') {
  const db = getDb();
  await db.collection('users').doc(userId).set(
    { userId, displayName, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

// Get all subscribed user IDs for multicast (max 500 per call)
async function getAllUserIds() {
  const db = getDb();
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map((d) => d.id);
}

module.exports = { initFirebase, getDb, savePriceSnapshot, getLatestPrices, saveUser, getAllUserIds };
