// api/shift-settings.js
import { db } from './_lib/firebase-admin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/shift-settings
  if (req.method === 'GET') {
    try {
      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=59');
      const period = req.query.period;
      if (period) {
        const doc = await db.collection('shift_settings').doc(period).get();
        if (doc.exists && doc.data().isCustom !== false) {
          return res.status(200).json(doc.data());
        }
        return res.status(200).json({ period, isCustom: false });
      }

      // 全設定取得
      const snapshot = await db.collection('shift_settings').get();
      const settingsMap = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.isCustom !== false) {
          settingsMap[doc.id] = data;
        }
      });
      return res.status(200).json(settingsMap);
    } catch (err) {
      console.warn('[API ShiftSettings GET] Warning (falling back to empty settings):', err);
      return res.status(200).json({});
    }
  }

  // POST /api/shift-settings
  if (req.method === 'POST') {
    try {
      const payload = req.body || {};
      const { period, isCustom, deadlineDate, customStartDate, customEndDate, note } = payload;

      if (!period) {
        return res.status(400).send('必須パラメータ (period) が不足しています。');
      }

      const docRef = db.collection('shift_settings').doc(period);

      if (isCustom === false) {
        // 設定のリセット（削除）
        await docRef.delete();
        console.info(`[API ShiftSettings POST] Reset custom settings for period: ${period}`);
        return res.status(200).json({
          success: true,
          message: `${period} の特別設定をリセット（デフォルトに戻す）しました。`,
          period,
          isCustom: false
        });
      }

      const settingData = {
        period,
        isCustom: true,
        deadlineDate: deadlineDate || null,
        customStartDate: customStartDate || null,
        customEndDate: customEndDate || null,
        note: note || '',
        updatedAt: new Date().toISOString()
      };

      await docRef.set(settingData, { merge: true });
      console.info(`[API ShiftSettings POST] Saved custom settings for period: ${period}`);

      return res.status(200).json({
        success: true,
        message: `${period} の特別設定を保存しました。`,
        setting: settingData
      });
    } catch (err) {
      console.error('[API ShiftSettings POST] Error:', err);
      return res.status(500).send(`特別設定の保存に失敗しました: ${err.message}`);
    }
  }

  return res.status(405).send('Method Not Allowed');
}
