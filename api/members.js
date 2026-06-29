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
  const action = req.query.action || urlParts[3] || (req.body && req.body.action) || '';

  // ==========================================
  // DISPATCH: archive (POST)
  // ==========================================
  if (action === 'archive') {
    try {
      const { id, isActive } = req.body || {};
      if (!id || isActive === undefined) {
        return res.status(400).send('必須パラメータ（id, isActive）が不足しています。');
      }

      const memberIdStr = String(id);
      console.info(`[API Members Archive] Setting isActive for member ${memberIdStr} to ${isActive}`);

      const docRef = db.collection('members').doc(memberIdStr);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).send('指定されたメンバーが見つかりません。');
      }

      await docRef.update({
        isActive: Boolean(isActive),
        updatedAt: new Date().toISOString()
      });

      console.info(`[API Members Archive] Successfully updated member ${memberIdStr}!`);

      return res.status(200).json({
        success: true,
        message: isActive ? 'メンバーを有効化（復職）しました。' : 'メンバーを退職処理（非表示）にしました。',
        id: Number(id),
        isActive: Boolean(isActive)
      });
    } catch (err) {
      console.error('[API Members Archive] Error:', err);
      return res.status(500).send('メンバーのアーカイブ処理に失敗しました。');
    }
  }

  // ==========================================
  // DISPATCH: update-admin (POST)
  // ==========================================
  if (action === 'update-admin') {
    try {
      const { id, isAdmin } = req.body || {};
      if (id === undefined || isAdmin === undefined) {
        return res.status(400).send('必須パラメータ（id, isAdmin）が不足しています。');
      }

      const memberIdStr = String(id);
      console.info(`[API Members Update Admin] Updating isAdmin for member ${memberIdStr} to ${isAdmin}`);

      const docRef = db.collection('members').doc(memberIdStr);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).send('指定されたメンバーが見つかりません。');
      }

      await docRef.update({
        isAdmin: Boolean(isAdmin),
        updatedAt: new Date().toISOString()
      });

      console.info(`[API Members Update Admin] Successfully updated member ${memberIdStr}!`);

      return res.status(200).json({
        success: true,
        message: '管理者権限を更新しました。',
        id: Number(id),
        isAdmin: Boolean(isAdmin)
      });
    } catch (err) {
      console.error('[API Members Update Admin] Error:', err);
      return res.status(500).send('管理者権限の更新に失敗しました。');
    }
  }

  // ==========================================
  // DISPATCH: update (POST)
  // ==========================================
  if (action === 'update' || (req.method === 'POST' && action !== 'archive' && action !== 'update-admin')) {
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
          name: data.fullName || data.name,
          initialChar: data.shortName || data.initialChar || null,
          role: data.role || 'hall',
          roles: data.roles || [data.role || 'hall'],
          status: data.isTrainee ? 'trainee' : (data.status || 'regular'),
          isTrainee: data.isTrainee !== undefined ? data.isTrainee : (data.status === 'trainee'),
          isActive: data.isActive !== false,
          isAdmin: data.isAdmin === true,
          emoji: data.roles?.includes('kitchen') ? '👨‍🍳' : '👩‍💼',
          color: data.roles?.includes('kitchen') ? '#ff7043' : '#ffb300',
          lineUserId: data.lineUserId || null,
          targetDays: data.targetDays || 10,
          passcode: data.passcode || '8888'
        });
      });

      members.sort((a, b) => a.id - b.id);

      console.info(`[API Members GET] Found ${members.length} members.`);
      return res.status(200).json(members);
    } catch (err) {
      console.warn('[API Members GET] Warning (falling back to empty list):', err);
      return res.status(200).json([]);
    }
  }

  return res.status(405).send('Method Not Allowed');
}
