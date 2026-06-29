// test-firebase.mjs - Firebase接続テストスクリプト
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .envを手動読み込み
const envPath = resolve(__dirname, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx);
        const val = trimmed.substring(eqIdx + 1);
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
  console.log('[Test] .env loaded from:', envPath);
}

const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
console.log('[Test] FIREBASE_SERVICE_ACCOUNT set:', !!serviceAccountVar);
if (!serviceAccountVar) {
  console.error('[Test] ❌ FIREBASE_SERVICE_ACCOUNT is NOT set');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountVar);
  console.log('[Test] ✅ Service account parsed OK.');
  console.log('[Test]    Project ID:', serviceAccount.project_id);
  console.log('[Test]    Client email:', serviceAccount.client_email);
} catch (e) {
  console.error('[Test] ❌ JSON parse failed:', e.message);
  process.exit(1);
}

const { default: admin } = await import('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

console.log('\n[Test] Testing Firestore write...');
try {
  await db.collection('_test').doc('ping').set({ ts: new Date().toISOString() });
  console.log('[Test] ✅ Write SUCCESS!');
  const doc = await db.collection('_test').doc('ping').get();
  console.log('[Test] ✅ Read SUCCESS! Data:', doc.data());
  await db.collection('_test').doc('ping').delete();
  console.log('[Test] ✅ Cleanup done.');

  // membersコレクションを確認
  const membersSnap = await db.collection('members').get();
  console.log('\n[Test] members collection count:', membersSnap.size);
} catch (err) {
  console.error('[Test] ❌ Firestore FAILED:', err.message);
}
process.exit(0);
