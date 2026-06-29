// api/lib/firebase-admin.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  console.info('[Firebase Admin] Initializing... FIREBASE_SERVICE_ACCOUNT set:', !!serviceAccountVar);
  
  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.info('[Firebase Admin] Initialized with service account credentials. Project:', serviceAccount.project_id);
    } catch (e) {
      console.error('[Firebase Admin] FAILED to parse FIREBASE_SERVICE_ACCOUNT:', e.message);
      console.error('[Firebase Admin] Falling back to default credentials (project: aqua-shitumon)');
      admin.initializeApp({
        projectId: 'aqua-shitumon'
      });
    }
  } else {
    console.warn('[Firebase Admin] FIREBASE_SERVICE_ACCOUNT is NOT set. Using default credentials (may fail in production).');
    admin.initializeApp({
      projectId: 'aqua-shitumon'
    });
  }
}

export const db = admin.firestore();
export const messaging = admin.messaging();
