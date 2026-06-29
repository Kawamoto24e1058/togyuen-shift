// api/remind.js
import webPush from 'web-push';
import { db } from './_lib/firebase-admin.js';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || 'BEMmMznggL_geY668zogdssbLSD7-ofW34TrpClleOcR5HzaJiCkUPT0ctBtY5TBvuep5Sb2eUy544DvH7iOH7w';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '7jyqw9la5DeyVlbi9SqU9oLvjC18p3vjyCrSjokIPjc';

webPush.setVapidDetails(
  'mailto:info@togyuen.com',
  vapidPublicKey,
  vapidPrivateKey
);

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
    const { period } = req.body || {};
    // 期間指定がない場合は自動的に翌月を設定（例: YYYY-MM）
    const TARGET_PERIOD = period || getNextMonthPeriod();

    console.info(`[API Remind] Starting reminder process for period: ${TARGET_PERIOD}`);

    // 1. 全スタッフマスタを Firestore `members` から取得
    const membersSnapshot = await db.collection('members').get();
    const members = [];
    membersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.isActive !== false) {
        members.push({ id: Number(doc.id), ...data });
      }
    });

    if (members.length === 0) {
      return res.status(400).json({ message: 'スタッフマスタが登録されていません。' });
    }

    // 2. 指定期間の提出済データを Firestore `submissions` から取得
    const submissionsSnapshot = await db.collection('submissions')
      .where('period', '==', TARGET_PERIOD)
      .get();
    
    const submittedStaffIds = new Set();
    submissionsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.staffId) {
        submittedStaffIds.add(Number(data.staffId));
      }
    });

    // 3. 未提出スタッフをフィルタリング
    const unsubmittedMembers = members.filter(member => {
      return !submittedStaffIds.has(Number(member.id));
    });

    if (unsubmittedMembers.length === 0) {
      return res.status(200).json({
        message: '未提出のスタッフはいません。リマインドは不要です。',
        remindedCount: 0,
        remindedNames: []
      });
    }

    const remindedNames = [];
    let successPushes = 0;
    let failedPushes = 0;
    const unsubscribedEndpoints = [];

    const payload = JSON.stringify({
      title: '🍎 桃牛苑 シフト提出のお願い',
      body: `シフト希望の提出期日が近づいています。まだ提出されていない方は、お手数ですがアプリから入力をお願いします！`,
      url: '/'
    });

    // Web Push通知の送信
    for (const member of unsubmittedMembers) {
      remindedNames.push(member.name);
      const subscriptions = member.pushSubscriptions || [];
      if (subscriptions.length === 0) {
        continue;
      }

      // 重複排除
      const uniqueSubscriptions = Array.from(new Map(subscriptions.map(sub => [sub.endpoint, sub])).values());

      for (const subscription of uniqueSubscriptions) {
        try {
          await webPush.sendNotification(subscription, payload);
          successPushes++;
        } catch (error) {
          failedPushes++;
          console.error(`[API Remind] Failed to send push to ${member.name}:`, error.message);
          
          if (error.statusCode === 410 || error.statusCode === 404) {
            unsubscribedEndpoints.push({ memberId: member.id, endpoint: subscription.endpoint });
          }
        }
      }
    }

    // クリーンアップ
    if (unsubscribedEndpoints.length > 0) {
      const memberIdsToUpdate = [...new Set(unsubscribedEndpoints.map(item => item.memberId))];
      for (const mId of memberIdsToUpdate) {
        const memberRef = db.collection('members').doc(String(mId));
        const doc = await memberRef.get();
        if (doc.exists) {
          const currentSubs = doc.data().pushSubscriptions || [];
          const endpointsToRemove = new Set(unsubscribedEndpoints.filter(item => item.memberId === mId).map(item => item.endpoint));
          const updatedSubs = currentSubs.filter(sub => !endpointsToRemove.has(sub.endpoint));
          
          await memberRef.update({
            pushSubscriptions: updatedSubs,
            updatedAt: new Date().toISOString()
          });
          console.info(`[API Remind] Cleaned up ${endpointsToRemove.size} expired subscriptions for member ${mId}.`);
        }
      }
    }

    return res.status(200).json({
      message: 'リマインド通知を正常に送信しました。',
      remindedCount: unsubmittedMembers.length,
      remindedNames,
      successPushes,
      failedPushes
    });

  } catch (err) {
    console.error('[API Remind] Error:', err);
    return res.status(500).send('リマインド処理中にエラーが発生しました。');
  }
}

// 翌月の期間表記を取得 (YYYY-MM)
function getNextMonthPeriod() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 2; // +1で当月、+2で翌月
  if (month > 12) {
    month = 1;
    year += 1;
  }
  const monthStr = String(month).padStart(2, '0');
  return `${year}-${monthStr}`;
}
