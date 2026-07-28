// api/special-periods.js
import { db } from './_lib/firebase-admin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/special-periods
  if (req.method === 'GET') {
    try {
      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=59');
      const snapshot = await db.collection('special_shift_periods').get();
      const periods = [];
      snapshot.forEach(doc => {
        periods.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // 開始日でソート
      periods.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
      return res.status(200).json(periods);
    } catch (err) {
      console.warn('[API SpecialPeriods GET] Warning (falling back to empty list):', err);
      return res.status(200).json([]);
    }
  }

  // POST /api/special-periods
  if (req.method === 'POST') {
    try {
      const payload = req.body || {};
      const { action, id, title, startDate, endDate, deadlineDate, isActive } = payload;

      if (action === 'delete') {
        if (!id) {
          return res.status(400).send('削除対象の ID が指定されていません。');
        }
        await db.collection('special_shift_periods').doc(String(id)).delete();
        console.info(`[API SpecialPeriods POST] Deleted period: ${id}`);
        return res.status(200).json({ success: true, message: '特別募集枠を削除しました。', id });
      }

      if (!title || !startDate || !endDate || !deadlineDate) {
        return res.status(400).send('必須項目（タイトル、開始日、終了日、締切日時）を入力してください。');
      }

      const docId = id || db.collection('special_shift_periods').doc().id;
      const docRef = db.collection('special_shift_periods').doc(String(docId));

      const periodData = {
        id: String(docId),
        title: title.trim(),
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        deadlineDate: new Date(deadlineDate).toISOString(),
        isActive: isActive !== false,
        updatedAt: new Date().toISOString()
      };

      await docRef.set(periodData, { merge: true });
      console.info(`[API SpecialPeriods POST] Saved period: ${docId}`);

      return res.status(200).json({
        success: true,
        message: `特別募集枠「${title}」を保存しました。`,
        period: periodData
      });
    } catch (err) {
      console.error('[API SpecialPeriods POST] Error:', err);
      return res.status(500).send(`特別募集枠の保存に失敗しました: ${err.message}`);
    }
  }

  return res.status(405).send('Method Not Allowed');
}
