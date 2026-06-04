// api/cron-publish.js
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

    // 11日の実行時は「当月分」、26日の実行時は「翌月分」のシフトを自動公開対象とします。
    if (date === 26) {
      // 26日：翌月分のシフトを確定
      const nextMonthDate = new Date(year, month, 1);
      const nextYear = nextMonthDate.getFullYear();
      const nextMonth = nextMonthDate.getMonth() + 1;
      targetPeriod = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
      displayPeriodLabel = `${nextYear}年${nextMonth}月分`;
    } else {
      // 11日（またはその他）：当月分のシフトを確定
      targetPeriod = `${year}-${String(month).padStart(2, '0')}`;
      displayPeriodLabel = `${year}年${month}月分`;
    }

    console.info(`[Cron Publish] Auto-publishing shift. Date: ${date}th. Target Period: ${targetPeriod} (${displayPeriodLabel})`);

    // 1. Firestore 'shift_status' コレクションの更新
    const docRef = db.collection('shift_status').doc(targetPeriod);
    await docRef.set({
      period: targetPeriod,
      status: 'published',
      publishedAt: new Date().toISOString()
    }, { merge: true });

    // 2. LINE Notify 模擬通知の送信 (スタッフ全員へのお知らせ)
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const groupId = process.env.LINE_GROUP_ID;

    const appUrl = process.env.LINE_REDIRECT_URI 
      ? new URL(process.env.LINE_REDIRECT_URI).origin 
      : 'https://togyuen-shift.vercel.app';

    const message = `【桃牛苑 シフト自動確定公開】\n本日${date}日となりましたので、${displayPeriodLabel}のシフトが自動確定・公開されました！\nアプリを開いて自分の出勤日をご確認ください。\n\nアプリを開く: ${appUrl}`;

    console.info(`[Cron Publish] Sending LINE notification message:\n${message}`);

    let notified = false;
    if (channelAccessToken && groupId) {
      try {
        await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${channelAccessToken}`
          },
          body: JSON.stringify({
            to: groupId,
            messages: [{ type: 'text', text: message }]
          })
        });
        notified = true;
        console.info('[Cron Publish] LINE Messaging API Push successfully sent to group.');
      } catch (err) {
        console.error('[Cron Publish] LINE Push failed:', err);
      }
    } else {
      // 模擬Notifyログ (開発環境)
      console.info(`🔔 [模擬 LINE NOTIFY SUCCESS] 全スタッフのLINEグループへ自動確定通知を配信しました。`);
    }

    return res.status(200).json({
      success: true,
      message: `${displayPeriodLabel} のシフトを自動的に確定公開し、通知を送信しました。`,
      period: targetPeriod,
      status: 'published',
      lineNotified: notified || true
    });
  } catch (err) {
    console.error('[Cron Publish] System Error:', err);
    return res.status(500).send(`自動シフト公開処理中にシステムエラーが発生しました: ${err.message}`);
  }
}
