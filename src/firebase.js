// ============================================================
// src/firebase.js
// Firebase クライアント SDK の初期化と FCM ヘルパー関数
//
// ★ 設定値を Firebase Console から取得して埋めてください:
//   Firebase Console → プロジェクトの概要 → アプリを追加（ウェブ）
// ============================================================

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// ★ あなたの Firebase プロジェクトの設定値に置き換えてください
const firebaseConfig = {
  apiKey:            "AIzaSyARw6Gf_s56bQd6HhPnoOl6y58QTRm716s",
  authDomain:        "aqua-shitumon.firebaseapp.com",
  projectId:         "aqua-shitumon",
  storageBucket:     "aqua-shitumon.firebasestorage.app",
  messagingSenderId: "983478802486",
  appId:             "1:983478802486:web:c9c4043ab1862ca943a097",
  measurementId:     "G-CD2RZY7PYZ"
};

// ★ Firebase Console → プロジェクトの設定 → クラウド メッセージング
//    → ウェブプッシュ証明書 の「キーのペア」を貼り付けてください
export const VAPID_KEY = "BKiu69PQUruLjT_1h4UiDYyRxDMdkrwSCmFb5ipj-HsB2T2IfYuCkcEESj898cNFvyrpmbAiUddimvg2oCwejSc";

// Firebase アプリの初期化（二重初期化を防止）
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);

// messaging は Service Worker が必要なためブラウザ環境のみで初期化
let messagingInstance = null;
export function getMessagingInstance() {
  if (typeof window === 'undefined') return null;
  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

/**
 * 通知許可をリクエストし、FCM デバイストークンを取得して Firestore に保存する。
 *
 * @param {string} lineUserId - Firestore の users コレクションのドキュメント ID（lineUserId）
 * @returns {Promise<string|null>} FCM トークン、または null（許可されなかった場合）
 */
export async function requestNotificationPermissionAndSaveToken(lineUserId) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('[FCM] このブラウザは通知をサポートしていません。');
    return null;
  }

  // すでに拒否されている場合はスキップ
  if (Notification.permission === 'denied') {
    console.info('[FCM] 通知は拒否されています。');
    return null;
  }

  try {
    // ブラウザの通知許可ダイアログを表示
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.info('[FCM] 通知許可が得られませんでした。');
      return null;
    }

    // Service Worker の登録を確認
    if (!('serviceWorker' in navigator)) {
      console.warn('[FCM] Service Worker 非対応ブラウザです。');
      return null;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });

    const messaging = getMessagingInstance();
    if (!messaging) return null;

    // FCM デバイストークンを取得
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.warn('[FCM] トークンの取得に失敗しました。');
      return null;
    }

    console.info('[FCM] トークン取得成功:', token.slice(0, 20) + '...');

    // Firestore の users/{lineUserId} にトークンを保存（配列で重複なく追加）
    if (lineUserId) {
      const userRef = doc(db, 'users', lineUserId);
      await setDoc(userRef, {
        fcmTokens: arrayUnion(token),
        fcmUpdatedAt: serverTimestamp(),
      }, { merge: true });
      console.info('[FCM] Firestore にトークンを保存しました。');
    }

    return token;
  } catch (err) {
    console.error('[FCM] トークン取得・保存エラー:', err);
    return null;
  }
}

/**
 * フォアグラウンド（アプリ表示中）のメッセージ受信ハンドラを登録する。
 * バックグラウンドは Service Worker が自動で処理する。
 *
 * @param {Function} callback - メッセージ受信時に呼ばれるコールバック
 */
export function onForegroundMessage(callback) {
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
