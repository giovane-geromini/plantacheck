// public/sw.js

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ✅ SW seguro: não intercepta Next chunks nem auth.
// Se der erro, deixa o browser seguir o fluxo normal.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // não mexer em outros domínios
  if (url.origin !== self.location.origin) return;

  // não interceptar assets críticos do Next
  if (url.pathname.startsWith("/_next/")) return;

  // não interceptar API/auth callback do Supabase
  if (url.pathname.startsWith("/auth/")) return;

  // não interceptar arquivos de dev/hot reload
  if (url.pathname.includes("hot-update")) return;

  // por padrão: não faz nada (pass-through)
  // (isso evita "Failed to fetch" e quebra geral)
});
