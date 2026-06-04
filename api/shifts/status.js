// api/shifts/status.js
import { db } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const period = req.query.period || req.body.period || '2026-06';

  // GET: 公開ステータスの取得
  if (req.method === 'GET') {
    try {
      console.info(`[API Shift Status GET] Fetching status for period: ${period}`);
      const docRef = db.collection('shift_status').doc(period);
      const doc = await docRef.get();
      
      let status = 'draft'; // デフォルトは下書き
      if (doc.exists) {
        status = doc.data().status || 'draft';
      }
      
      return res.status(200).json({ period, status });
    } catch (err) {
      console.error('[API Shift Status GET] Error:', err);
      return res.status(500).send('公開ステータスの取得に失敗しました。');
    }
  }

  // POST: 公開ステータスの更新
  if (req.method === 'POST') {
    try {
      const { status } = req.body || {};
      if (!status || !['draft', 'published'].includes(status)) {
        return res.status(400).send('無効なステータス値です。"draft" または "published" を指定してください。');
      }

      console.info(`[API Shift Status POST] Updating status for period: ${period} -> ${status}`);
      const docRef = db.collection('shift_status').doc(period);
      await docRef.set({
        period,
        status,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return res.status(200).json({
        success: true,
        message: `シフトステータスを ${status === 'published' ? '公開済み' : '下書き'} に更新しました。`,
        period,
        status
      });
    } catch (err) {
      console.error('[API Shift Status POST] Error:', err);
      return res.status(500).send('公開ステータスの更新に失敗しました。');
    }
  }

  return res.status(404).send('Method Not Allowed');
}
