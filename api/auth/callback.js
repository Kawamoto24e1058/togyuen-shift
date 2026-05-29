// api/auth/callback.js
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

  const { code } = req.body;
  if (!code) {
    return res.status(400).send('認可コード (code) が提供されていません。');
  }

  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const redirectUri = process.env.LINE_REDIRECT_URI || 'http://localhost:3000/callback';

  if (!channelId || !channelSecret) {
    console.error('[LINE Callback] LINE_CHANNEL_ID or LINE_CHANNEL_SECRET is missing.');
    return res.status(500).send('LINEログイン環境変数の設定が不足しています。');
  }

  try {
    // 1. 認可コードをアクセストークンと交換する
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[LINE Callback] Token exchange failed:', errText);
      return res.status(400).send('LINEログインのトークン取得に失敗しました。');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. アクセストークンを使用してLINEプロファイル情報を取得する
    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!profileResponse.ok) {
      const errText = await profileResponse.text();
      console.error('[LINE Callback] Profile fetch failed:', errText);
      return res.status(500).send('LINEプロファイルの取得に失敗しました。');
    }

    const profileData = await profileResponse.json();
    const lineUserId = profileData.userId;
    const lineDisplayName = profileData.displayName;

    console.info(`[LINE Callback] Successful LINE auth. UserID: ${lineUserId}, Name: ${lineDisplayName}`);

    // 3. Firestore の members コレクションから lineUserId が一致するスタッフを検索
    const membersRef = db.collection('members');
    const snapshot = await membersRef.where('lineUserId', '==', lineUserId).limit(1).get();

    if (snapshot.empty) {
      // 一致するスタッフが見つからない場合
      // セキュリティログ、および管理者による紐付け手動登録のために lineUserId を返却する
      console.warn(`[LINE Callback] Staff not found for lineUserId: ${lineUserId}. Registration required.`);
      return res.status(200).json({
        registered: false,
        message: 'LINE 連携が完了していません。管理者に以下の LINE ユーザーID を伝えて登録してもらってください。',
        lineUserId,
        displayName: lineDisplayName,
      });
    }

    // スタッフが見つかった場合、ログイン成功としてスタッフ情報を返す
    let memberInfo = null;
    snapshot.forEach(doc => {
      memberInfo = { id: doc.id, ...doc.data() };
    });

    // ログイン情報をFirestoreのusersコレクションに登録・更新（FCMトークン等の管理のため）
    const userRef = db.collection('users').doc(lineUserId);
    await userRef.set({
      lineUserId,
      name: memberInfo.name,
      role: memberInfo.role || (memberInfo.roles ? memberInfo.roles[0] : 'hall'),
      roles: memberInfo.roles || [memberInfo.role || 'hall'],
      status: memberInfo.status || 'regular',
      lastLoginAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({
      registered: true,
      message: 'LINEログイン認証に成功しました。',
      user: {
        lineUserId,
        id: memberInfo.id,
        name: memberInfo.name,
        role: memberInfo.role || (memberInfo.roles ? memberInfo.roles[0] : 'hall'),
        roles: memberInfo.roles || [memberInfo.role || 'hall'],
        status: memberInfo.status || 'regular',
      }
    });
  } catch (err) {
    console.error('[LINE Callback] System Error:', err);
    return res.status(500).send('認証処理中にシステムエラーが発生しました。');
  }
}
