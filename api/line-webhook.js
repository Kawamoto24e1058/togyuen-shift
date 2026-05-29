// api/line-webhook.js
// LINE Messaging API Webhook - LINEのグループID (Cから始まるID) を特定するためのデバッグ用Webhookエンドポイント

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
    const payload = req.body;
    const events = payload.events || [];

    for (const event of events) {
      console.info(`[LINE Webhook] Event Type: ${event.type}`);

      // グループIDの抽出ロジック
      const source = event.source || {};
      const groupId = source.groupId;
      const roomId = source.roomId;
      const userId = source.userId;

      if (groupId) {
        console.info(`\n🔍 ==================================================`);
        console.info(`🔔 [LINE Webhook] LINE グループIDを特定しました！`);
        console.info(`👉 groupId: "${groupId}"`);
        console.info(`   └ イベント種別: ${event.type}`);
        console.info(`   └ 送信ユーザー: ${userId || '不明'}`);
        console.info(`==================================================\n`);
      } else if (roomId) {
        console.info(`\n🔍 ==================================================`);
        console.info(`🔔 [LINE Webhook] LINE チャットルームIDを特定しました！`);
        console.info(`👉 roomId: "${roomId}"`);
        console.info(`==================================================\n`);
      } else if (userId) {
        console.info(`\n🔍 ==================================================`);
        console.info(`🔔 [LINE Webhook] 個人の LINE ユーザーIDを特定しました！`);
        console.info(`👉 userId: "${userId}"`);
        console.info(`==================================================\n`);
      }
    }

    // LINEプラットフォームに対して200 OKを返却
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[LINE Webhook] Error processing event:', err);
    return res.status(500).send('Internal Server Error');
  }
}
