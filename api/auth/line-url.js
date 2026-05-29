// api/auth/line-url.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const channelId = process.env.LINE_CHANNEL_ID;
  const redirectUri = process.env.LINE_REDIRECT_URI || 'http://localhost:3000/callback';
  
  // CSRF防止用のステート
  const state = Math.random().toString(36).substring(2, 15);

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
