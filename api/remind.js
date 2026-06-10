// api/remind.js
import { db, messaging } from './_lib/firebase-admin.js';

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
    let fcmTokensCount = 0;

    // (A) 個別FCM通知の送信 & 未提出者リストの作成
    for (const member of unsubmittedMembers) {
      remindedNames.push(member.name);

      // FCM Web プッシュ通知による送信（lineUserId に紐づく FCM トークンが存在する場合）
      if (member.lineUserId) {
        try {
          const userDoc = await db.collection('users').doc(member.lineUserId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            const tokens = userData.fcmTokens || [];
            
            if (tokens.length > 0) {
              await sendFcmPush(member.name, tokens);
              fcmTokensCount += tokens.length;
            }
          }
        } catch (e) {
          console.warn(`[API Remind] FCM token fetch failed for ${member.name}:`, e.message);
        }
      }
    }

    // (B) LINE Messaging APIによるグループ向けリマインド一斉配信
    const namesList = unsubmittedMembers.map(m => `・${m.name} さん`).join('\n');
    const appUrl = process.env.LINE_REDIRECT_URI 
      ? new URL(process.env.LINE_REDIRECT_URI).origin 
      : 'https://togyuen-shift.vercel.app'; // フォールバック

    const message = `【桃牛苑シフト提出リマインド】\nシフト希望の提出期日が近づいています。まだ提出されていない方は、お手数ですがアプリから入力をお願いします。\n\n▼未提出のスタッフ\n${namesList}\n\nアプリを開く: ${appUrl}`;

    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const groupId = process.env.LINE_GROUP_ID;

    let lineSent = false;
    if (channelAccessToken && groupId) {
      try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${channelAccessToken}`
          },
          body: JSON.stringify({
            to: groupId,
            messages: [
              {
                type: 'text',
                text: message
              }
            ]
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`[API Remind] LINE Messaging API Push failed: ${errText}`);
        } else {
          console.info(`[API Remind] LINE Messaging API Push successfully sent to group: ${groupId}`);
          lineSent = true;
        }
      } catch (e) {
        console.error(`[API Remind] Network error sending LINE Messaging API Push:`, e);
      }
    } else {
      console.warn('[API Remind] LINE_CHANNEL_ACCESS_TOKEN or LINE_GROUP_ID is missing in environment variables. Skipping real Messaging API POST request.');
    }

    return res.status(200).json({
      message: 'リマインド通知を正常に送信しました。',
      remindedCount: unsubmittedMembers.length,
      remindedNames,
      fcmTokensSent: fcmTokensCount,
      lineMessagingSent: lineSent
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
  } catch (e) {
    console.error(`[FCM Push] Failed to send push to ${name}:`, e);
  }
}
