// api/auth.js
import { db } from './_lib/firebase-admin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Vercel/Local dispatch supporting subpath query param and raw url path parsing
  const urlParts = req.url.split('?')[0].split('/');
  const subpath = req.query.subpath || urlParts[3] || req.body.action || '';

  // ==========================================
  // DISPATCH: line-url (GET)
  // ==========================================
  if (subpath === 'line-url') {
    const channelId = process.env.LINE_CHANNEL_ID;
    const redirectUri = process.env.LINE_REDIRECT_URI || 'http://localhost:3000/callback';
    const pwaSessionId = req.query.pwaSessionId || new URL(req.url, 'http://localhost').searchParams.get('pwaSessionId');
    const state = pwaSessionId || Math.random().toString(36).substring(2, 15);

    if (!channelId) {
      console.error('[LINE URL] LINE_CHANNEL_ID is not configured.');
      return res.status(500).send('LINEログインの設定が完了していません（LINE_CHANNEL_IDが未設定）。');
    }

    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?` +
      `response_type=code` +
      `&client_id=${channelId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&scope=profile%20openid`;

    return res.status(200).json({ url: lineAuthUrl, state });
  }

  // ==========================================
  // DISPATCH: callback (POST)
  // ==========================================
  if (subpath === 'callback') {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { code, state } = req.body;
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
      const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

      const profileResponse = await fetch('https://api.line.me/v2/profile', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
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

      const membersRef = db.collection('members');
      const snapshot = await membersRef.where('lineUserId', '==', lineUserId).limit(1).get();

      if (snapshot.empty) {
        console.warn(`[LINE Callback] Staff not found for lineUserId: ${lineUserId}. Registration required.`);
        
        if (state && state.startsWith('pwa_')) {
          await db.collection('pwa_sessions').doc(state).set({
            authenticated: true,
            user: {
              registered: false,
              lineUserId,
              displayName: lineDisplayName
            },
            createdAt: new Date().toISOString()
          });
        }

        return res.status(200).json({
          registered: false,
          message: 'LINE 連携が完了していません。管理者に以下の LINE ユーザーID を伝えて登録してもらってください。',
          lineUserId,
          displayName: lineDisplayName,
        });
      }

      let memberInfo = null;
      snapshot.forEach(doc => {
        memberInfo = { id: doc.id, ...doc.data() };
      });

      const isAdmin = memberInfo.isAdmin || lineUserId === 'Uc00f6aceac05ad7709eddb25ffd6041a';

      const userRef = db.collection('users').doc(lineUserId);
      const userData = {
        lineUserId,
        name: memberInfo.name,
        role: memberInfo.role || (memberInfo.roles ? memberInfo.roles[0] : 'hall'),
        roles: memberInfo.roles || [memberInfo.role || 'hall'],
        status: memberInfo.status || 'regular',
        isAdmin,
        lastLoginAt: new Date().toISOString(),
      };
      await userRef.set(userData, { merge: true });

      if (state && state.startsWith('pwa_')) {
        await db.collection('pwa_sessions').doc(state).set({
          authenticated: true,
          user: {
            registered: true,
            id: Number(memberInfo.id),
            name: memberInfo.name,
            role: userData.role,
            roles: userData.roles,
            status: userData.status,
            isAdmin,
            lineUserId
          },
          createdAt: new Date().toISOString()
        });
      }

      return res.status(200).json({
        registered: true,
        message: 'LINEログイン認証に成功しました。',
        user: {
          lineUserId,
          id: Number(memberInfo.id),
          name: memberInfo.name,
          role: userData.role,
          roles: userData.roles,
          status: userData.status,
          isAdmin,
        }
      });
    } catch (err) {
      console.error('[LINE Callback] System Error:', err);
      return res.status(500).send('認証処理中にシステムエラーが発生しました。');
    }
  }

  // ==========================================
  // DISPATCH: line (POST)
  // ==========================================
  if (subpath === 'line') {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    try {
      const { code, staffId } = req.body;
      if (!code || !staffId) {
        return res.status(400).send('必須パラメータ（code, staffId）が不足しています。');
      }

      const memberRef = db.collection('members').doc(String(staffId));
      const memberDoc = await memberRef.get();
      
      let memberData;
      let lineUserId;
      if (!memberDoc.exists) {
        const staffNames = {
          1: { name: "佐藤", role: "kitchen", roles: ["kitchen"], status: "regular", emoji: "👨‍🍳", lineUserId: "U_sato_1" },
          2: { name: "鈴木", role: "kitchen", roles: ["kitchen", "hall"], status: "regular", emoji: "👨‍🍳", lineUserId: "U_suzuki_2" },
          3: { name: "高橋", role: "hall", roles: ["kitchen", "hall"], status: "regular", emoji: "👩‍💼", lineUserId: "U_takahashi_3" },
          4: { name: "田中", role: "hall", roles: ["hall"], status: "regular", emoji: "🧑‍💻", lineUserId: "U_tanaka_4" },
          5: { name: "渡辺", role: "hall", roles: ["hall"], status: "regular", emoji: "👱‍♀️", lineUserId: "U_watanabe_5" },
          6: { name: "伊藤", role: "kitchen", roles: ["kitchen"], status: "trainee", emoji: "👶", lineUserId: "U_ito_6" },
          7: { name: "山本", role: "hall", roles: ["hall"], status: "trainee", emoji: "🧒", lineUserId: "U_yamamoto_7" }
        };

        const seed = staffNames[staffId] || { name: `スタッフ${staffId}`, role: "hall", roles: ["hall"], status: "regular", emoji: "🧑‍🍳" };
        lineUserId = seed.lineUserId || `U06c755lineUser_${staffId}`;
        memberData = {
          ...seed,
          lineUserId: lineUserId,
          lineToken: `DUMMY_TOKEN_FOR_${staffId}_${seed.name}`
        };
        await memberRef.set(memberData);
        console.info(`[Mock Auth] Created seed member in Firestore: ${memberData.name}`);
      } else {
        memberData = memberDoc.data();
        if (memberData.lineUserId) {
          lineUserId = memberData.lineUserId;
        } else {
          lineUserId = `U06c755lineUser_${staffId}`;
          await memberRef.set({ lineUserId }, { merge: true });
          memberData.lineUserId = lineUserId;
        }
      }

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

  // ==========================================
  // DISPATCH: pwa-status (GET)
  // ==========================================
  if (subpath === 'pwa-status') {
    const pwaSessionId = req.query.pwaSessionId || new URL(req.url, 'http://localhost').searchParams.get('pwaSessionId');
    if (!pwaSessionId) {
      return res.status(400).send('pwaSessionId が提供されていません。');
    }
    
    try {
      const docRef = db.collection('pwa_sessions').doc(pwaSessionId);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        return res.status(200).json({ authenticated: false });
      }
      
      const data = doc.data();
      // 一度取得したセッション情報は使い捨てとして即時削除
      await docRef.delete();
      
      return res.status(200).json({
        authenticated: true,
        user: data.user
      });
    } catch (e) {
      console.error('[PWA Status Check] Error:', e);
      return res.status(500).send('エラーが発生しました。');
    }
  }

  // ==========================================
  // DISPATCH: register (POST)
  // ==========================================
  if (subpath === 'register') {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    try {
      const { name, roles, status, lineUserId } = req.body;

      if (!name || !roles || !roles.length || !status || !lineUserId) {
        return res.status(400).send('必須パラメータ（name, roles, status, lineUserId）が不足しています。');
      }

      console.info(`[API Register] Registering new staff. Name: ${name}, LineUserId: ${lineUserId}`);

      const membersRef = db.collection('members');
      const existingSnapshot = await membersRef.where('lineUserId', '==', lineUserId).limit(1).get();
      if (!existingSnapshot.empty) {
        return res.status(400).send('このLINEアカウントは既に登録されています。');
      }

      const allMembersSnapshot = await membersRef.get();
      let maxId = 0;
      allMembersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.id && Number(data.id) > maxId) {
          maxId = Number(data.id);
        }
      });
      const newId = maxId + 1;

      const isAdmin = newId === 1 || lineUserId === 'Uc00f6aceac05ad7709eddb25ffd6041a'; // 最初に登録したユーザー(ID 1)または指定IDを店長(管理者)とする

      const newMember = {
        id: newId,
        name: name.trim(),
        role: roles[0],
        roles: roles,
        status: status,
        lineUserId: lineUserId,
        isAdmin: isAdmin,
        lineToken: `DUMMY_TOKEN_FOR_${newId}_${name.trim()}`,
        createdAt: new Date().toISOString()
      };

      await membersRef.doc(String(newId)).set(newMember);
      console.info(`[API Register] Successfully created member in Firestore. Assigned ID: ${newId}. Admin: ${isAdmin}`);

      const userRef = db.collection('users').doc(lineUserId);
      await userRef.set({
        lineUserId,
        name: newMember.name,
        role: newMember.role,
        roles: newMember.roles,
        status: newMember.status,
        isAdmin: isAdmin,
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
          isAdmin: isAdmin,
        }
      });
    } catch (err) {
      console.error('[API Register] Error:', err);
      return res.status(500).send('プロフィール登録処理中にシステムエラーが発生しました。');
    }
  }

  return res.status(404).send('Not Found');
}
