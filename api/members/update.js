// api/members/update.js
import { db } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { id, targetDays } = req.body || {};
    if (!id || targetDays === undefined) {
      return res.status(400).send('必須パラメータ（id, targetDays）が不足しています。');
    }

    const memberIdStr = String(id);
    console.info(`[API Members Update] Updating targetDays for member ${memberIdStr} to ${targetDays}`);

    const docRef = db.collection('members').doc(memberIdStr);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send('指定されたメンバーが見つかりません。');
    }

    await docRef.update({
      targetDays: Number(targetDays),
      updatedAt: new Date().toISOString()
    });

    console.info(`[API Members Update] Successfully updated member ${memberIdStr}!`);

    return res.status(200).json({
      success: true,
      message: 'メンバー設定を更新しました。',
      id: Number(id),
      targetDays: Number(targetDays)
    });
  } catch (err) {
    console.error('[API Members Update] Error:', err);
    return res.status(500).send('メンバー設定の更新に失敗しました。');
  }
}
