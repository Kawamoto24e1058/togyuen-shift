import fs from 'fs';
import path from 'path';

// 手動で .env ファイルをパースして process.env にセットする
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index !== -1) {
        const key = trimmed.substring(0, index).trim();
        let value = trimmed.substring(index + 1).trim();
        // クォーテーションを外す
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        // \n などのエスケープ文字を改行コードに変換
        value = value.replace(/\\n/g, '\n');
        process.env[key] = value;
      }
    });
    console.log(".env loaded successfully.");
  }
} catch (e) {
  console.warn("Failed to load .env manually:", e);
}

async function main() {
  // 環境変数をロードした後に動的に読み込み！
  const { db } = await import('../api/_lib/firebase-admin.js');
  console.log("Fetching members from Firestore...");
  const snapshot = await db.collection('members').get();
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}, Name: ${data.name || data.fullName}, roles: ${JSON.stringify(data.roles)}, canHappyHour: ${data.canHappyHour} (type: ${typeof data.canHappyHour})`);
  });
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
