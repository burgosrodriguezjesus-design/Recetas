// Registro del service worker (PWA). Avisa cuando hay una versión nueva
// y cuando la app ya está lista para funcionar sin conexión.
import { registerSW } from 'virtual:pwa-register';

export function setupPWA(handlers: { onNeedRefresh: (update: () => void) => void; onOfflineReady: () => void }) {
  if (!('serviceWorker' in navigator)) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      handlers.onNeedRefresh(() => void update(true));
    },
    onOfflineReady() {
      handlers.onOfflineReady();
    },
  });
}
