/* ===========================================================
   AETHER SERVICE WORKER
   v1.0 - Optimized for Music & Visual Portfolio
   =========================================================== */

const CACHE_NAME = 'aether-cache-v3';
const DYNAMIC_CACHE = 'aether-dynamic-v3';

// Archivos esenciales que deben cargar sí o sí (App Shell)
const ASSETS_TO_PRECACHE = [
    './',
    './index.html',
    './index_en.html',
    './shorts.html',
    './css/output.css',
    './css/styles.css',
    './js/script.js',
    './js/sw.js',
    './site.webmanifest',
    './img/logo.png',
    './img/logo-icon.svg',
    // Imágenes críticas: ritual + hero + fondo (carga más rápida en visitas repetidas)
    './img/cosmic_background.webp',
    './img/1.webp',
    './img/hero-mobile1.webp',
    './img/bg_converted.webp'
];

// ==========================================
// 1. INSTALACIÓN (Pre-carga de archivos)
// ==========================================
self.addEventListener('install', (event) => {
    // Forzar al SW a activarse inmediatamente
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Precaching App Shell');
            return Promise.all(
                ASSETS_TO_PRECACHE.map((asset) =>
                    cache.add(asset).catch((err) => {
                        console.warn('[SW] No se pudo precachear:', asset, err);
                    })
                )
            );
        })
    );
});

// ==========================================
// 2. ACTIVACIÓN (Limpieza de cachés viejas)
// ==========================================
self.addEventListener('activate', (event) => {
    // Reclamar control de los clientes inmediatamente
    event.waitUntil(clients.claim());

    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) {
                        console.log('[SW] Eliminando caché antigua:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});

// ==========================================
// 3. INTERCEPTOR DE PETICIONES (FETCH)
// ==========================================
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // A. ESTRATEGIA PARA AUDIO (Network First, luego Cache)
    // Importante para permitir "Range Requests" (saltar en la canción)
    if (requestUrl.pathname.endsWith('.m4a') || requestUrl.pathname.endsWith('.mp3')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Si la red responde bien, guardamos copia y devolvemos
                    // Clonamos porque el stream solo se puede consumir una vez
                    const resClone = response.clone();
                    caches.open(DYNAMIC_CACHE).then((cache) => {
                        cache.put(event.request, resClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Si falla la red (Offline), intentamos servir desde caché
                    return caches.match(event.request);
                })
        );
        return;
    }

    // B. ESTRATEGIA PARA IMÁGENES Y FUENTES (Cache First, luego Network)
    // Ideal para .webp, .png, google fonts, etc.
    if (
        event.request.destination === 'image' || 
        event.request.destination === 'font' ||
        requestUrl.pathname.includes('/img/')
    ) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse; // Devolver caché si existe
                }
                // Si no está en caché, buscar en red y guardar
                return fetch(event.request).then((networkResponse) => {
                    return caches.open(DYNAMIC_CACHE).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // C. ESTRATEGIA PARA HTML/CSS/JS (Stale-While-Revalidate)
    // Carga lo que hay en caché rápido, pero busca actualizaciones en segundo plano
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            });
            // Devuelve la caché si existe, si no, espera a la red
            return cachedResponse || fetchPromise;
        })
    );
});