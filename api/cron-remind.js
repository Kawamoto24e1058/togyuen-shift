// api/cron-remind.js
import { db } from './_lib/firebase-admin.js';

export default async function handler(req, res) {
  // セキュリティ対策: Vercel Cron からの正規なリクエストかチェック (Vercel が自動付与するヘッダー)
  // ローカル開発やテスト目的の場合はアクセス制限をスキップできるようにします
  const isCron = req.headers['x-vercel-cron'] === 'true';
  const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL;
  
  if (!isCron && !isLocal) {
    return res.status(403).send('Access Denied: Vercel Cron requests only.');
  }

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();

    let targetPeriod = "";
    let displayPeriodLabel = "";

    // 毎月10日・25日の実行時は、翌月1ヶ月分のシフト希望（YYYY-MM）を対象とします。
    // フロントエンド（Svelte）の対象期間フォーマットと完全に一致させます。
    const nextMonthDate = new Date(year, month, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonth = nextMonthDate.getMonth() + 1;
    const mmStr = String(nextMonth).padStart(2, '0');
    targetPeriod = `${nextYear}-${mmStr}`;
    displayPeriodLabel = `${nextYear}年${nextMonth}月分`;

    console.info(`[Cron Remind] Checking submissions. Date: ${date}th. Target Period: ${targetPeriod} (${displayPeriodLabel})`);

    // 1. Firestore 'members' から全有効スタッフを取得
    const membersSnap = await db.collection('members').get();
    if (membersSnap.empty) {
      return res.status(200).json({ message: '登録スタッフが存在しません。終了します。', reminded: false });
    }

    const allMembers = [];
    membersSnap.forEach(doc => {
      allMembers.push({ id: Number(doc.id), ...doc.data() });
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
        message: '全員提出済みです。LINEグループ通知をスキップしました。',
        reminded: false
      });
    }

    const namesList = unsubmittedMembers.map(m => `・${m.name} さん`).join('\n');
    console.info(`[Cron Remind] Unsubmitted staff found:\n${namesList}`);

    // 本番環境のアプリURLを取得
    const appUrl = process.env.LINE_REDIRECT_URI 
      ? new URL(process.env.LINE_REDIRECT_URI).origin 
      : 'https://togyuen-shift.vercel.app'; // フォールバック用

    // 4. LINE Messaging API 用のメッセージ本文を作成
    const message = `【桃牛苑シフト提出リマインド】\n本日${date}日はシフト希望の締め切り日です。まだ提出されていない方は、お手数ですがアプリから入力をお願いします。\n\n▼未提出のスタッフ\n${namesList}\n\nアプリを開く: ${appUrl}`;

    // 5. LINE Messaging API を使って既存のLINEグループへプッシュ送信
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const groupId = process.env.LINE_GROUP_ID;

    if (!channelAccessToken || !groupId) {
      console.warn('[Cron Remind] LINE_CHANNEL_ACCESS_TOKEN or LINE_GROUP_ID is missing in environment variables. Skipping real Messaging API POST request.');
      return res.status(200).json({
        message: '未提出者を検出しましたが、LINE Messaging API環境変数が未設定のため通知をスキップしました。',
        reminded: false,
        unsubmitted: unsubmittedMembers.map(m => m.name)
      });
    }

    // LINE Messaging API Push Message POST リクエストを送信
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
      throw new Error(`LINE Messaging API Push responded with status ${response.status}: ${errText}`);
    }

    console.info('[Cron Remind] LINE Messaging API Push reminder successfully sent to group.');
    return res.status(200).json({
      message: '未提出スタッフの抽出およびLINE Messaging APIプッシュ通知の送信に成功しました。',
      reminded: true,
      unsubmittedCount: unsubmittedMembers.length,
      unsubmitted: unsubmittedMembers.map(m => m.name)
    });

  } catch (err) {
    console.error('[Cron Remind] System Error:', err);
    return res.status(500).send(`リマインド処理中にエラーが発生しました: ${err.message}`);
  }
}
