/* global self, caches */
/* Retires the old MY WORLD worker at /fitapp/world/: drops its caches, unregisters and reloads open pages,
   which then land on the redirect to /myworld/. Caches of the new app are named "mw-*" and are not touched. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('myworld-')).map((k) => caches.delete(k)));
      await self.registration.unregister();
      const pages = await self.clients.matchAll({ type: 'window' });
      pages.forEach((c) => c.navigate(c.url));
    })(),
  );
});
