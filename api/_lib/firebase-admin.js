// api/lib/firebase-admin.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:', e);
      admin.initializeApp({
        projectId: 'aqua-shitumon'
      });
    }
  } else {
    // ローカル開発などで環境変数が提供されていない場合、自動フォールバック
    admin.initializeApp({
      projectId: 'aqua-shitumon'
    });
  }
}

export const db = admin.firestore();
export const messaging = admin.messaging();
