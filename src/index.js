require('dotenv').config();
const express = require('express');
const { initFirebase } = require('./firebase');
const { webhookMiddleware, handleWebhook } = require('./lineBot');
const { startScheduler, triggerNow, scheduleTest, getSchedulerInfo } = require('./scheduler');
const { createAndSetRichMenu } = require('./richMenu');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Firebase ─────────────────────────────────────────────────────────────────
try {
  initFirebase();
} catch (err) {
  console.warn('Firebase init skipped:', err.message);
}

// ─── LINE webhook ─────────────────────────────────────────────────────────────
app.post('/webhook', webhookMiddleware, handleWebhook);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'LINE Fruit Bot running!', time: new Date().toISOString() });
});

// ─── Admin: manual broadcast trigger (protect with token in production) ───────
app.post('/admin/broadcast', express.json(), async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    await triggerNow();
    res.json({ ok: true, message: 'Broadcast sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: test scheduler (fires in 10s, watch server logs) ─────────────────
app.post('/admin/test-scheduler', express.json(), (req, res) => {
  const info = getSchedulerInfo();
  const delay = parseInt(req.query.delay) || 10;
  const fireAt = scheduleTest(delay);
  res.json({
    ok: true,
    message: `Scheduler test job will fire in ${delay}s — watch server logs`,
    fireAt,
    schedulerInfo: info,
  });
});

// ─── Admin: create/reset rich menu ───────────────────────────────────────────
app.post('/admin/setup-richmenu', express.json(), async (req, res) => {
  try {
    const richMenuId = await createAndSetRichMenu();
    res.json({ ok: true, richMenuId, message: 'Rich menu created and set as default' });
  } catch (err) {
    console.error('Rich menu setup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
});
