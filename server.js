import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const SUBMISSIONS_FILE = path.join(__dirname, 'public', 'submissions.json');
const DEADLINE_FILE = path.join(__dirname, 'deadline.json');

// 初期設定の書き出し
function initFiles() {
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  if (!fs.existsSync(SUBMISSIONS_FILE)) {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify([], null, 2), 'utf8');
  }

  if (!fs.existsSync(DEADLINE_FILE)) {
    // デフォルトの締め切りを 2026年5月30日 23:59:59 に設定（今日は 5月27日 なのでまだ未超過）
    const defaultDeadline = {
      deadlineDate: "2026-05-30T23:59:59"
    };
    fs.writeFileSync(DEADLINE_FILE, JSON.stringify(defaultDeadline, null, 2), 'utf8');
  }
}

initFiles();

const server = http.createServer((req, res) => {
  // CORSヘッダーの設定 (Vite 開発サーバー http://localhost:5174 からのアクセスを許可)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // GET /api/deadline
  if (req.method === 'GET' && req.url === '/api/deadline') {
    try {
      const data = fs.readFileSync(DEADLINE_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('締め切りデータの読み込みに失敗しました。');
    }
    return;
  }

  // POST /api/deadline
  if (req.method === 'POST' && req.url === '/api/deadline') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.deadlineDate) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('締め切り日時 (deadlineDate) が指定されていません。');
          return;
        }

        fs.writeFileSync(DEADLINE_FILE, JSON.stringify(payload, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '締め切り日時を正常に更新しました。', ...payload }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('無効なJSONフォーマットです。');
      }
    });
    return;
  }

  // POST /api/auth/line
  if (req.method === 'POST' && req.url === '/api/auth/line') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { code, staffId } = payload;
        if (!code || !staffId) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('必須パラメータ（code, staffId）が不足しています。');
          return;
        }

        // LINE Profile Mock - sample_data.jsonから該当スタッフを取得
        const sampleDataFile = path.join(__dirname, 'sample_data.json');
        if (!fs.existsSync(sampleDataFile)) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('従業員データファイルが見つかりません。');
          return;
        }

        const sampleData = JSON.parse(fs.readFileSync(sampleDataFile, 'utf8'));
        const member = sampleData.members.find(m => m.id === Number(staffId));

        if (!member) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('指定された従業員が見つかりません。');
          return;
        }

        // LINEのユーザーIDを一意に生成
        const lineUserId = `U06c755lineUser_${member.id}`;

        // Simulated Firestore Users collection - public/users.json に保存
        const USERS_FILE = path.join(__dirname, 'public', 'users.json');
        let users = [];
        if (fs.existsSync(USERS_FILE)) {
          users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }

        const existingIndex = users.findIndex(u => u.lineUserId === lineUserId);
        const userInfo = {
          lineUserId,
          name: member.name,
          role: member.role,
          status: member.status,
          registeredAt: new Date().toISOString()
        };

        if (existingIndex !== -1) {
          users[existingIndex] = userInfo;
        } else {
          users.push(userInfo);
        }

        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'LINEログイン認証に成功しました。 (Simulated via Svelte & Firestore Mapping)',
          user: userInfo
        }));
      } catch (err) {
        console.error(err);
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('リクエスト処理中にエラーが発生しました。');
      }
    });
    return;
  }

  // GET /api/submissions
  if (req.method === 'GET' && req.url === '/api/submissions') {
    try {
      const data = fs.readFileSync(SUBMISSIONS_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('提出データの読み込みに失敗しました。');
    }
    return;
  }

  // POST /api/submit
  if (req.method === 'POST' && req.url === '/api/submit') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { staffId, period, availabilities, submittedAt, lineUserId } = payload;

        if (!staffId || !period || !availabilities || !lineUserId) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('必須パラメータ（staffId, period, availabilities, lineUserId）が不足しています。');
          return;
        }

        // セキュリティ検証 (Firestore Security Rulesの模擬):
        // 送信者自身の lineUserId が、操作対象の staffId と一致していることを検証
        const expectedLineUserId = `U06c755lineUser_${staffId}`;
        if (lineUserId !== expectedLineUserId) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('権限エラー: 他人のスケジュール希望を書き換えることはできません。(Firestore Security Rules 違反)');
          return;
        }

        // サーバー側の締め切りバリデーション
        const deadlineData = JSON.parse(fs.readFileSync(DEADLINE_FILE, 'utf8'));
        const deadline = new Date(deadlineData.deadlineDate);
        const now = new Date();

        if (now > deadline) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('提出締め切り日時を過ぎているため、スケジュール希望は提出できません。');
          return;
        }

        // submissions.json の読み込みと更新（同一期間・同一スタッフは上書き）
        let submissions = [];
        if (fs.existsSync(SUBMISSIONS_FILE)) {
          submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
        }

        const existingIndex = submissions.findIndex(
          sub => sub.staffId === Number(staffId) && sub.period === period
        );

        const newSubmission = {
          staffId: Number(staffId),
          period,
          availabilities,
          lineUserId,
          submittedAt: submittedAt || new Date().toISOString()
        };

        if (existingIndex !== -1) {
          submissions[existingIndex] = newSubmission;
        } else {
          submissions.push(newSubmission);
        }

        fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2), 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '提出が正常に受け付けられました。', submission: newSubmission }));
      } catch (err) {
        console.error(err);
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('リクエスト処理中にエラーが発生しました。');
      }
    });
    return;
  }

  // POST /api/remind
  if (req.method === 'POST' && req.url === '/api/remind') {
    try {
      const sampleDataFile = path.join(__dirname, 'sample_data.json');
      if (!fs.existsSync(sampleDataFile)) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('従業員データファイルが見つかりません。');
        return;
      }

      const sampleData = JSON.parse(fs.readFileSync(sampleDataFile, 'utf8'));
      const members = sampleData.members;

      let submissions = [];
      if (fs.existsSync(SUBMISSIONS_FILE)) {
        submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
      }

      const TARGET_PERIOD = "2026-06";
      const unsubmittedMembers = members.filter(member => {
        return !submissions.some(
          sub => sub.staffId === member.id && sub.period === TARGET_PERIOD
        );
      });

      unsubmittedMembers.forEach(member => {
        const lineToken = member.lineToken || `DUMMY_TOKEN_FOR_${member.id}_${member.name}`;
        sendLineNotification(member.name, lineToken);
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'リマインドを正常に送信しました。',
        remindedCount: unsubmittedMembers.length,
        remindedNames: unsubmittedMembers.map(m => m.name)
      }));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('リマインド処理中にエラーが発生しました。');
    }
    return;
  }

  // 404 fallback
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('エンドポイントが見つかりません。');
});

function sendLineNotification(name, token) {
  const message = `\n🍎 [桃牛苑 シフト提出の締め切り]\n\n${name}さん、本日25日は翌月前半分のシフト提出締め切り日です。アプリからスケジュールを入力してください。`;

  console.log(`🔔 [通知トリガー] ${name} さんへプッシュ通知を送信中...`);
  if (!token || token.startsWith('DUMMY_TOKEN')) {
    console.log(`   ✨ [SIMULATION SUCCESS] ${name} さんへの LINE Notify プッシュ配信が正常に完了しました。 (シミュレータ環境)`);
    return;
  }

  const payload = `message=${encodeURIComponent(message)}`;
  const options = {
    hostname: 'notify-api.line.me',
    path: '/api/notify',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, () => {});
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

server.listen(PORT, () => {
  console.log(`🚀 API Server is running on http://localhost:${PORT}`);
});
