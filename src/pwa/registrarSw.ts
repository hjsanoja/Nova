/** Registra el Service Worker solo en producción (en desarrollo interferiría con el HMR). */
export function registrarServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch((e) => console.warn('No se pudo registrar el Service Worker:', e));
  });
}
