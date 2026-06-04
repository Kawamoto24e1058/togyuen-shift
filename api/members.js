// api/members.js
import { db } from './_lib/firebase-admin.js';

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Vercel/Local dispatch supporting action query param and raw url path parsing
  const urlParts = req.url.split('?')[0].split('/');
  const action = req.query.action || urlParts[3] || req.body.action || '';

  // ==========================================
  // DISPATCH: update (POST)
  // ==========================================
  if (req.method === 'POST' || action === 'update') {
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

  // ==========================================
  // DEFAULT: list (GET)
  // ==========================================
  if (req.method === 'GET') {
    try {
      console.info('[API Members GET] Fetching all members from Firestore...');
      const snapshot = await db.collection('members').get();
      const members = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        members.push({
          id: Number(doc.id),
          name: data.name,
          role: data.role || 'hall',
          roles: data.roles || [data.role || 'hall'],
          status: data.status || 'regular',
          emoji: data.roles?.includes('kitchen') ? '👨‍🍳' : '👩‍💼',
          color: data.roles?.includes('kitchen') ? '#ff7043' : '#ffb300',
          lineUserId: data.lineUserId || null,
          targetDays: data.targetDays || 10
        });
      });

      members.sort((a, b) => a.id - b.id);

      console.info(`[API Members GET] Found ${members.length} members.`);
      return res.status(200).json(members);
    } catch (err) {
      console.error('[API Members GET] Error:', err);
      return res.status(500).send('メンバー一覧の取得に失敗しました。');
    }
  }

  return res.status(405).send('Method Not Allowed');
}
