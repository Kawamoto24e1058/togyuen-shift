const CACHE_NAME = 'togyuen-shift-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // API requests and dynamic data bypass cache
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  const isDocumentRequest = event.request.mode === 'navigate' || 
                            event.request.url.endsWith('/') || 
                            event.request.url.includes('/index.html') ||
                            event.request.url.includes('/callback');

  if (isDocumentRequest) {
    // Network-First strategy for pages/documents to ensure instant updates
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200 && event.request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  } else {
    // Cache-First strategy for static assets
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          if (response.status === 200 && event.request.method === 'GET' && !event.request.url.includes('chrome-extension')) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          // offline fallback
        });
      })
    );
  }
});

// ==========================================
// Web Push Notification Listener
// ==========================================
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = { title: '🍎 桃牛苑 シフト提出のお願い', body: event.data.text() };
    }
  }

  const title = payload.title || '🍎 桃牛苑 シフト提出のお願い';
  const body = payload.body || '本日シフトの締め切り日です。アプリから入力をお願いします。';
  const icon = payload.icon || '/icon-192.png';
  const url = payload.url || '/';

  const options = {
    body,
    icon,
    badge: '/icon-192.png',
    tag: 'shift-reminder', // Ensures duplicate reminders overwrite instead of creating multiple alerts
    renotify: true, // Alerts the user even if tag is the same
    requireInteraction: false,
    data: { url }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If window is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
