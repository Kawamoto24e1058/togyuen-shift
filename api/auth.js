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
  const subpath = req.query.subpath || urlParts[3] || (req.body && req.body.action) || '';

  // ==========================================
  // DISPATCH: register (POST)
  // ==========================================
  if (subpath === 'register') {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    try {
      const { name, initialChar, roles, status, passcode } = req.body;

      if (!name || !roles || !roles.length || !status) {
        return res.status(400).send('必須パラメータ（name, roles, status）が不足しています。');
      }

      console.info(`[API Register] Registering new staff. Name: ${name}`);

      const membersRef = db.collection('members');
      const allMembersSnapshot = await membersRef.get();
      let maxId = 0;
      allMembersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.id && Number(data.id) > maxId) {
          maxId = Number(data.id);
        }
      });
      const newId = maxId + 1;

      // The first registered member is admin
      const isAdmin = newId === 1;

      const defaultEmoji = roles.includes('kitchen') ? '👨‍🍳' : '👩‍💼';
      const defaultColor = roles.includes('kitchen') ? '#ff7043' : '#ffb300';
      const resolvedInitial = initialChar ? initialChar.trim().substring(0, 1) : name.trim().substring(0, 1);

      const newMember = {
        id: String(newId),
        fullName: name.trim(),
        shortName: resolvedInitial,
        role: roles[0] || 'hall',
        roles: roles || ['hall'],
        isTrainee: status === 'trainee',
        isActive: true,
        isAdmin: isAdmin,
        passcode: passcode ? String(passcode).trim() : '8888',
        pushSubscription: {},
        // Compatibility properties
        name: name.trim(),
        initialChar: resolvedInitial,
        status: status || 'regular',
        emoji: defaultEmoji,
        color: defaultColor,
        targetDays: 10,
        pushSubscriptions: [],
        createdAt: new Date().toISOString()
      };

      await membersRef.doc(String(newId)).set(newMember);
      console.info(`[API Register] Successfully created member in Firestore. Assigned ID: ${newId}. Admin: ${isAdmin}`);

      return res.status(200).json({
        registered: true,
        message: '新規プロフィール登録およびログインに成功しました。',
        user: {
          id: Number(newId),
          name: newMember.name,
          initialChar: newMember.initialChar,
          role: newMember.role,
          roles: newMember.roles,
          status: newMember.status,
          isAdmin: isAdmin,
          avatar: defaultEmoji,
          passcode: newMember.passcode
        }
      });
    } catch (err) {
      console.error('[API Register] Error:', err);
      return res.status(500).send('プロフィール登録処理中にシステムエラーが発生しました。');
    }
  }

  // ==========================================
  // DISPATCH: reset (POST)
  // ==========================================
  if (subpath === 'reset') {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    try {
      console.info('[API Reset] Resetting database collections...');
      
      // 1. Delete all documents in members collection
      const membersSnap = await db.collection('members').get();
      const batch = db.batch();
      membersSnap.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // 2. Delete all documents in submissions collection
      const subsSnap = await db.collection('submissions').get();
      subsSnap.forEach(doc => {
        batch.delete(doc.ref);
      });

      // 3. Delete all documents in users collection (obsolete LINE users)
      const usersSnap = await db.collection('users').get();
      usersSnap.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.info('[API Reset] Database reset successful. Members, submissions, and users collections cleared.');
      
      return res.status(200).json({ success: true, message: 'データベースのリセットが完了しました。すべてのデータがクリアされました。' });
    } catch (err) {
      console.error('[API Reset] Error:', err);
      return res.status(500).send('データベースのリセット中にエラーが発生しました。');
    }
  }

  // ==========================================
  // DISPATCH: subscribe (POST)
  // ==========================================
  if (subpath === 'subscribe') {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    try {
      const { memberId, subscription } = req.body;
      if (!memberId || !subscription || !subscription.endpoint) {
        return res.status(400).send('必須パラメータ（memberId, subscription）が不足しています。');
      }

      const memberRef = db.collection('members').doc(String(memberId));
      const doc = await memberRef.get();
      if (!doc.exists) {
        return res.status(404).send('指定されたメンバーが見つかりません。');
      }

      const memberData = doc.data();
      let subscriptions = memberData.pushSubscriptions || [];

      // Check if this subscription endpoint already exists
      const exists = subscriptions.some(sub => sub.endpoint === subscription.endpoint);
      if (!exists) {
        subscriptions.push(subscription);
        await memberRef.update({
          pushSubscriptions: subscriptions,
          updatedAt: new Date().toISOString()
        });
        console.info(`[API Subscribe] Saved new Web Push subscription for member ${memberId}`);
      } else {
        console.info(`[API Subscribe] Web Push subscription already exists for member ${memberId}`);
      }

      return res.status(200).json({ success: true, message: 'Web Pushの購読登録に成功しました。' });
    } catch (err) {
      console.error('[API Subscribe] Error:', err);
      return res.status(500).send('プッシュ購読登録中にエラーが発生しました。');
    }
  }

  // ==========================================
  // DISPATCH: vapid-public-key (GET)
  // ==========================================
  if (subpath === 'vapid-public-key') {
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
    const publicKey = process.env.VAPID_PUBLIC_KEY || 'BEMmMznggL_geY668zogdssbLSD7-ofW34TrpClleOcR5HzaJiCkUPT0ctBtY5TBvuep5Sb2eUy544DvH7iOH7w';
    return res.status(200).json({ publicKey });
  }

  return res.status(404).send('Not Found');
}
