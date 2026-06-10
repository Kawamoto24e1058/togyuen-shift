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
    const jstDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const year = jstDate.getFullYear();
    const month = jstDate.getMonth() + 1;
    const date = jstDate.getDate();

    let targetPeriod = "";
    let displayPeriodLabel = "";

    // 26日の実行時は「翌月前半A期間」、11日の実行時は「当月後半B期間」のシフトを対象とします。
    if (date === 26) {
      const nextMonthDate = new Date(year, jstDate.getMonth() + 1, 1);
      const nextYear = nextMonthDate.getFullYear();
      const nextMonth = nextMonthDate.getMonth() + 1;
      targetPeriod = `${nextYear}-${String(nextMonth).padStart(2, '0')}-A`;
      displayPeriodLabel = `${nextYear}年${nextMonth}月 前半(1日〜15日)分`;
    } else if (date === 11) {
      targetPeriod = `${year}-${String(month).padStart(2, '0')}-B`;
      displayPeriodLabel = `${year}年${month}月 後半(16日〜末日)分`;
    } else {
      // フォールバック
      targetPeriod = `${year}-${String(month).padStart(2, '0')}-B`;
      displayPeriodLabel = `${year}年${month}月 後半(16日〜末日)分`;
    }

    console.info(`[Cron Publish] Auto-generating and publishing shift. JST Date: ${date}th. Target Period: ${targetPeriod} (${displayPeriodLabel})`);

    const shiftsModule = await import('./shifts.js');
    const shiftsHandler = shiftsModule.default;

    // Mock response helper
    const mockRes = {
      status: (code) => mockRes,
      send: (msg) => { console.info(`[Auto-Generate Cron Output] send: ${msg}`); },
      json: (data) => { console.info(`[Auto-Generate Cron Output] json: ${JSON.stringify(data)}`); }
    };

    // 1. 自動生成を実行
    await shiftsHandler({
      method: 'POST',
      url: '/api/shifts/generate',
      query: {},
      body: { period: targetPeriod }
    }, mockRes);

    // 2. 公開処理を実行
    await shiftsHandler({
      method: 'POST',
      url: '/api/shifts/publish',
      query: {},
      body: { period: targetPeriod }
    }, mockRes);

    return res.status(200).json({
      success: true,
      message: `${displayPeriodLabel} のシフトを自動的に作成・確定公開し、通知を送信しました。`,
      period: targetPeriod,
      status: 'published'
    });
  } catch (err) {
    console.error('[Cron Publish] System Error:', err);
    return res.status(500).send(`自動シフト公開処理中にシステムエラーが発生しました: ${err.message}`);
  }
}
