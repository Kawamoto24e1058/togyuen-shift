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

  // GET /api/holidays - 臨時休業日・特別営業日を日付配列として取得
  // (後方互換のため、レスポンスのトップレベルは従来通り「臨時休業日の配列」を
  //  直接返す関数としても呼べるように、holidays フィールドをそのまま返す。
  //  特別営業日(定休日を臨時で営業日にする)は openDays に分けて返す。)
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('holidays').get();
      const holidays = [];
      const openDays = [];
      snapshot.forEach(doc => {
        const data = doc.data() || {};
        if (data.type === 'open') {
          openDays.push(doc.id);
        } else {
          holidays.push(doc.id); // ドキュメントIDが日付（YYYY-MM-DD）
        }
      });
      return res.status(200).json({ holidays, openDays });
    } catch (err) {
      console.error('[API Holidays GET] Error:', err);
      return res.status(500).send('休業日データの取得に失敗しました。');
    }
  }

  // POST /api/holidays - 特定の日付の休業/特別営業設定をトグル（切り替え）
  // body: { date, type } — type省略時は従来通り 'closed'（臨時休業）。'open' で特別営業（定休日を営業日にする）。
  if (req.method === 'POST') {
    try {
      const { date, type: rawType } = req.body || {};
      const type = rawType === 'open' ? 'open' : 'closed';
      if (!date) {
        return res.status(400).send('必須パラメータ（date）が指定されていません。');
      }

      // 日付フォーマットの簡易チェック（YYYY-MM-DD）
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).send('無効な日付フォーマットです。YYYY-MM-DD形式である必要があります。');
      }

      const docRef = db.collection('holidays').doc(date);
      const doc = await docRef.get();

      let isActive = false;
      if (doc.exists && (doc.data().type === 'open' ? 'open' : 'closed') === type) {
        // 同じ種別が既に設定されている場合は解除（通常の状態に戻す）
        await docRef.delete();
        console.log(`[API Holidays POST] Removed ${type} override: ${date}`);
      } else {
        // 未設定、または別の種別が設定されている場合はこの種別で上書き設定
        await docRef.set({
          date,
          type,
          reason: type === 'open' ? '特別営業' : '臨時休業',
          createdAt: new Date().toISOString()
        });
        isActive = true;
        console.log(`[API Holidays POST] Set ${type} override: ${date}`);
      }

      // 更新後の全休業日/特別営業日リストを取得して返却
      const snapshot = await db.collection('holidays').get();
      const updatedHolidays = [];
      const updatedOpenDays = [];
      snapshot.forEach(d => {
        const data = d.data() || {};
        if (data.type === 'open') {
          updatedOpenDays.push(d.id);
        } else {
          updatedHolidays.push(d.id);
        }
      });

      const message = type === 'open'
        ? (isActive ? '特別営業日に設定しました。' : '特別営業日の設定を解除しました。')
        : (isActive ? '臨時休業日に設定しました。' : '通常営業に戻しました。');

      return res.status(200).json({
        message,
        date,
        type,
        isActive,
        // 後方互換: 臨時休業トグルを呼んでいた既存コードのため isHoliday も維持
        isHoliday: type === 'closed' ? isActive : undefined,
        holidays: updatedHolidays,
        openDays: updatedOpenDays
      });
    } catch (err) {
      console.error('[API Holidays POST] Error:', err);
      return res.status(500).send('休業日の設定切り替えに失敗しました。');
    }
  }

  return res.status(404).send('Method Not Allowed');
}
