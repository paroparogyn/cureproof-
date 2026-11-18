/* CureProof Service Worker (sw.js) — GitHub Pages /cureproof/ Subpath Compatible */
var CACHE_NAME = 'cureproof-apk-cache-v6';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/jsqr@1.3.1/dist/jsQR.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* Offline-First Fetch Handler */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = req.url || '';

  /* Live weather API: Network first, fallback silently if offline */
  if (url.indexOf('api.open-meteo.com') !== -1) {
    event.respondWith(
      fetch(req).catch(function () {
        return new Response(JSON.stringify({ offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  /* App shell, icons, fonts & QR libraries: Cache first, then network + cache update */
  event.respondWith(
    caches.match(req).then(function (cached) {
      var netFetch = fetch(req).then(function (resp) {
        if (resp && resp.status === 200) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, clone).catch(function () {});
          });
        }
        return resp;
      }).catch(function () {
        return cached || caches.match('./index.html');
      });
      return cached || netFetch;
    })
  );
});

/* Background Sync: Flush queued offline curing logs when connection recovers */
self.addEventListener('sync', function (event) {
  if (event.tag === 'cureproof-sync-queue' || event.tag === 'sync-curing-logs') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(function (clients) {
        clients.forEach(function (client) {
          client.postMessage({ type: 'BGM_SYNC_TRIGGER', tag: event.tag });
        });
      })
    );
  }
});

/* Periodic Background Sync: Refresh live site weather and daily curing reminders */
self.addEventListener('periodicsync', function (event) {
  if (event.tag === 'cureproof-weather-sync' || event.tag === 'content-sync') {
    event.waitUntil(
      fetch('https://api.open-meteo.com/v1/forecast?latitude=10.4002&longitude=123.9991&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          return self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(function (clients) {
            clients.forEach(function (client) {
              client.postMessage({ type: 'PERIODIC_WEATHER_UPDATE', data: data });
            });
          });
        })
        .catch(function () {})
    );
  }
});

/* Push Notifications: Display curing reminders and crew alerts */
self.addEventListener('push', function (event) {
  var payload = {
    title: 'CureProof Curing Reminder',
    body: 'Sunny weather alert: Check pours that need water curing today.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: './?action=scan' }
  };
  if (event.data) {
    try {
      var parsed = event.data.json();
      if (parsed.title) payload.title = parsed.title;
      if (parsed.body) payload.body = parsed.body;
      if (parsed.url) payload.data = { url: parsed.url };
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      vibrate: [120, 60, 120],
      data: payload.data
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
