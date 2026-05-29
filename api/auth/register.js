// api/auth/register.js
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
    const { name, roles, status, lineUserId } = req.body;

    if (!name || !roles || !roles.length || !status || !lineUserId) {
      return res.status(400).send('必須パラメータ（name, roles, status, lineUserId）が不足しています。');
    }

    console.info(`[API Register] Registering new staff. Name: ${name}, LineUserId: ${lineUserId}`);

    // 1. 重複登録チェック (すでに同じ lineUserId が登録されていないか)
    const membersRef = db.collection('members');
    const existingSnapshot = await membersRef.where('lineUserId', '==', lineUserId).limit(1).get();
    if (!existingSnapshot.empty) {
      return res.status(400).send('このLINEアカウントは既に登録されています。');
    }

    // 2. IDの自動連番採番 (現在の全membersの中から最大IDを取得して +1)
    const allMembersSnapshot = await membersRef.get();
    let maxId = 0;
    allMembersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.id && Number(data.id) > maxId) {
        maxId = Number(data.id);
      }
    });
    const newId = maxId + 1;

    // 3. Firestore `members` に新規登録
    const newMember = {
      id: newId,
      name: name.trim(),
      role: roles[0], // 主要ロールとして最初の役割を割り当て
      roles: roles,   // マルチロール対応の配列
      status: status, // 'regular' または 'trainee'
      lineUserId: lineUserId,
      lineToken: `DUMMY_TOKEN_FOR_${newId}_${name.trim()}`, // ダミーLINE Notifyトークンの割り当て
      createdAt: new Date().toISOString()
    };

    // ドキュメントIDを String(newId) に設定して一意に保存
    await membersRef.doc(String(newId)).set(newMember);
    console.info(`[API Register] Successfully created member in Firestore. Assigned ID: ${newId}`);

    // 4. `users` コレクションの更新（セッション・FCMトークン管理用）
    const userRef = db.collection('users').doc(lineUserId);
    await userRef.set({
      lineUserId,
      name: newMember.name,
      role: newMember.role,
      roles: newMember.roles,
      status: newMember.status,
      lastLoginAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({
      registered: true,
      message: '新規プロフィール登録およびログインに成功しました。',
      user: {
        lineUserId,
        id: newId,
        name: newMember.name,
        role: newMember.role,
        roles: newMember.roles,
        status: newMember.status,
      }
    });
  } catch (err) {
    console.error('[API Register] Error:', err);
    return res.status(500).send('プロフィール登録処理中にシステムエラーが発生しました。');
  }
}
