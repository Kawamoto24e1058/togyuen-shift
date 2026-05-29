// ============================================================
// public/firebase-messaging-sw.js
// Firebase Cloud Messaging — バックグラウンド通知用 Service Worker
//
// このファイルは public/ フォルダのルートに置いてください。
// ブラウザが自動で登録し、アプリが閉じている状態でも通知を受信します。
//
// ★ messagingSenderId を Firebase Console の値に変更してください
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ★ あなたの Firebase プロジェクトの設定値に置き換えてください
// （src/firebase.js と同じ値です）
firebase.initializeApp({
  apiKey:            "AIzaSyARw6Gf_s56bQd6HhPnoOl6y58QTRm716s",
  authDomain:        "aqua-shitumon.firebaseapp.com",
  projectId:         "aqua-shitumon",
  storageBucket:     "aqua-shitumon.firebasestorage.app",
  messagingSenderId: "983478802486",
  appId:             "1:983478802486:web:c9c4043ab1862ca943a097",
});

const messaging = firebase.messaging();

// -------------------------------------------------------
// バックグラウンドメッセージの受信ハンドラ
// アプリが非アクティブ・閉じている状態で通知が届いたとき、
// OS ネイティブの通知センターに表示する。
// -------------------------------------------------------
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] バックグラウンドメッセージ受信:', payload);

  const title = payload.notification?.title || '桃牛苑 シフト提出の締め切り';
  const body  = payload.notification?.body  || '本日シフトの締め切り日です。アプリから入力をお願いします。';
  const icon  = payload.notification?.icon  || '/icon-192.png'; // public/ に用意してください

  self.registration.showNotification(title, {
    body,
    icon,
    badge: '/icon-72.png',   // Android のバッジアイコン（任意）
    tag: 'shift-reminder',   // 同じタグの通知は上書き（重複防止）
    requireInteraction: false,
    data: {
      url: payload.data?.url || '/',
    },
  });
});

// -------------------------------------------------------
// 通知クリック時の動作
// クリックするとアプリのトップページを開く
// -------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // すでにアプリが開いていればそのウィンドウをフォーカス
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // 開いていなければ新しいタブで開く
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
