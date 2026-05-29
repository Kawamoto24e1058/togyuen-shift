import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBMISSIONS_FILE = path.join(__dirname, 'public', 'submissions.json');
const SAMPLE_DATA_FILE = path.join(__dirname, 'sample_data.json');
const TARGET_PERIOD = "2026-06";

function runCron() {
  console.log(`\n==================================================`);
  console.log(`⏰ [桃牛苑 シフト提出締め切り自動リマインダー 起動]`);
  console.log(`実行日時: ${new Date().toLocaleString()}`);
  console.log(`対象対象期間: ${TARGET_PERIOD}`);
  console.log(`==================================================`);

  if (!fs.existsSync(SAMPLE_DATA_FILE)) {
    console.error(`⚠️ エラー: 従業員データファイル (${SAMPLE_DATA_FILE}) が見つかりません。`);
    return;
  }

  // 1. 全スタッフマスタの読み込み
  const sampleData = JSON.parse(fs.readFileSync(SAMPLE_DATA_FILE, 'utf8'));
  const members = sampleData.members;

  // 2. 提出状況データの読み込み
  let submissions = [];
  if (fs.existsSync(SUBMISSIONS_FILE)) {
    submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
  }

  console.log(`👥 全従業員数: ${members.length} 名`);
  console.log(`📝 提出済み数: ${submissions.filter(s => s.period === TARGET_PERIOD).length} 名`);

  // 3. 未提出スタッフの絞り込み
  const unsubmittedMembers = members.filter(member => {
    // 期間内の提出データがあるか照合
    const hasSubmitted = submissions.some(
      sub => sub.staffId === member.id && sub.period === TARGET_PERIOD
    );
    return !hasSubmitted;
  });

  console.log(`--------------------------------------------------`);
  if (unsubmittedMembers.length === 0) {
    console.log(`✅ 素晴らしい！全員が期限内に希望スケジュールを提出しています。`);
    console.log(`自動リマインドはスキップされました。`);
    console.log(`==================================================\n`);
    return;
  }

  console.log(`🚨 未提出スタッフ: ${unsubmittedMembers.length} 名を検出しました。`);
  unsubmittedMembers.forEach(member => {
    console.log(`  - [ID: ${member.id}] ${member.name}`);
  });
  console.log(`--------------------------------------------------`);

  // 4. 未提出者への Apple風 シンプル自動リマインドの送信実行 (LINE Notify / Web Push 模擬)
  unsubmittedMembers.forEach(member => {
    // 各スタッフ専用の擬似トークンを生成 (本番時は member.lineToken などのDB値を使用)
    const lineToken = member.lineToken || `DUMMY_TOKEN_FOR_${member.id}_${member.name}`;
    sendLineNotification(member.name, lineToken);
  });

  console.log(`==================================================`);
  console.log(`✅ すべてのリマインド送信処理が正常に完了しました。`);
  console.log(`==================================================\n`);
}

function sendLineNotification(name, token) {
  // Apple製品の通知のように極めてシンプルかつ要点を得たデザイン
  const message = `\n🍎 [桃牛苑 シフト提出の締め切り]\n\n${name}さん、本日25日は翌月前半分のシフト提出締め切り日です。アプリからスケジュールを入力してください。`;

  console.log(`🔔 [通知トリガー] ${name} さんへプッシュ通知を送信中...`);
  console.log(`   └ 宛先トークン: ${token.substring(0, 15)}...`);
  console.log(`   └ メッセージ本文: "${message.trim().replace(/\n/g, ' ')}"`);

  // ダミートークンの場合はシミュレーションとして安全に処理を完了
  if (token.startsWith('DUMMY_TOKEN')) {
    console.log(`   ✨ [SIMULATION SUCCESS] ${name} さんへの LINE Notify プッシュ配信が正常に完了しました。 (シミュレータ環境)`);
    return;
  }

  // 実在する LINE Notify トークンの場合は本物のAPIリクエストを実行
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

  const req = https.request(options, (res) => {
    let responseBody = '';
    res.on('data', chunk => { responseBody += chunk; });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`   🎉 [API SUCCESS] ${name} さんへ本番メッセージを正常に送信しました。`);
      } else {
        console.error(`   ❌ [API ERROR] ${name} さんへの送信に失敗しました (ステータス: ${res.statusCode}): ${responseBody}`);
      }
    });
  });

  req.on('error', (err) => {
    console.error(`   ❌ [NETWORK ERROR] 通信エラーが発生しました: ${err.message}`);
  });

  req.write(payload);
  req.end();
}

runCron();
