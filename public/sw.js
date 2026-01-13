// Service Worker for Push Notifications
// This runs in the background and handles incoming push events

self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received');

  if (!event.data) {
    console.log('[Service Worker] Push event has no data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('[Service Worker] Push data:', data);

    const title = data.title || 'IceOut Alert';
    const options = {
      body: data.body || data.message || 'New activity reported in your area.',
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: 'iceout-notification',
      requireInteraction: true,
      data: data,
      actions: [
        { action: 'view', title: 'View on Map' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (error) {
    console.error('[Service Worker] Error parsing push data:', error);
  }
});

self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(function(clientList) {
          // If app is already open, focus it
          for (let client of clientList) {
            if ('focus' in client) {
              return client.focus();
            }
          }
          // Otherwise open a new window
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});

self.addEventListener('notificationclose', function(event) {
  console.log('[Service Worker] Notification closed');
});

// Basic install/activate events
self.addEventListener('install', function(event) {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[Service Worker] Activated');
  event.waitUntil(clients.claim());
});

