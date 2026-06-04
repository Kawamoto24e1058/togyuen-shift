// api/members.js
import { db } from './lib/firebase-admin.js';

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

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
        emoji: data.roles?.includes('kitchen') ? '👨‍🍳' : '👩‍💼', // デフォルト絵文字の割り当て
        color: data.roles?.includes('kitchen') ? '#ff7043' : '#ffb300', // ロール別の色
        lineUserId: data.lineUserId || null,
        targetDays: data.targetDays || 10
      });
    });

    // ID順に並び替え
    members.sort((a, b) => a.id - b.id);

    console.info(`[API Members GET] Found ${members.length} members.`);
    return res.status(200).json(members);
  } catch (err) {
    console.error('[API Members GET] Error:', err);
    return res.status(500).send('メンバー一覧の取得に失敗しました。');
  }
}
