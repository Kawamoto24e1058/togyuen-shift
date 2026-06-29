// api/deadline.js
import { db } from './_lib/firebase-admin.js';

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/deadline
  if (req.method === 'GET') {
    try {
      const doc = await db.collection('config').doc('deadline').get();
      if (doc.exists) {
        return res.status(200).json(doc.data());
      } else {
        // デフォルト締め切り (未設定の場合)
        const defaultDeadline = {
          deadlineDate: "2026-06-30T23:59:59"
        };
        await db.collection('config').doc('deadline').set(defaultDeadline);
        return res.status(200).json(defaultDeadline);
      }
    } catch (err) {
      console.warn('[API Deadline GET] Warning (falling back to default deadline):', err);
      return res.status(200).json({ deadlineDate: "2026-06-30T23:59:59" });
    }
  }

  // POST /api/deadline
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      if (!payload || !payload.deadlineDate) {
        return res.status(400).send('締め切り日時 (deadlineDate) が指定されていません。');
      }

      await db.collection('config').doc('deadline').set({
        deadlineDate: payload.deadlineDate
      }, { merge: true });

      return res.status(200).json({
        message: '締め切り日時を正常に更新しました。',
        deadlineDate: payload.deadlineDate
      });
    } catch (err) {
      console.error('[API Deadline POST] Error:', err);
      return res.status(500).send('締め切り日時の更新に失敗しました。');
    }
  }

  return res.status(404).send('Method Not Allowed');
}
