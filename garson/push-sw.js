/* global self, clients */
// Bu dosya değişince sürümü artırın (teslim kaydında görünür)
const SW_VERSION = '2026-11-20d';
// Web Push: service worker'a eklenir (vite.config.ts → workbox.importScripts).
// Sunucu (supabase/functions/send-push) şu yükü gönderir:
//   { title, body, tag, url }

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(Promise.all([showReady(data), sendAck(data.ack)]));
});

/** Teşhis: sunucuya "bu bildirim telefona ulaştı" bilgisini yollar (başarısızsa önemsiz). */
async function sendAck(ack) {
  if (!ack || !ack.url || !ack.id) return;
  try {
    await fetch(ack.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ack.key, Authorization: `Bearer ${ack.key}` },
      body: JSON.stringify({ ack: `${ack.id} sw:${SW_VERSION}` }),
    });
  } catch {
    // önemsiz
  }
}

/** Her "hazır" fiş (her masa) AYRI bildirim olarak gösterilir; öncekiler kapatılmaz. */
async function showReady(data) {
  const icon = new URL('icons/icon-192.png', self.registration.scope).href;
  await self.registration.showNotification(data.title || 'Sipariş hazır', {
    body: data.body || '',
    // Sunucu her hazır anı için benzersiz etiket yollar; yoksa yine benzersiz yap
    tag: data.tag || `ready-${Date.now()}`,
    renotify: true,
    // Garson dokunana kadar ekranda/kilit ekranında kalsın (kendiliğinden kaybolmasın)
    requireInteraction: true,
    silent: false,
    icon,
    badge: icon,
    // Cepteyken fark edilsin: uzun ve belirgin titreşim
    vibrate: [400, 150, 400, 150, 400],
    timestamp: Date.now(),
    lang: 'tr',
    data: { url: data.url || '' },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Uygulama alt klasörde de çalışabilir (ör. /garson/): '/' veya boş adres uygulamanın kendi kökü sayılır.
  const scope = self.registration.scope;
  const raw = event.notification.data?.url;
  const target = !raw || raw === '/' ? scope : new URL(raw, scope).href;

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(scope)) {
          await client.focus();
          return;
        }
      }
      await clients.openWindow(target);
    })(),
  );
});

// Tarayıcı aboneliği kendiliğinden yenilerse uygulama bir sonraki açılışta
// aboneliği yeniden kaydeder (usePush). Burada sunucuya oturumsuz istek atılmaz.
