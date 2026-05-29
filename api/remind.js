// api/remind.js
import { db, messaging } from './lib/firebase-admin.js';

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
    const { period } = req.body;
    // 期間指定がない場合は自動的に翌月を設定（例: 今日が 5月29日 なら 2026-06）
    const TARGET_PERIOD = period || getNextMonthPeriod();

    console.info(`[API Remind] Starting reminder process for period: ${TARGET_PERIOD}`);

    // 1. 全スタッフマスタを Firestore `members` から取得
    const membersSnapshot = await db.collection('members').get();
    const members = [];
    membersSnapshot.forEach(doc => {
      members.push({ id: doc.id, ...doc.data() });
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
    let fcmTokensCount = 0;
    let lineNotifyCount = 0;

    // 4. 各未提出スタッフへ通知送信
    for (const member of unsubmittedMembers) {
      remindedNames.push(member.name);

      // (A) LINE Notify による通知送信（lineToken が設定されている場合）
      if (member.lineToken && !member.lineToken.startsWith('DUMMY_TOKEN')) {
        await sendLineNotify(member.name, member.lineToken);
        lineNotifyCount++;
      } else if (member.lineToken && member.lineToken.startsWith('DUMMY_TOKEN')) {
        console.log(`   ✨ [LINE SIMULATION] ${member.name} さんへの LINE Notify 送信をシミュレートしました。`);
        lineNotifyCount++;
      }

      // (B) FCM Web プッシュ通知による送信（lineUserId に紐づく FCM トークンが存在する場合）
      if (member.lineUserId) {
        const userDoc = await db.collection('users').doc(member.lineUserId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const tokens = userData.fcmTokens || [];
          
          if (tokens.length > 0) {
            await sendFcmPush(member.name, tokens);
            fcmTokensCount += tokens.length;
          }
        }
      }
    }

    return res.status(200).json({
      message: 'リマインド通知を正常に送信しました。',
      remindedCount: unsubmittedMembers.length,
      remindedNames,
      fcmTokensSent: fcmTokensCount,
      lineNotifySent: lineNotifyCount
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

// LINE Notify API 呼び出し
async function sendLineNotify(name, token) {
  const message = `\n🍎 [桃牛苑 シフト提出の締め切り]\n\n${name}さん、翌月分のシフト提出締め切りが近づいています。アプリを開いてスケジュール希望の提出をお願いします！`;
  const payload = new URLSearchParams({ message });

  try {
    const res = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`
      },
      body: payload
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[LINE Notify] Failed to send to ${name}:`, errText);
    } else {
      console.log(`[LINE Notify] Successfully sent reminder to ${name}`);
    }
  } catch (e) {
    console.error(`[LINE Notify] Network Error sending to ${name}:`, e);
  }
}

// FCM Web プッシュ通知送信
async function sendFcmPush(name, tokens) {
  const messagePayload = {
    notification: {
      title: '🍎 桃牛苑 シフト提出のお願い',
      body: `${name}さん、翌月分のシフト提出締め切りが近づいています。アプリから希望の提出をお願いします！`
    },
    data: {
      url: '/'
    }
  };

  try {
    // 複数のデバイスにマルチキャスト送信
    const response = await messaging.sendEachForMulticast({
      tokens: tokens,
      notification: messagePayload.notification,
      data: messagePayload.data,
      webpush: {
        fcmOptions: {
          link: '/'
        }
      }
    });

    console.log(`[FCM Push] Sent to ${name}. Success: ${response.successCount}, Failure: ${response.failureCount}`);
    
    // 無効な（アンインストール済みなどの）トークンがあればクリーンアップするのが望ましいですが、
    // 今回はシンプルにログ出力に留めます。
  } catch (e) {
    console.error(`[FCM Push] Failed to send push to ${name}:`, e);
  }
}
