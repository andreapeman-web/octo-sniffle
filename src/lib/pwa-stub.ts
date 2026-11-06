// Used instead of vite-plugin-pwa's module in the Claude artifact build (no service worker there).
export function registerSW(_opts?: unknown) {
  void _opts;
  return () => Promise.resolve();
}
