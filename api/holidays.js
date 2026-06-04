// api/holidays.js
import { db } from './_lib/firebase-admin.js';

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/holidays - 全休業日を日付配列として取得
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('holidays').get();
      const holidays = [];
      snapshot.forEach(doc => {
        holidays.push(doc.id); // ドキュメントIDが日付（YYYY-MM-DD）
      });
      return res.status(200).json(holidays);
    } catch (err) {
      console.error('[API Holidays GET] Error:', err);
      return res.status(500).send('休業日データの取得に失敗しました。');
    }
  }

  // POST /api/holidays - 特定の日付の休業設定をトグル（切り替え）
  if (req.method === 'POST') {
    try {
      const { date } = req.body || {};
      if (!date) {
        return res.status(400).send('必須パラメータ（date）が指定されていません。');
      }

      // 日付フォーマットの簡易チェック（YYYY-MM-DD）
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).send('無効な日付フォーマットです。YYYY-MM-DD形式である必要があります。');
      }

      const docRef = db.collection('holidays').doc(date);
      const doc = await docRef.get();

      let isHoliday = false;
      if (doc.exists) {
        // すでに登録されている場合は解除（通常営業に戻す）
        await docRef.delete();
        console.log(`[API Holidays POST] Removed holiday: ${date}`);
      } else {
        // 登録されていない場合は設定（臨時休業に設定）
        await docRef.set({
          date,
          reason: '臨時休業',
          createdAt: new Date().toISOString()
        });
        isHoliday = true;
        console.log(`[API Holidays POST] Added holiday: ${date}`);
      }

      // 更新後の全休業日リストを取得して返却
      const snapshot = await db.collection('holidays').get();
      const updatedHolidays = [];
      snapshot.forEach(d => {
        updatedHolidays.push(d.id);
      });

      return res.status(200).json({
        message: isHoliday ? '臨時休業日に設定しました。' : '通常営業に戻しました。',
        date,
        isHoliday,
        holidays: updatedHolidays
      });
    } catch (err) {
      console.error('[API Holidays POST] Error:', err);
      return res.status(500).send('休業日の設定切り替えに失敗しました。');
    }
  }

  return res.status(404).send('Method Not Allowed');
}
