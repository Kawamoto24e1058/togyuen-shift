// api/cron-remind.js
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
  // セキュリティ対策: Vercel Cron からの正規なリクエストかチェック (Vercel が自動付与するヘッダー)
  const isCron = req.headers['x-vercel-cron'] === 'true';
  const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL;
  
  if (!isCron && !isLocal) {
    return res.status(403).send('Access Denied: Vercel Cron requests only.');
  }

  try {
    const jstDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const year = jstDate.getFullYear();
    const month = jstDate.getMonth() + 1;
    const date = jstDate.getDate();

    let targetPeriod = "";
    let displayPeriodLabel = "";

    // 25日の実行時は「翌月前半A期間」、10日の実行時は「当月後半B期間」のシフト希望をリマインド対象とします。
    if (date === 25) {
      const nextMonthDate = new Date(year, jstDate.getMonth() + 1, 1);
      const nextYear = nextMonthDate.getFullYear();
      const nextMonth = nextMonthDate.getMonth() + 1;
      targetPeriod = `${nextYear}-${String(nextMonth).padStart(2, '0')}-A`;
      displayPeriodLabel = `${nextYear}年${nextMonth}月 前半(1日〜15日)分`;
    } else if (date === 10) {
      targetPeriod = `${year}-${String(month).padStart(2, '0')}-B`;
      displayPeriodLabel = `${year}年${month}月 後半(16日〜末日)分`;
    } else {
      // フォールバック (デバッグ・手動起動時用)
      targetPeriod = `${year}-${String(month).padStart(2, '0')}-B`;
      displayPeriodLabel = `${year}年${month}月 後半(16日〜末日)分`;
    }

    console.info(`[Cron Remind] Checking submissions. JST Date: ${date}th. Target Period: ${targetPeriod} (${displayPeriodLabel})`);

    // 1. Firestore 'members' から全有効スタッフを取得
    const membersSnap = await db.collection('members').get();
    if (membersSnap.empty) {
      return res.status(200).json({ message: '登録スタッフが存在しません。終了します。', reminded: false });
    }

    const allMembers = [];
    membersSnap.forEach(doc => {
      const data = doc.data();
      if (data.isActive !== false) {
        allMembers.push({ id: Number(doc.id), ...data });
      }
    });

    // 2. Firestore 'submissions' から該当期間の提出データを取得
    const subsSnap = await db.collection('submissions')
      .where('period', '==', targetPeriod)
      .get();

    const submittedStaffIds = new Set();
    subsSnap.forEach(doc => {
      const data = doc.data();
      if (data.staffId) {
        submittedStaffIds.add(Number(data.staffId));
      }
    });

    // 3. 未提出スタッフをフィルタリング
    const unsubmittedMembers = allMembers.filter(m => !submittedStaffIds.has(m.id));

    // 未提出者がいない場合は通知を行わずに静かに終了
    if (unsubmittedMembers.length === 0) {
      console.info('[Cron Remind] All members have submitted. No reminder needed.');
      return res.status(200).json({
        message: '全員提出済みです。プッシュ通知をスキップしました。',
        reminded: false
      });
    }

    const namesList = unsubmittedMembers.map(m => `・${m.name} さん`).join('\n');
    console.info(`[Cron Remind] Unsubmitted staff found:\n${namesList}`);

    // 4. Web Push通知の送信
    let successPushes = 0;
    let failedPushes = 0;
    const unsubscribedEndpoints = []; // 無効になったサブスクリプションを追跡

    const payload = JSON.stringify({
      title: '🍎 桃牛苑 シフト提出のお願い',
      body: `本日${date}日はシフト希望の締め切り日です。まだ提出されていない方は、お手数ですがアプリから入力をお願いします。`,
      url: '/'
    });

    for (const member of unsubmittedMembers) {
      const subscriptions = member.pushSubscriptions || [];
      if (subscriptions.length === 0) {
        console.info(`[Cron Remind] Member ${member.name} (ID: ${member.id}) has no Web Push subscriptions.`);
        continue;
      }

      // エンドポイント重複防止のために一意にする
      const uniqueSubscriptions = Array.from(new Map(subscriptions.map(sub => [sub.endpoint, sub])).values());

      for (const subscription of uniqueSubscriptions) {
        try {
          await webPush.sendNotification(subscription, payload);
          successPushes++;
          console.info(`[Cron Remind] Web Push sent successfully to ${member.name} (endpoint: ${subscription.endpoint.substring(0, 30)}...)`);
        } catch (error) {
          failedPushes++;
          console.error(`[Cron Remind] Failed to send Web Push to ${member.name}:`, error.message);
          
          // 410 (Gone) or 404 (Not Found) の場合、すでに購読解除されているか無効になっているため削除対象に追加
          if (error.statusCode === 410 || error.statusCode === 404) {
            unsubscribedEndpoints.push({ memberId: member.id, endpoint: subscription.endpoint });
          }
        }
      }
    }

    // 5. 無効になった購読情報をFirestoreから削除 (バッチ処理)
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
          console.info(`[Cron Remind] Cleaned up ${endpointsToRemove.size} expired subscriptions for member ${mId}.`);
        }
      }
    }

    return res.status(200).json({
      message: '未提出スタッフへのWebプッシュ通知送信処理が完了しました。',
      reminded: true,
      unsubmittedCount: unsubmittedMembers.length,
      unsubmitted: unsubmittedMembers.map(m => m.name),
      successPushes,
      failedPushes
    });

  } catch (err) {
    console.error('[Cron Remind] System Error:', err);
    return res.status(500).send(`リマインド処理中にエラーが発生しました: ${err.message}`);
  }
}
