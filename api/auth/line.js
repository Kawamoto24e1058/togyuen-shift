// api/auth/line.js
import { db } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
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
    const { code, staffId } = req.body;
    if (!code || !staffId) {
      return res.status(400).send('必須パラメータ（code, staffId）が不足しています。');
    }

    // 模擬 LINE ユーザー ID の一意生成
    const lineUserId = `U06c755lineUser_${staffId}`;

    // Firestore からメンバーを検索、存在しなければシードデータを自動作成（開発支援用）
    const memberRef = db.collection('members').doc(String(staffId));
    const memberDoc = await memberRef.get();
    
    let memberData;
    if (!memberDoc.exists) {
      // 開発中の検証がスムーズに進むよう、メンバー未登録の場合はマスタデータで自動初期化する
      const staffNames = {
        1: { name: "佐藤", role: "kitchen", roles: ["kitchen"], status: "regular", emoji: "👨‍🍳" },
        2: { name: "鈴木", role: "kitchen", roles: ["kitchen", "hall"], status: "regular", emoji: "👨‍🍳" },
        3: { name: "高橋", role: "hall", roles: ["kitchen", "hall"], status: "regular", emoji: "👩‍💼" },
        4: { name: "田中", role: "hall", roles: ["hall"], status: "regular", emoji: "🧑‍💻" },
        5: { name: "渡辺", role: "hall", roles: ["hall"], status: "regular", emoji: "👱‍♀️" },
        6: { name: "伊藤", role: "kitchen", roles: ["kitchen"], status: "trainee", emoji: "👶" },
        7: { name: "山本", role: "hall", roles: ["hall"], status: "trainee", emoji: "🧒" }
      };

      const seed = staffNames[staffId] || { name: `スタッフ${staffId}`, role: "hall", roles: ["hall"], status: "regular", emoji: "🧑‍🍳" };
      memberData = {
        ...seed,
        lineUserId: lineUserId, // 最初から模擬 LINE ID を結びつけ
        lineToken: `DUMMY_TOKEN_FOR_${staffId}_${seed.name}`
      };
      await memberRef.set(memberData);
      console.info(`[Mock Auth] Created seed member in Firestore: ${memberData.name}`);
    } else {
      memberData = memberDoc.data();
      // lineUserId が未登録の場合はバインドを自動補完
      if (!memberData.lineUserId) {
        await memberRef.set({ lineUserId }, { merge: true });
        memberData.lineUserId = lineUserId;
      }
    }

    // users コレクション（ログイン中のユーザー一覧とFCMトークンの格納先）を更新
    const userRef = db.collection('users').doc(lineUserId);
    await userRef.set({
      lineUserId,
      name: memberData.name,
      role: memberData.role || (memberData.roles ? memberData.roles[0] : 'hall'),
      roles: memberData.roles || [memberData.role || 'hall'],
      status: memberData.status || 'regular',
      lastLoginAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({
      message: 'LINEログイン認証に成功しました。 (模擬ログイン環境)',
      user: {
        lineUserId,
        name: memberData.name,
        role: memberData.role || (memberData.roles ? memberData.roles[0] : 'hall'),
        roles: memberData.roles || [memberData.role || 'hall'],
        status: memberData.status || 'regular'
      }
    });
  } catch (err) {
    console.error('[Mock Auth] Error:', err);
    return res.status(500).send('模擬ログイン処理中にシステムエラーが発生しました。');
  }
}
