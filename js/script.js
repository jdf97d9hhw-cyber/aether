/* ==========================================
   LIKES: SOLO LOCALSTORAGE (SIN SERVIDOR)
   ========================================== */

// Función para obtener un ID único del track
function getTrackId(track) {
    // Usamos title + artist como identificador único
    return `${track.title || ''}_${track.artist || ''}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

// Caché de likes en memoria + claves de almacenamiento
let likesCache = {};
const USER_LIKED_TRACKS_KEY = 'aether_user_liked_tracks_v1';
const LIKES_STORAGE_KEY = 'aether_likes';
const DEFAULT_BASE_LIKES = [20, 32, 24, 29, 41, 26, 35, 22, 18, 30];

function getBaseLikes(track, index = 0) {
    if (track && Number.isFinite(track.baseLikes)) return track.baseLikes;
    return DEFAULT_BASE_LIKES[index % DEFAULT_BASE_LIKES.length];
}

function getDisplayLikeCount(track, trackId, index = 0) {
    return getBaseLikes(track, index) + (likesCache[trackId] || 0);
}

function getUserLikedTracksMap() {
    try {
        const raw = localStorage.getItem(USER_LIKED_TRACKS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

function hasUserLikedTrack(trackId) {
    const likedMap = getUserLikedTracksMap();
    return !!likedMap[trackId];
}

function markUserLikedTrack(trackId) {
    const likedMap = getUserLikedTracksMap();
    likedMap[trackId] = true;
    localStorage.setItem(USER_LIKED_TRACKS_KEY, JSON.stringify(likedMap));
}

// Cargar likes solo desde localStorage
async function loadLikes() {
    const stored = localStorage.getItem(LIKES_STORAGE_KEY);
    if (stored) {
        try {
            likesCache = JSON.parse(stored);
        } catch (e) {
            likesCache = {};
        }
    }
}

// Guardar like solo en localStorage
async function saveLike(trackId) {
    likesCache[trackId] = (likesCache[trackId] || 0) + 1;
    localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(likesCache));
    return likesCache[trackId];
}

// Obtener contador de likes para un track
function getLikeCount(trackId) {
    return likesCache[trackId] || 0;
}

// True si el usuario ha dado like a al menos una sesión (para mostrar "Para ti")
function hasAnyLikes() {
    const map = getUserLikedTracksMap();
    return Object.keys(map).length > 0;
}

// Función global para manejar clicks en el botón de like
async function handleLikeClick(e, trackId, buttonElement) {
    e.stopPropagation(); // Evitar que se active el click de la tarjeta
    if (hasUserLikedTrack(trackId)) return;

    // Deshabilitar botón temporalmente para evitar múltiples clicks
    buttonElement.disabled = true;
    buttonElement.style.opacity = '0.6';
    
    try {
        const newCount = await saveLike(trackId);
        
        // Actualizar el contador en el botón
        markUserLikedTrack(trackId);

        const baseLikes = Number(buttonElement.dataset.baseLikes || 0);
        const countElement = buttonElement.querySelector('.like-count-num');
        if (countElement) {
            countElement.textContent = String(baseLikes + newCount);
        }
        
        // Animación de feedback
        buttonElement.classList.add('like-animated');
        buttonElement.classList.add('like-btn--locked');
        setTimeout(() => {
            buttonElement.classList.remove('like-animated');
        }, 600);

        // Mostrar bloque "Para ti" en la sección Sesiones (solo tras dar like)
        try {
            window.dispatchEvent(new CustomEvent('aether:like-added'));
        } catch (err) {}
        
    } catch (error) {
        console.error('Error al guardar like:', error);
    } finally {
        // Solo desbloquear si aún no tiene like del usuario
        if (!hasUserLikedTrack(trackId)) {
            setTimeout(() => {
                buttonElement.disabled = false;
                buttonElement.style.opacity = window.innerWidth <= 768 ? '0.42' : '0.5';
            }, 300);
        } else {
            buttonElement.disabled = true;
            buttonElement.style.opacity = window.innerWidth <= 768 ? '0.42' : '0.5';
        }
        if (liquidCarousel) {
            setTimeout(() => liquidCarousel.updateCardTransforms(), 100);
        }
    }
}

/* ==========================================
   UTILIDADES GLOBALES
   ========================================== */
function isEnglishPage() {
    return document.documentElement.lang.startsWith('en') || (window.location.pathname || '').includes('_en');
}

function t(track, prop) {
    return (isEnglishPage() && track[prop + '_en']) ? track[prop + '_en'] : track[prop];
}

function formatSessionDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const [y, m] = dateStr.split('-');
    if (!y) return '';
    const monthsEs = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const monthsEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const months = isEnglishPage() ? monthsEn : monthsEs;
    const month = m && parseInt(m, 10) >= 1 && parseInt(m, 10) <= 12 ? months[parseInt(m, 10) - 1] : '';
    return month ? `${month} ${y}` : y;
}

/* ==========================================
   FUNCIÓN GLOBAL: COMPARTIR
   (Debe estar fuera para funcionar con onclick="" en el HTML inyectado)
   ========================================== */
function shareTrack(e, title, artist) {
    e.stopPropagation();

    const cleanUrl = window.location.origin + window.location.pathname + '#music';
    const isEn = isEnglishPage();
    const text = isEn
        ? `Listen to "${title}" by ${artist} on Aether.`
        : `Escucha "${title}" de ${artist} en Aether.`;

    if (navigator.share) {
        navigator.share({
            title: `Aether - ${title}`,
            text: text,
            url: cleanUrl
        }).catch(console.error);
    } else {
        navigator.clipboard.writeText(`${text} ${cleanUrl}`);
        
        const btn = e.currentTarget;
        const originalHTML = btn.innerHTML;
        
        btn.classList.add('text-white');
        btn.innerHTML = '<span class="text-[9px] uppercase tracking-widest font-bold">' + (isEn ? 'Copied' : 'Copiado') + '</span>';
        
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('text-white');
            if(window.lucide) lucide.createIcons(); // Re-renderizar iconos si Lucide está disponible
        }, 2000);
    }
}

/* ==========================================
   LÓGICA PRINCIPAL (DOM LOADED)
   ========================================== */
document.addEventListener('DOMContentLoaded', function () {

    // Cargar likes al iniciar
    loadLikes().then(() => {
        // Re-render para reflejar los contadores reales al terminar la carga
        if (typeof renderPlaylist === 'function') renderPlaylist(false);
    });

    // Inicializar iconos de Lucide si están disponibles
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // ==========================================
    // PWA Install: botón "Descargue esta aplicación" / "Download this app"
    // ==========================================
    (function () {
        var installBtns = document.querySelectorAll('.pwa-install-btn');
        if (!installBtns.length) return;
        var deferredPrompt = null;
        var hintEl = document.getElementById('pwa-install-hint');
        var isSpanish = (document.documentElement.getAttribute('lang') || '').toLowerCase().indexOf('es') === 0;
        var hintTimeout = null;

        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            deferredPrompt = e;
        });

        function showHint(text) {
            if (!hintEl) return;
            if (hintTimeout) clearTimeout(hintTimeout);
            hintEl.textContent = text;
            hintEl.hidden = false;
            hintTimeout = setTimeout(function () {
                hintEl.hidden = true;
                hintTimeout = null;
            }, 10000);
        }

        installBtns.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then(function (choice) {
                        deferredPrompt = null;
                    });
                    return;
                }
                // Sin diálogo nativo: mostrar instrucciones (iOS no tiene beforeinstallprompt)
                var ua = navigator.userAgent || '';
                var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                if (isIOS) {
                    showHint(isSpanish
                        ? 'Para instalar: toca el botón Compartir (↑) abajo en Safari y elige «Añadir a la pantalla de inicio».'
                        : 'To install: tap the Share button (↑) in Safari, then «Add to Home Screen».');
                } else {
                    showHint(isSpanish
                        ? 'Para instalar: abre el menú del navegador (⋮) y busca «Instalar aplicación» o «Añadir a la pantalla de inicio».'
                        : 'To install: open the browser menu (⋮) and choose «Install app» or «Add to Home Screen».');
                }
            });
        });
        window.addEventListener('appinstalled', function () {
            deferredPrompt = null;
        });
    })();

    // ==========================================
    // 1. NAVBAR + SCROLL UNIFICADO (un solo rAF por frame para mejor rendimiento)
    // ==========================================
    const navbar = document.getElementById('navbar');
    window.__scrollTickCallbacks = window.__scrollTickCallbacks || [];

    // Efecto Scroll en Navbar
    let lastScrollY = 0;
    let ticking = false;
    let navActive = false;

    function getScrollY() {
        var y = 0;
        if (typeof window.scrollY === 'number') y = window.scrollY;
        if (document.documentElement && document.documentElement.scrollTop > y) y = document.documentElement.scrollTop;
        if (document.body && document.body.scrollTop > y) y = document.body.scrollTop;
        return y;
    }

    function updateNavScrollEffect(scrollY) {
        if (!navbar) return;
        var threshold = 30;
        if (scrollY > threshold && !navActive) {
            navbar.classList.add('nav-scrolled');
            navActive = true;
        } else if (scrollY <= threshold && navActive) {
            navbar.classList.remove('nav-scrolled');
            navActive = false;
        }
    }

    function updateNavbarHeightVar() {
        if (!navbar) return;
        document.documentElement.style.setProperty('--navbar-height', navbar.offsetHeight + 'px');
    }

    function onScrollUnified() {
        lastScrollY = getScrollY();
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(function () {
                updateNavbarHeightVar();
                updateNavScrollEffect(lastScrollY);
                (window.__scrollTickCallbacks || []).forEach(function (fn) { fn(); });
                ticking = false;
            });
        }
    }

    updateNavbarHeightVar();
    updateNavScrollEffect(getScrollY());
    window.addEventListener('resize', updateNavbarHeightVar);
    window.addEventListener('scroll', onScrollUnified, { passive: true });
    document.body.addEventListener('scroll', onScrollUnified, { passive: true });
    document.addEventListener('scroll', onScrollUnified, { passive: true, capture: true });
    setTimeout(function () { updateNavScrollEffect(getScrollY()); }, 100);

    // Click suave en el logo DJ Aether para volver al top
    if (navbar) {
        const logoLink = navbar.querySelector('a[href="#home"]');
        if (logoLink) {
            logoLink.addEventListener('click', (e) => {
                e.preventDefault();
                // Evitar que el hash cambie la URL
                history.replaceState(null, '', window.location.pathname + window.location.search);

                // Scroll al píxel 0 — compatible con distintos navegadores
                window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                document.body.scrollTo({ top: 0, left: 0, behavior: 'smooth' });

                // Expansión completa del header
                const hs = document.getElementById('home');
                if (hs) hs.classList.remove('header-shrink');

                // Re-sincronizar tras la animación
                setTimeout(() => {
                    if (typeof updateHeaderShrink === 'function') updateHeaderShrink();
                    updateNavScrollEffect(getScrollY());
                }, 500);
            });
        }
        // Selector de idioma: navegación en el primer clic (evita tener que pulsar dos veces)
        const langLinks = navbar.querySelectorAll('a[href="index_en.html"], a[href="index.html"]');
        langLinks.forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var href = link.getAttribute('href');
                if (href) window.location.href = href;
            }, true);
        });
    }

// ==========================================
    // 2. SCROLL REVEAL & GALERÍA
    // ==========================================
    
    const revealObserver = new IntersectionObserver(
        (entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    obs.unobserve(entry.target); // Dejar de observar una vez animado
                }
            });
        },
        { 
            threshold: 0.15, // Se activa cuando el 15% del elemento es visible
            rootMargin: '0px 0px -50px 0px' // Margen para que active un poco antes de subir del todo
        }
    );

    // Seleccionamos todas las clases de animación: la antigua y las nuevas laterales
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => {
        revealObserver.observe(el);
    });

    // Animación para elementos de contexto (context-item)
    const contextObserver = new IntersectionObserver(
        (entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    obs.unobserve(entry.target);
                }
            });
        },
        { 
            threshold: 0.1,
            rootMargin: '0px 0px -30px 0px'
        }
    );

    document.querySelectorAll('.context-item').forEach(el => {
        contextObserver.observe(el);
    });

    // ==========================================
    // 3. REPRODUCTOR DE AUDIO (LÓGICA CORE)
    // ==========================================
    const mainAudio = document.getElementById('audio-player');
    const mainPlayBtn = document.getElementById('play-btn');
    const bottomPlayer = document.getElementById('bottom-player'); // Reproductor flotante inferior
    // Datos de las canciones.
    // Para que una sesión aparezca solo en "Más sesiones" (y no en las tarjetas), añade showInCards: false.
    const tracks = [
        {
        title: "Unfiltered",
        title_en: "Unfiltered",
        artist: "Aether - Analog Soul",
        artist_en: "Aether - Analog Soul",
        src: "audio/Unfiltered.m4a",
        cover: "img/car11.png",
        bgImage: "img/tar-dg-11.webp",
        mood: ["Raw Deep Flow · 1:03:00"],
        mood_en: ["Raw Deep Flow · 1:03:00"],
        genre: ["Deep House", "Soulful", "Underground"],
        energy: 2,
        isNew: true,
        },
        {
            title: "Where Love Lives",
            title_en: "Where Love Lives",
            artist: "Aether - HLD WTHN",
            artist_en: "Aether - HLD WTHN",
            src: "audio/11.m4a",
            cover: "img/car1.png",
            bgImage: "img/tar-dg-7.webp",
            mood: ["Contemplative Tenderness & Jazz · 44:00:00"],
            genre: ["Contemplative", "Jazz", "Tenderness"],
            energy: 1,
            //isNew: true,
        },
        {
            title: "Elevation in Colors",
            title_en: "Elevation in Colors",
            artist: "Aether – Warm Frequencies",
            artist_en: "Aether – Warm Frequencies",
            src: "audio/Elevation_in_Warm_Colors.m4a",
            cover: "img/car2.png",
            bgImage: "img/tar-dg-10.webp",
            mood: ["Warm Cosmic Deep · 1:01:00"],
            mood_en: ["Warm Cosmic Deep · 1:01:00"],
            genre: ["Soulful", "Deep House", "Cosmic"],
            energy: 3,
        },
        {
            title: "House Is A Feeling",
            title_en: "House Is A Feeling",
            artist: "Aether – Soul Transmission",
            artist_en: "Aether – Soul Transmission",
            src: "audio/House_Is_A_Feeling.m4a",
            cover: "img/car3.png",
            bgImage: "img/tar-dg-9.webp",
            mood: ["Soulful Deep House · 1:00:00"],
            mood_en: ["Soulful Deep House · 1:00:00"],
            genre: ["Soulful", "Deep House"],
            energy: 2,
        },
        {
            title: "VOID",
            title_en: "VOID",
            artist: "Aether • For Inner Space",
            artist_en: "Aether • For Inner Space",
            src: "audio/10.m4a",
            cover: "img/car4.png",
            bgImage: "img/tar-dg-6.webp", 
            mood: ["Spiritual House · 53:00:00"],
            genre: ["Spiritual", "House"],
            energy: 1,
        },
        {
            title: "Roots in Motion",
            title_en: "Roots in Motion",
            artist: "Aether • Organic Grooves",
            artist_en: "Aether • Organic Grooves",
            src: "audio/12.m4a",
            cover: "img/car5.png",
            bgImage: "img/tar-dg-8.webp", 
            mood: ["raw energy · 58:18:00"],
            genre: ["Organic", "Raw", "High Energy"],
            energy: 4,
        },
        {
            title: "BLUE SUNRISE",
            title_en: "BLUE SUNRISE",
            artist: "Aether • Warm Crudo",
            artist_en: "Aether • Warm Crudo",
            src: "audio/Blue_Sunrise.m4a",
            cover: "img/car6.png",
            bgImage: "img/tar-dg-5.webp",
            mood: ["warm organic · 1:46:00"],
            genre: ["Warm", "Organic", "Deep"],
            energy: 2,
        },
        {
            title: "SACRED PULSE",
            title_en: "SACRED PULSE",
            artist: "Aether • Deep Soul Mix",
            artist_en: "Aether • Deep Soul Mix",
            src: "audio/9.m4a",
            cover: "img/car7.png",
            bgImage: "img/tar-dg-1.webp", 
            mood: ["soulful house · 54:55:00"],
            genre: ["Soulful", "House"],
            energy: 3,
        },
        {
            title: "WARM FLOW",
            title_en: "WARM FLOW",
            artist: "Aether • Sonic Presence",
            artist_en: "Aether • Sonic Presence",
            src: "audio/8.m4a",
            cover: "img/car8.png",
            bgImage: "img/tar-dg-2.webp", 
            mood: ["underground warm · 50:31:00"],
            genre: ["Underground", "Warm", "House"],
            energy: 2,
        },
        {
            title: "INNER WISDOM",
            title_en: "INNER WISDOM",
            artist: "Aether • Deep Listening",
            artist_en: "Aether • Deep Listening",
            src: "audio/7.m4a",
            cover: "img/car9.png",
            bgImage: "img/tar-dg-4.webp", 
            mood: ["introspective meditative · 1:06:00"],
            genre: ["Introspective", "Meditative", "Ambient"],
            energy: 1,
        },
        {
            title: "ATMOSPHERE",
            title_en: "ATMOSPHERE",
            artist: "Aether • G.Collector",
            artist_en: "Aether • G.Collector",
            src: "audio/6.m4a",
            cover: "img/car10.png",
            bgImage: "img/tar-dg-3.webp", 
            mood: ["deep atmospheric · 1:06:00"],
            genre: ["Deep", "Atmospheric"],
            energy: 2,
        },
        // Cómo añadir una sesión más:
        // 1. Copia uno de los objetos de arriba (entre { }).
        // 2. Cambia title, title_en, artist, artist_en, src, cover, bgImage, mood, genre, energy.
        // 3. Añade el audio en audio/ y las imágenes en img/ (cover = vinilo, bgImage = fondo de tarjeta).
        // 5. Opcional: date: "2025-01" (muestra "Ene 2025" en la lista) o year: 2024.
        // 6. Opcional: link: "https://..." para mostrar icono de enlace externo (Bandcamp, SoundCloud, etc.).
        // 7. Si quieres que solo aparezca en "Más sesiones" y no en tarjetas, añade showInCards: false.
        // Ejemplo: sesión solo en "Más sesiones" (no en tarjetas):
        // {
        //     title: "OTRA SESIÓN",
        //     title_en: "ANOTHER SESSION",
        //     artist: "Aether",
        //     artist_en: "Aether",
        //     src: "audio/4.m4a",
        //     cover: "img/car1.webp",
        //     bgImage: "img/tar-dg-1.webp",
        //     mood: ["deep · 45:00"],
        //     genre: ["Deep", "House"],
        //     showInCards: false,
        // },
    ];

    let currentTrackIndex = 0;
    
    // Elementos UI del Player
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    const playerImg = document.getElementById('player-img');
    const trackTitle = document.getElementById('track-title');
    const trackArtist = document.getElementById('track-artist');
    const playlistContainer = document.getElementById('playlist-container');
    const sessionsListEl = document.getElementById('sessions-list');

    // Detectar idioma (usa las funciones globales isEnglishPage y t)

    // Prefetch de siguiente pista
    function prefetchNextTrack(index) {
        try {
            if (!tracks || !tracks.length) return;
            const nextIndex = (index + 1) % tracks.length;
            const src = tracks[nextIndex] && tracks[nextIndex].src;
            if (src) {
                document.querySelectorAll('link[rel="prefetch"][as="audio"]').forEach(n => n.remove());
                const link = document.createElement('link');
                link.rel = 'prefetch';
                link.as = 'audio';
                link.href = src;
                document.head.appendChild(link);
            }
        } catch (e) { console.error("Prefetch error:", e); }
    }




    // 3.1 RENDERIZAR PLAYLIST (solo sesiones con showInCards !== false; la lista "Más sesiones" muestra todas)
function renderPlaylist(shouldScroll = true) {
    if (!playlistContainer) return;
    playlistContainer.innerHTML = '';

    tracks.forEach((track, index) => {
        if (track.showInCards === false) return; // Solo en la lista "Más sesiones", no en tarjetas
        const div = document.createElement('div');
        const isActive = index === currentTrackIndex;
        const isPlaying = isActive && mainAudio && !mainAudio.paused;
        const trackId = getTrackId(track);
        const initialLikeCount = Number(getDisplayLikeCount(track, trackId, index) || 0);
        const userAlreadyLiked = hasUserLikedTrack(trackId);
        const likeLockedClass = userAlreadyLiked ? ' like-btn--locked' : '';
        const likeDisabledAttr = userAlreadyLiked ? ' disabled' : '';

        div.className = `session-card ${isActive ? 'active' : ''} ${isPlaying ? 'playing' : ''}`.trim();
        div.setAttribute('role', 'button');
        div.setAttribute('tabindex', '0');
        div.setAttribute('data-index', String(index));
        div.setAttribute('aria-current', isActive ? 'true' : 'false');
        div.setAttribute('aria-label', `${t(track, 'title')} · ${t(track, 'artist')}`);

        // Solo las primeras 3 tarjetas cargan enseguida; el resto lazy (mejora carga inicial)
        const cardLoading = index <= 2 ? 'eager' : 'lazy';
        // HTML INTERNO (CON IMAGEN DE FONDO + DATOS)
     div.innerHTML = `
            <!-- 1. CAPA DE FONDO -->
            <div class="absolute inset-0 z-0 overflow-hidden rounded-[30px]">
                <img src="${track.bgImage || track.cover}" alt=""
                     loading="${cardLoading}" decoding="async"
                     class="w-full h-full object-cover transition-transform duration-700 ease-out session-card-bg"
                     style="filter: brightness(0.28) saturate(0.84); transform: scale(1.05);">
                <div class="absolute inset-0 bg-gradient-to-b from-black/58 via-black/30 to-black/56"></div>
            </div>

            <!-- Nuevo: esquina superior izquierda -->
            ${track.isNew ? `<span class="session-new-badge absolute top-2.5 left-2.5 z-30 pointer-events-none">${isEnglishPage() ? 'New' : 'Nuevo'}</span>` : ''}

            <!-- Like: esquina superior derecha real de la tarjeta -->
            <button class="like-btn${likeLockedClass} absolute top-8 right-8 pointer-events-auto z-30 flex items-center gap-1 group"
                    onclick="handleLikeClick(event, '${trackId}', this)"
                    aria-label="${isEnglishPage() ? 'Like this track' : 'Me gusta esta sesión'}"
                    data-base-likes="${getBaseLikes(track, index)}"${likeDisabledAttr}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="like-icon text-white/65 group-hover:text-white/85 transition-colors shrink-0">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span class="like-count text-[10px] text-white/78 group-hover:text-white/90 font-medium tabular-nums">
                        <span class="like-count-num">${initialLikeCount}</span>
                    </span>
                </button>

            <!-- 2. CONTENIDO -->
            <div class="relative z-10 w-full h-full flex flex-col items-center justify-between">

                <!-- HEADER -->
                <div class="w-full text-center pointer-events-none px-2 flex flex-col gap-1 pt-0">
                    <div class="flex flex-col items-center justify-center gap-0.5">
                        <h3 class="font-serif text-2xl text-white leading-tight drop-shadow-lg tracking-wide">
                            ${t(track, 'title')}
                        </h3>
                    </div>
                    <p class="text-[9px] uppercase tracking-[0.25em] text-white/60 font-medium">
                        ${t(track, 'artist')}
                    </p>
                </div>
                
                <!-- VINILO (Estructura mejorada para giro suave) -->
                <!-- El contenedor externo solo maneja el tamaño y la sombra -->
                <div class="card-vinyl-container pointer-events-none">
                    
                    <!-- Este DIV interno es el que gira. Al separarlos, el giro es pura seda. -->
                    <div class="w-full h-full flex items-center justify-center ${isPlaying ? 'spin-vinyl' : 'spin-vinyl spin-paused'}">
                        
                        <!-- Surcos del vinilo (pseudo-imagen generada por CSS o imagen de fondo) -->
                        <!-- Oculto hasta que la imagen cargue -->
                        <div class="vinyl-grooves absolute inset-0 rounded-full border border-white/5" 
                             style="background: repeating-radial-gradient(#111 0, #111 2px, #1a1a1a 3px, #1a1a1a 4px); opacity: 0; transition: opacity 0.5s ease-in-out;">
                        </div>

                        <!-- La Galleta (Imagen central) — círculo perfecto, imagen completa sin recorte -->
                        <div class="vinyl-label-wrap relative w-[92%] aspect-square rounded-full overflow-hidden border border-white/10 z-10 shadow-inner bg-black flex items-center justify-center">
                            <img src="${track.cover}" alt="${(t(track, 'title') || '')} — ${(t(track, 'artist') || '')}" loading="${cardLoading}" decoding="async"
                                 class="vinyl-image w-full h-full object-contain opacity-90" 
                                 style="filter: brightness(0.6) saturate(1.2);"
                                 data-track-index="${index}">
                        </div>
                        
                        <!-- Brillo estático (Overlay) -->
                        <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-white/10 to-transparent pointer-events-none mix-blend-overlay"></div>
                    </div>
                </div>

                <!-- FOOTER -->
                <div class="session-card-footer w-full flex flex-col items-center gap-3 pointer-events-none pb-8">
                    <!-- Tag (mood) + duración + energía (siempre presente para que el botón no salte al activar) -->
                    <div class="flex flex-col items-center gap-1">
                        <div class="tag-pill">
                            ${((isEnglishPage() && track.mood_en ? track.mood_en[0] : track.mood[0]) || "Deep").split(' · ')[0].trim()}
                        </div>
                        ${(() => {
                            const moodRaw = (isEnglishPage() && track.mood_en ? track.mood_en[0] : track.mood[0]) || '';
                            const rawDuration = track.duration || (moodRaw.includes(' · ') ? moodRaw.split(' · ').pop().trim() : '');
                            const durationLabel = formatDurationWithSeconds(rawDuration);
                            return durationLabel ? `<span class="session-card-duration text-white/60 text-[10px] font-mono tracking-wider">${durationLabel}</span>` : '';
                        })()}
                        ${(() => {
                            const maxDots = 5;
                            const e = Math.min(Number(track.energy) || 0, maxDots);
                            const energyLabel = isEnglishPage() ? 'Energy' : 'Energía';
                            return `<span class="energy-dots text-white/50 text-[10px] uppercase tracking-wider" aria-label="${energyLabel}: ${e}"><span class="energy-dots-label">${energyLabel}:</span> <span class="energy-dots-circles" aria-hidden="true">${'●'.repeat(e)}</span></span>`;
                        })()}
                    </div>

                    ${isActive ? `
                        <!-- BOTÓN CRISTAL ACTIVO -->
                        <div class="session-card-listen-btn group flex items-center gap-3 px-4 py-2 mt-1 rounded-full 
                                    bg-white/10 backdrop-blur-md border border-white/15 
                                    hover:bg-white/15 hover:border-white/25 hover:scale-[1.02]
                                    shadow-[0_6px_16px_rgba(0,0,0,0.25)] 
                                    transition-all duration-300 pointer-events-auto cursor-pointer">
                            
                            <i data-lucide="${isPlaying ? 'pause' : 'play'}" 
                               class="w-4 h-4 text-white fill-current session-card-listen-btn-icon"></i>
                            
                            <!-- AQUI ESTÁ EL CAMBIO DE IDIOMA -->
                            <span class="session-card-listen-btn-text text-[11px] uppercase tracking-[0.2em] text-white font-semibold">
                                ${isPlaying 
                                    ? (isEnglishPage() ? 'Pause' : 'Pausar') 
                                    : (isEnglishPage() ? 'Listen' : 'Escuchar')
                                }
                            </span>
                        </div>
                    ` : `
                        <!-- TEXTO INACTIVO -->
                        <div class="h-[50px] flex items-center justify-center">
                            <span class="text-white/40 text-[9px] uppercase tracking-widest">
                                ${isEnglishPage() ? 'Tap to select' : 'Tocar para elegir'}
                            </span>
                        </div>
                    `}
                </div>
            </div>
        `;

        function handleCardAction(e) {
            if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
            if (e.type === 'keydown') e.preventDefault();
            e.stopPropagation();
            if (index === currentTrackIndex) {
                if (mainAudio.paused) {
                    mainAudio.play();
                } else {
                    mainAudio.pause();
                }
            } else {
                loadTrack(index, true);
            }
        }

        div.addEventListener('click', handleCardAction);
        div.addEventListener('keydown', handleCardAction);

        playlistContainer.appendChild(div);
        
        // Función robusta para mostrar los surcos solo cuando la imagen esté cargada
        const vinylImage = div.querySelector('.vinyl-image');
        const vinylGrooves = div.querySelector('.vinyl-grooves');
        const vinylContainer = div.querySelector('.card-vinyl-container');
        
        if (vinylImage && vinylContainer) {
            // Función para mostrar los surcos (el CSS maneja la visualización)
            const showGrooves = () => {
                vinylContainer.classList.add('image-loaded');
                vinylImage.classList.add('loaded');
            };
            
            // Función para ocultar permanentemente si hay error
            const hideGroovesOnError = () => {
                // Si falla, simplemente no añadimos la clase image-loaded
                // El CSS mantendrá los elementos ocultos
                if (vinylGrooves) {
                    vinylGrooves.style.display = 'none';
                }
            };
            
            // Verificar si ya está cargada (caso de caché o carga rápida)
            if (vinylImage.complete && vinylImage.naturalHeight !== 0) {
                showGrooves();
            } else {
                // Esperar a que cargue
                vinylImage.addEventListener('load', showGrooves, { once: true });
                vinylImage.addEventListener('error', hideGroovesOnError, { once: true });
                
                // Fallback: si después de un tiempo razonable no ha cargado, verificar de nuevo
                setTimeout(() => {
                    if (vinylImage.complete && vinylImage.naturalHeight !== 0) {
                        showGrooves();
                    }
                }, 2000);
            }
        }
    });

    if (window.lucide) lucide.createIcons();

    // SOLO CENTRAMOS SI SE PIDE EXPLÍCITAMENTE (Evita salto al cargar)
    if (shouldScroll) {
        setTimeout(() => {
            scrollToCenter(currentTrackIndex);
        }, 50);
    }

    // Tras renderizar, actualizamos qué tarjeta está más centrada visualmente
    setTimeout(() => {
        updateCenteredCard();
    }, 80);
}

// FUNCIÓN MATEMÁTICA PARA CENTRAR (NO MUEVE LA PÁGINA)
function scrollToCenter(index) {
    if (!playlistContainer) return;
    
    // Use LiquidCarousel if available for smooth spring animation
    if (liquidCarousel) {
        liquidCarousel.scrollToIndex(index);
        setTimeout(() => {
            updateCenteredCard();
        }, 300);
        return;
    }
    
    // Fallback to original smooth scroll
    const cards = playlistContainer.querySelectorAll('.session-card');
    const targetCard = cards[index];
    
    if (targetCard) {
        const containerWidth = playlistContainer.clientWidth;
        const cardWidth = targetCard.offsetWidth;
        const cardLeft = targetCard.offsetLeft;
        
        // Cálculo exacto del centro
        const scrollPos = cardLeft - (containerWidth / 2) + (cardWidth / 2);

        playlistContainer.scrollTo({
            left: scrollPos,
            behavior: 'smooth'
        });

        // Una vez centramos por código, marcamos la tarjeta centrada
        setTimeout(() => {
            updateCenteredCard();
        }, 120);
    }
}

// Detecta qué tarjeta está más centrada en el viewport del carrusel
function updateCenteredCard() {
    if (!playlistContainer) return;
    const cards = playlistContainer.querySelectorAll('.session-card');
    if (!cards.length) return;

    const containerRect = playlistContainer.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;

    let closestCard = null;
    let minDistance = Infinity;

    cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const distance = Math.abs(cardCenter - containerCenter);
        if (distance < minDistance) {
            minDistance = distance;
            closestCard = card;
        }
    });

    cards.forEach((card) => card.classList.remove('centered'));
    if (closestCard) {
        closestCard.classList.add('centered');
    }
}

// Actualiza solo las clases active/playing y el footer de cada tarjeta (sin re-render). Así la transición CSS al clicar es suave.
function updateSessionCardsState(shouldScroll = true) {
    if (!playlistContainer) return;
    const cards = playlistContainer.querySelectorAll('.session-card');
    if (!cards.length) return;

    const isPlaying = mainAudio && !mainAudio.paused;

    cards.forEach((card) => {
        const index = parseInt(card.getAttribute('data-index'), 10);
        if (isNaN(index)) return;
        const isActive = index === currentTrackIndex;
        const track = tracks[index];
        if (!track) return;

        card.className = `session-card ${isActive ? 'active' : ''} ${isActive && isPlaying ? 'playing' : ''}`.trim();
        card.setAttribute('aria-current', isActive ? 'true' : 'false');

        // Vinilo: girar cuando está activa y reproduciendo
        const spinEl = card.querySelector('.spin-vinyl, .card-vinyl-container > div');
        if (spinEl) {
            spinEl.className = isActive && isPlaying
                ? 'w-full h-full flex items-center justify-center spin-vinyl'
                : 'w-full h-full flex items-center justify-center spin-vinyl spin-paused';
        }

        const footer = card.querySelector('.session-card-footer');
        if (footer) {
            const moodLabel = ((isEnglishPage() && track.mood_en ? track.mood_en[0] : track.mood[0]) || 'Deep').split(' · ')[0].trim();
            const moodRaw = (isEnglishPage() && track.mood_en ? track.mood_en[0] : track.mood[0]) || '';
            const rawDuration = track.duration || (moodRaw.includes(' · ') ? moodRaw.split(' · ').pop().trim() : '');
            const durationLabel = formatDurationWithSeconds(rawDuration);
            const durationHtml = durationLabel ? `<span class="text-white/50 text-[10px] font-mono tracking-wider">${durationLabel}</span>` : '';
            const maxDots = 5;
            const e = Math.min(Number(track.energy) || 0, maxDots);
            const energyLabel = isEnglishPage() ? 'Energy' : 'Energía';
            const energyHtml = `<span class="energy-dots text-white/50 text-[10px] uppercase tracking-wider" aria-label="${energyLabel}: ${e}"><span class="energy-dots-label">${energyLabel}:</span> <span class="energy-dots-circles" aria-hidden="true">${'●'.repeat(e)}</span></span>`;
            const buttonHtml = isActive
                ? `<div class="session-card-listen-btn group flex items-center gap-3 px-4 py-2 mt-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 hover:bg-white/15 hover:border-white/25 hover:scale-[1.02] shadow-[0_6px_16px_rgba(0,0,0,0.25)] transition-all duration-300 pointer-events-auto cursor-pointer">
                    <i data-lucide="${isPlaying ? 'pause' : 'play'}" class="w-4 h-4 text-white fill-current session-card-listen-btn-icon"></i>
                    <span class="session-card-listen-btn-text text-[11px] uppercase tracking-[0.2em] text-white font-semibold">
                        ${isPlaying ? (isEnglishPage() ? 'Pause' : 'Pausar') : (isEnglishPage() ? 'Listen' : 'Escuchar')}
                    </span>
                   </div>`
                : `<div class="h-[50px] flex items-center justify-center">
                    <span class="text-white/40 text-[9px] uppercase tracking-widest">
                        ${isEnglishPage() ? 'Tap to select' : 'Tocar para elegir'}
                    </span>
                   </div>`;
            footer.innerHTML = `
                <div class="flex flex-col items-center gap-1">
                    <div class="tag-pill">${moodLabel}</div>
                    ${durationHtml}
                    ${energyHtml}
                </div>
                ${buttonHtml}
            `;
        }
    });

    updateCenteredCard();
    if (shouldScroll) {
        setTimeout(() => scrollToCenter(currentTrackIndex), 50);
    }
    if (window.lucide) lucide.createIcons();
    updateSessionsListState();
}

    // Normaliza duraciones para evitar formatos técnicos tipo 44:00:00.
    function formatDurationWithSeconds(str) {
        if (!str || typeof str !== 'string') return str;
        const trimmed = str.trim();
        const parts = trimmed.split(':').map(part => part.trim()).filter(Boolean);
        if (parts.length === 0) return '';

        // Si llega como MM:SS:00 con "MM" irreal como hora (ej. 44:00:00), mostrar MM:SS.
        if (parts.length === 3) {
            const first = Number(parts[0]);
            const seconds = parts[2];
            if (!Number.isNaN(first) && first >= 24 && seconds === '00') {
                return `${parts[0]}:${parts[1].padStart(2, '0')}`;
            }
            return `${parts[0]}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
        }

        if (parts.length === 2) {
            return `${parts[0]}:${parts[1].padStart(2, '0')}`;
        }

        return trimmed;
    }

    // Palabras para recomendar: usa genre si existe, si no extrae del mood (sin duración). Todo en minúsculas.
    function getGenreOrMoodWords(track) {
        if (track.genre && Array.isArray(track.genre) && track.genre.length) {
            return track.genre.map(g => String(g).toLowerCase().trim()).filter(Boolean);
        }
        const raw = (track.mood && track.mood[0]) || (track.mood_en && track.mood_en[0]) || '';
        const label = raw.split(' · ')[0].trim();
        if (!label) return [];
        return label.split(/[\s&·]+/).map(w => w.toLowerCase().trim()).filter(Boolean);
    }

    // Recomendación por mood/género y energía: hasta 3 sesiones similares a lo que le gustó, que aún no haya likeado
    function getRecommendedTrackIndices() {
        const likedMap = getUserLikedTracksMap();
        const likedIndices = [];
        const moodWordsCount = {};
        let energySum = 0;
        let energyCount = 0;
        tracks.forEach((track, index) => {
            if (track.showInCards === false) return;
            const trackId = getTrackId(track);
            if (likedMap[trackId]) {
                likedIndices.push(index);
                getGenreOrMoodWords(track).forEach(w => {
                    moodWordsCount[w] = (moodWordsCount[w] || 0) + 1;
                });
                const e = Number(track.energy);
                if (!isNaN(e)) { energySum += e; energyCount++; }
            }
        });
        const avgEnergy = energyCount > 0 ? energySum / energyCount : 2;
        const preferredMoodWords = Object.keys(moodWordsCount);

        const candidates = [];
        tracks.forEach((track, index) => {
            if (track.showInCards === false) return;
            if (likedMap[getTrackId(track)]) return;
            const moodWords = getGenreOrMoodWords(track);
            let score = 0;
            moodWords.forEach(w => {
                if (preferredMoodWords.includes(w)) score += moodWordsCount[w] || 1;
            });
            const e = Number(track.energy);
            if (!isNaN(e)) {
                const diff = Math.abs(e - avgEnergy);
                if (diff === 0) score += 3;
                else if (diff === 1) score += 1;
            }
            candidates.push({ index, score });
        });

        if (candidates.length === 0) return [];
        candidates.sort((a, b) => b.score - a.score);
        const topScore = candidates[0].score;
        const topCandidates = candidates.filter(c => c.score === topScore);
        const pool = topScore > 0 ? topCandidates : candidates.slice(0, Math.min(5, candidates.length));
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, 3).map(c => c.index);
    }

    // 3.1b RENDERIZAR LISTA DE TODAS LAS SESIONES (click para reproducir)
    function renderSessionsList() {
        if (!sessionsListEl) return;
        sessionsListEl.innerHTML = '';
        tracks.forEach((track, index) => {
            const moodRaw = (isEnglishPage() && track.mood_en ? track.mood_en[0] : track.mood[0]) || '';
            const rawDuration = track.duration || (moodRaw.includes(' · ') ? moodRaw.split(' · ').pop().trim() : '');
            const durationLabel = formatDurationWithSeconds(rawDuration);
            const dateLabel = formatSessionDate(track.date || (track.year != null ? String(track.year) : ''));
            const item = document.createElement('div');
            item.className = 'sessions-list-item';
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.setAttribute('data-index', String(index));
            item.setAttribute('aria-label', `${t(track, 'title')} · ${t(track, 'artist')}`);
            item.innerHTML = `
                <div class="sessions-list-item-thumb" aria-hidden="true">
                    <img src="${track.cover || track.bgImage}" alt="" loading="lazy" decoding="async" />
                </div>
                <div class="sessions-list-item-text">
                    <div class="sessions-list-item-title">${t(track, 'title')}</div>
                    <div class="sessions-list-item-artist">${t(track, 'artist')}${dateLabel ? ` · ${dateLabel}` : ''}</div>
                </div>
                ${durationLabel ? `<span class="sessions-list-item-duration">${durationLabel}</span>` : ''}
                ${track.link ? `<a href="${track.link}" target="_blank" rel="noopener noreferrer" class="sessions-list-item-link" aria-label="${isEnglishPage() ? 'Open in new tab' : 'Abrir en nueva pestaña'}" onclick="event.stopPropagation()"><svg class="sessions-list-item-link-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ''}
                <div class="sessions-list-item-play" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
            `;
            function handleListAction(e) {
                if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
                if (e.type === 'keydown') e.preventDefault();
                if (index === currentTrackIndex) {
                    if (mainAudio.paused) mainAudio.play();
                    else mainAudio.pause();
                    updateSessionCardsState(false);
                    updateSessionsListState();
                } else {
                    loadTrack(index, true);
                }
            }
            item.addEventListener('click', handleListAction);
            item.addEventListener('keydown', handleListAction);
            sessionsListEl.appendChild(item);
        });

        // Bloque "Para ti": solo visible cuando el usuario ha dado al menos un like
        const listWrap = sessionsListEl.parentElement;
        const existingParaTi = listWrap && listWrap.querySelector('.para-ti-wrap');
        if (existingParaTi) existingParaTi.remove();
        if (hasAnyLikes() && listWrap) {
            const recIndices = getRecommendedTrackIndices();
            if (recIndices.length) {
                const wrap = document.createElement('div');
                wrap.className = 'para-ti-wrap';
                wrap.setAttribute('aria-label', isEnglishPage() ? 'Recommended for you' : 'Para ti');
                const title = isEnglishPage()
                    ? 'Recommended for you'
                    : 'Recomendado para ti';
                wrap.innerHTML = `
                    <p class="para-ti-title">${title}</p>
                    <div class="para-ti-list"></div>
                `;
                const paraTiList = wrap.querySelector('.para-ti-list');
                recIndices.forEach((recIndex) => {
                    const track = tracks[recIndex];
                    if (!track) return;
                    const moodRaw = (isEnglishPage() && track.mood_en ? track.mood_en[0] : track.mood[0]) || '';
                    const rawDuration = track.duration || (moodRaw.includes(' · ') ? moodRaw.split(' · ').pop().trim() : '');
                    const durationLabel = formatDurationWithSeconds(rawDuration);
                    const dateLabel = formatSessionDate(track.date || (track.year != null ? String(track.year) : ''));
                    const item = document.createElement('div');
                    item.className = 'sessions-list-item para-ti-item';
                    item.setAttribute('role', 'button');
                    item.setAttribute('tabindex', '0');
                    item.setAttribute('data-index', String(recIndex));
                    item.setAttribute('aria-label', `${t(track, 'title')} · ${t(track, 'artist')}`);
                    item.innerHTML = `
                        <div class="sessions-list-item-thumb" aria-hidden="true">
                            <img src="${track.cover || track.bgImage}" alt="" loading="lazy" decoding="async" />
                        </div>
                        <div class="sessions-list-item-text">
                            <div class="sessions-list-item-title">${t(track, 'title')}</div>
                            <div class="sessions-list-item-artist">${t(track, 'artist')}${dateLabel ? ` · ${dateLabel}` : ''}</div>
                        </div>
                        ${durationLabel ? `<span class="sessions-list-item-duration">${durationLabel}</span>` : ''}
                        ${track.link ? `<a href="${track.link}" target="_blank" rel="noopener noreferrer" class="sessions-list-item-link" aria-label="${isEnglishPage() ? 'Open in new tab' : 'Abrir en nueva pestaña'}" onclick="event.stopPropagation()"><svg class="sessions-list-item-link-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ''}
                        <div class="sessions-list-item-play" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                    `;
                    function handleParaTiAction(e) {
                        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
                        if (e.type === 'keydown') e.preventDefault();
                        if (recIndex === currentTrackIndex) {
                            if (mainAudio.paused) mainAudio.play();
                            else mainAudio.pause();
                            updateSessionCardsState(false);
                            updateSessionsListState();
                        } else {
                            loadTrack(recIndex, true);
                        }
                    }
                    item.addEventListener('click', handleParaTiAction);
                    item.addEventListener('keydown', handleParaTiAction);
                    paraTiList.appendChild(item);
                });
                listWrap.appendChild(wrap);
            }
        }

        updateSessionsListState();
    }

    // Mostrar "Para ti" cuando el usuario da su primer like
    window.addEventListener('aether:like-added', function onLikeAdded() {
        if (typeof renderSessionsList === 'function') renderSessionsList();
    });

    function updateSessionsListState() {
        const isPlaying = mainAudio && !mainAudio.paused;
        const updateItems = (container) => {
            if (!container) return;
            const items = container.querySelectorAll('.sessions-list-item');
            items.forEach((item) => {
                const index = parseInt(item.getAttribute('data-index'), 10);
                if (isNaN(index)) return;
                const isActive = index === currentTrackIndex;
                item.classList.toggle('active', isActive);
                item.classList.toggle('playing', isActive && isPlaying);
                const playWrap = item.querySelector('.sessions-list-item-play');
                if (playWrap) {
                    if (isActive && isPlaying) {
                        playWrap.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
                    } else {
                        playWrap.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
                    }
                }
            });
        };
        if (sessionsListEl) updateItems(sessionsListEl);
        const paraTiList = document.querySelector('.para-ti-wrap .para-ti-list');
        if (paraTiList) updateItems(paraTiList);
    }

  // 3.2 CARGAR PISTA (Función Clave)
    function loadTrack(index, autoPlay = false) {
        currentTrackIndex = index;
        const track = tracks[index];

        // Asegurarse de que el player inferior sea visible y el body tenga padding
        if (bottomPlayer) {
            bottomPlayer.classList.remove('has-player-hidden', 'has-hero-visible'); 
            bottomPlayer.classList.remove('translate-y-[120%]'); 
            document.body.classList.add('has-player');
        }

        // Reset UI
        if (progressBar) progressBar.style.width = '0%';
        if (currentTimeEl) currentTimeEl.textContent = "00:00";
        
        // Cargar Audio
        if (mainAudio) {
            mainAudio.src = track.src;
            mainAudio.load();
        }

        // Actualizar textos e imagen
        if (trackTitle) trackTitle.textContent = t(track, 'title');
        if (trackArtist) trackArtist.textContent = t(track, 'artist');
        if (playerImg) {
            playerImg.style.opacity = 0;
            setTimeout(() => { 
                playerImg.src = track.cover; 
                playerImg.style.opacity = 0.8; 
            }, 200);
        }

        // --- INICIO CÓDIGO NUEVO (PANTALLA DE BLOQUEO) ---
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: t(track, 'title'),
                artist: t(track, 'artist'),
                album: 'Aether Sessions',
                artwork: [
                    { src: track.cover, sizes: '96x96', type: 'image/webp' },
                    { src: track.cover, sizes: '128x128', type: 'image/webp' },
                    { src: track.cover, sizes: '192x192', type: 'image/webp' },
                    { src: track.cover, sizes: '256x256', type: 'image/webp' },
                    { src: track.cover, sizes: '384x384', type: 'image/webp' },
                    { src: track.cover, sizes: '512x512', type: 'image/webp' },
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => {
                mainAudio.play();
                if (mainPlayBtn) mainPlayBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
                updateSessionCardsState(false);
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                mainAudio.pause();
                if (mainPlayBtn) mainPlayBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
                updateSessionCardsState(false);
            });

            navigator.mediaSession.setActionHandler('previoustrack', () => {
                let newIndex = currentTrackIndex - 1;
                if (newIndex < 0) newIndex = tracks.length - 1;
                loadTrack(newIndex, true);
            });

            navigator.mediaSession.setActionHandler('nexttrack', () => {
                let newIndex = currentTrackIndex + 1;
                if (newIndex >= tracks.length) newIndex = 0;
                loadTrack(newIndex, true);
            });

             // PERMITIR ADELANTAR DESDE PANTALLA BLOQUEO
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime || details.seekTime === 0) {
                    mainAudio.currentTime = details.seekTime;
                }
            });

        }
        // --- FIN CÓDIGO NUEVO ---

        updateSessionCardsState(true); // Solo actualizar clases (transición suave al clicar)
        prefetchNextTrack(index); // Precargar la siguiente pista

        // Autoplay logic
        if (autoPlay && mainAudio) {
            mainAudio.play().then(() => {
                if (mainPlayBtn) mainPlayBtn.innerHTML = '<i data-lucide="pause" class="w-6 h-6 fill-current"></i>';
                if(window.lucide) lucide.createIcons();
            }).catch(e => console.error("Error al reproducir automáticamente:", e));
        } else if (mainPlayBtn) {
            mainPlayBtn.innerHTML = '<i data-lucide="play" class="w-6 h-6 fill-current ml-0.5"></i>';
            if(window.lucide) lucide.createIcons();
        }
    }

    // Event Listeners del Audio
  if (mainAudio) {

    // ▶️ ⏸ Play / Pause
    if (mainPlayBtn) {
        mainPlayBtn.addEventListener('click', () => {
            if (mainAudio.paused) {
                mainAudio.play().then(() => {
                    mainPlayBtn.innerHTML =
                        '<i data-lucide="pause" class="w-6 h-6 fill-current"></i>';
                    if (window.lucide) lucide.createIcons();
                    updateSessionCardsState(false);
                }).catch(e => console.error("Error al reproducir:", e));
            } else {
                mainAudio.pause();
                mainPlayBtn.innerHTML =
                    '<i data-lucide="play" class="w-6 h-6 fill-current ml-0.5"></i>';
                if (window.lucide) lucide.createIcons();
                updateSessionCardsState(false);
            }
        });
    }

    // ⏮️ Track anterior
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            let newIndex = currentTrackIndex - 1;
            if (newIndex < 0) newIndex = tracks.length - 1;
            loadTrack(newIndex, !mainAudio.paused);
        });
    }

    // ⏭️ Track siguiente
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            let newIndex = currentTrackIndex + 1;
            if (newIndex >= tracks.length) newIndex = 0;
            loadTrack(newIndex, !mainAudio.paused);
        });
    }

    // ⏱️ Progreso del audio
// ⏱️ Progreso del audio (ACTUALIZADO CON PANTALLA BLOQUEO)
    mainAudio.addEventListener('timeupdate', () => {
        // 1. Validaciones de seguridad
        if (!mainAudio.duration || isNaN(mainAudio.duration)) return;

        // 2. Actualizar barra de la web
        const percent = (mainAudio.currentTime / mainAudio.duration) * 100;
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (currentTimeEl) currentTimeEl.textContent = formatTime(mainAudio.currentTime);
        if (totalTimeEl) totalTimeEl.textContent = formatTime(mainAudio.duration);
        if (progressContainer) {
            progressContainer.setAttribute('aria-valuenow', Math.round(percent));
            progressContainer.setAttribute('aria-valuetext', formatTime(mainAudio.currentTime) + ' de ' + formatTime(mainAudio.duration));
        }

        // 3. ACTUALIZAR PANTALLA DE BLOQUEO DEL MÓVIL
        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: mainAudio.duration,
                    playbackRate: mainAudio.playbackRate,
                    position: mainAudio.currentTime
                });
            } catch (error) {
                // A veces falla si la duración no ha cargado del todo, lo ignoramos
            }
        }
    });           

    // 🔁 Al terminar → siguiente track
    mainAudio.addEventListener('ended', () => {
        let newIndex = currentTrackIndex + 1;
        if (newIndex >= tracks.length) newIndex = 0;
        loadTrack(newIndex, true);
    });

    // 🎧 Click y arrastre en barra de progreso (cálculo correcto con clientX/rect)
    function seekFromPosition(clientX) {
        if (!progressContainer || !mainAudio.duration || isNaN(mainAudio.duration)) return;
        const rect = progressContainer.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const pct = x / rect.width;
        mainAudio.currentTime = pct * mainAudio.duration;
    }
    if (progressContainer) {
        progressContainer.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            seekFromPosition(e.clientX);
        });
        // Arrastrar para buscar
        let isDragging = false;
        const onMove = (e) => {
            if (!isDragging) return;
            seekFromPosition(e.touches ? e.touches[0].clientX : e.clientX);
        };
        const onEnd = () => { isDragging = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onEnd); document.removeEventListener('touchmove', onMove, { passive: true }); document.removeEventListener('touchend', onEnd); };
        progressContainer.addEventListener('mousedown', (e) => { if (e.button !== 0) return; e.preventDefault(); isDragging = true; seekFromPosition(e.clientX); document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onEnd); });
        progressContainer.addEventListener('touchstart', (e) => { isDragging = true; seekFromPosition(e.touches[0].clientX); document.addEventListener('touchmove', onMove, { passive: true }); document.addEventListener('touchend', onEnd, { once: true }); }, { passive: true });
    }

// 🔄 SINCRONIZACIÓN TOTAL (Tarjetas + Footer)
    function syncGlobalPlayer() {
        // 1. Actualizar las tarjetas sin mover el scroll (transición suave)
        updateSessionCardsState(false);

        // 2. Actualizar el icono del Footer (Bottom Player)
        if (mainPlayBtn) {
            if (mainAudio.paused) {
                // Si está pausado -> Mostrar icono PLAY
                mainPlayBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
            } else {
                // Si está sonando -> Mostrar icono PAUSE
                mainPlayBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
            }
        }
    }

    // Escuchamos los eventos REALES del audio. 
    // Así funciona siempre, toques donde toques.
    mainAudio.addEventListener('play', () => {
        syncGlobalPlayer();
    });
    mainAudio.addEventListener('pause', () => {
        syncGlobalPlayer();
    });
}



    function formatTime(s) {
        if (isNaN(s)) return "00:00";
        const min = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

const listenNowBtn = document.getElementById('listen-now-btn');

if (listenNowBtn) {
    listenNowBtn.addEventListener('click', (e) => {
        e.preventDefault();

        // No hacer scroll: revelar reproductor en hero y reproducir
        document.body.classList.add('player-revealed-by-listen');
        document.body.classList.remove('has-hero-visible');
        document.body.classList.add('has-player');
        loadTrack(0, true);
        // Abrir panel de sesiones (Antología sonora) con la reproducción
        requestAnimationFrame(() => {
            if (typeof window.openPlayerOverlay === 'function') window.openPlayerOverlay();
        });
    });
}




    

    // Botón "Volver Arriba" (btnSubir): solo visible cuando el footer está en vista
    const btnSubir = document.getElementById('btnSubir');
    const footerForSubir = document.getElementById('contact');
    if (btnSubir && footerForSubir) {
        const subirObserver = new IntersectionObserver(
            ([entry]) => {
                const inFooter = entry.isIntersecting;
                btnSubir.classList.toggle('show', inFooter);
                document.body.classList.toggle('has-subir', inFooter);
            },
            { threshold: 0.1, rootMargin: '0px' }
        );
        subirObserver.observe(footerForSubir);
        btnSubir.addEventListener('click', () => {
            const header = document.getElementById('home');
            if (header) header.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Scroll Spy (Menú activo al hacer scroll)
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('#navbar a[href^="#"]');
    const spyObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                navLinks.forEach(link => {
                    link.classList.remove('text-white');
                    if (link.getAttribute('href') === `#${entry.target.id}`) {
                        link.classList.add('text-white');
                    }
                });
            }
        });
    }, { threshold: 0.6 }); // Activar cuando el 60% de la sección es visible
    sections.forEach(section => spyObserver.observe(section));

    // Section index: scroll-based spy + click to scroll (mismo offset que nav)
    const sectionIndex = document.getElementById('section-index');
    const sectionIndexItems = document.querySelectorAll('.section-index__item');
    const indexSectionIds = ['home', 'about', 'music', 'shorts-teaser', 'gigs', 'records', 'contact'];

    if (sectionIndex && sectionIndexItems.length) {
        const navbar = document.getElementById('navbar');
        const navHeight = navbar ? navbar.offsetHeight : 0;
        const scrollTriggerOffset = Math.min(120, window.innerHeight * 0.25);

        function getActiveSectionId() {
            const scrollY = getScrollY();
            const trigger = scrollY + scrollTriggerOffset;
            let activeId = indexSectionIds[0];
            for (const id of indexSectionIds) {
                const el = document.getElementById(id);
                if (!el) continue;
                const top = el.getBoundingClientRect().top + scrollY;
                if (top <= trigger) activeId = id;
            }
            return activeId;
        }

        function updateSectionIndexActive(activeIdOverride) {
            const activeId = activeIdOverride != null ? activeIdOverride : getActiveSectionId();
            sectionIndexItems.forEach((item) => {
                const dot = item.querySelector('.section-index__dot');
                const isActive = item.dataset.section === activeId;
                if (dot) dot.classList.toggle('is-active', isActive);
                item.setAttribute('aria-current', isActive ? 'true' : 'false');
            });
        }

        let ignoreScrollSpyUntil = 0;
        window.__scrollTickCallbacks.push(function () {
            if (Date.now() >= ignoreScrollSpyUntil) updateSectionIndexActive();
        });
        window.addEventListener('resize', updateSectionIndexActive);
        updateSectionIndexActive();

        function scrollToSection(id) {
            const el = document.getElementById(id);
            if (!el) return;
            updateSectionIndexActive(id);
            ignoreScrollSpyUntil = Date.now() + 1100;
            if (id === 'shorts-teaser') {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                const scrollY = getScrollY();
                const indexH = sectionIndex.offsetHeight || 0;
                const offset = navHeight + indexH + 16;
                const y = el.getBoundingClientRect().top + scrollY - offset;
                window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
            }
        }

        sectionIndexItems.forEach((item) => {
            const href = item.getAttribute('href') || '';
            const isShortsPage = href === 'shorts.html' || href.endsWith('shorts.html');
            const isRecords = item.dataset.section === 'records';
            const isMusic = item.dataset.section === 'music';
            const isContact = item.dataset.section === 'contact';
            const isAbout = item.dataset.section === 'about';
            item.addEventListener('click', (e) => {
                if (isShortsPage) return; /* navega a shorts.html */
                e.preventDefault();
                if (isRecords && typeof window.openRecordsOverlay === 'function') {
                    window.openRecordsOverlay();
                } else if (isMusic && typeof window.openPlayerOverlay === 'function') {
                    window.openPlayerOverlay();
                } else if (isContact && typeof window.openContactOverlay === 'function') {
                    window.openContactOverlay();
                } else if (isAbout && typeof window.openAboutOverlay === 'function') {
                    window.openAboutOverlay();
                } else {
                    scrollToSection(item.dataset.section);
                }
            });
            item.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                if (isShortsPage) return; /* navega a shorts.html */
                e.preventDefault();
                if (isRecords && typeof window.openRecordsOverlay === 'function') {
                    window.openRecordsOverlay();
                } else if (isMusic && typeof window.openPlayerOverlay === 'function') {
                    window.openPlayerOverlay();
                } else if (isContact && typeof window.openContactOverlay === 'function') {
                    window.openContactOverlay();
                } else if (isAbout && typeof window.openAboutOverlay === 'function') {
                    window.openAboutOverlay();
                } else {
                    scrollToSection(item.dataset.section);
                }
            });
        });
    }

    // Lógica de visibilidad del reproductor: escondido en header, visible al scroll, latente en contacto

    const heroSection = document.getElementById('home');
    const footer = document.getElementById('contact');

    // A. Header (hero): player escondido cuando el hero ocupa la vista (como en footer); al hacer scroll aparece
    function syncHeroVisible() {
        if (!heroSection) return;
        const rect = heroSection.getBoundingClientRect();
        const inHero = rect.bottom > window.innerHeight * 0.68;
        document.body.classList.toggle('has-hero-visible', inHero);
        if (inHero) document.body.classList.add('has-player');
        else if (!document.body.classList.contains('has-footer-visible')) document.body.classList.add('has-player');
    }
    if (heroSection && bottomPlayer) {
        const heroObserver = new IntersectionObserver(
            ([entry]) => {
                const inHero = entry.isIntersecting;
                document.body.classList.toggle('has-hero-visible', inHero);
                if (inHero) document.body.classList.add('has-player');
                else if (!document.body.classList.contains('has-footer-visible')) document.body.classList.add('has-player');
            },
            { threshold: 0.68, rootMargin: '0px' }
        );
        heroObserver.observe(heroSection);
        // Estado inicial y tras ritual/animaciones (varios momentos por si el ritual tarda)
        [100, 400, 800, 2500].forEach(delay => setTimeout(syncHeroVisible, delay));
        // Sincronizar también al hacer scroll (por si el observer no dispara)
        window.addEventListener('scroll', () => requestAnimationFrame(syncHeroVisible), { passive: true });
    }

    // B. Contacto (footer): player casi invisible; al salir con scroll aparece
    // rootMargin ignora la parte baja del viewport (donde están los botones) para evitar
    // que el hover provoque micro-cambios de intersección y el salto del reproductor
    if (footer && bottomPlayer) {
        let footerDebounce = null;
        const footerObserver = new IntersectionObserver(
            ([entry]) => {
                const inFooter = entry.isIntersecting;
                if (footerDebounce) clearTimeout(footerDebounce);
                footerDebounce = setTimeout(() => {
                    document.body.classList.toggle('has-footer-visible', inFooter);
                    if (inFooter) {
                        document.body.classList.remove('has-player');
                    } else {
                        document.body.classList.add('has-player');
                    }
                }, 80);
            },
            { threshold: 0, rootMargin: '0px 0px -120px 0px' }
        );
        footerObserver.observe(footer);
    }

    // C. Efecto "despertar" del reproductor (al pasar el ratón/tocar). No despertar en contacto para evitar salto.
    if (bottomPlayer) {
        let awakeTimeout = null;
        const wakePlayer = () => {
            if (document.body.classList.contains('has-footer-visible')) return; // evita salto al hover en botones contacto
            bottomPlayer.classList.add('player-awake');
            if (awakeTimeout) clearTimeout(awakeTimeout);
            awakeTimeout = setTimeout(() => bottomPlayer.classList.remove('player-awake'), 2500);
        };
        bottomPlayer.addEventListener('mouseenter', wakePlayer);
        bottomPlayer.addEventListener('mouseleave', () => bottomPlayer.classList.remove('player-awake'));
        bottomPlayer.addEventListener('touchstart', wakePlayer, { passive: true });
    }

    // Año Footer
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Prevent default anchor jumps (ya incluido)
    document.querySelectorAll('a[href="#"]').forEach(a => a.addEventListener('click', e => e.preventDefault()));

    // ==========================================
    // INIT: Construir tarjetas, lista de sesiones y cargar primera pista
    // ==========================================
    renderPlaylist(false); // Crear el DOM de las tarjetas (solo una vez)
    renderSessionsList();  // Lista de todas las sesiones (click para reproducir)
    loadTrack(0, false);   // Cargar primera pista y actualizar estado (transición suave)

    // ==========================================
    // LIQUID MOTION CAROUSEL - iOS-style physics
    // ==========================================
    class LiquidCarousel {
        constructor(container) {
            this.container = container;
            this.cards = [];
            this.isDragging = false;
            this.startX = 0;
            this.currentX = 0;
            this.scrollLeft = 0;
            this.velocity = 0;
            this.lastX = 0;
            this.lastTime = 0;
            this.animationId = null;
            this.targetScroll = 0;
            this.currentScroll = 0;
            this.lastCenterCheck = 0; // Для периодической проверки центрирования
            
            // Spring physics - suave y que centre bien al soltar (sin pasar de largo)
            this.springConfig = {
                tension: 390,      // Más suave
                friction: 36,      // Menos seco al asentarse
                mass: 1
            };
            
            // Stretch effect parameters - улучшенные для более плавного эффекта
            this.stretchConfig = {
                maxStretch: 0.075, // Más elegante, menos agresivo
                resistance: 0.16   // Arrastre más fluido en bordes
            };
            
            this.init();
        }
        
        init() {
            if (!this.container) return;
            
            this.cards = Array.from(this.container.querySelectorAll('.session-card'));
            if (this.cards.length === 0) {
                // Retry after a short delay if cards aren't ready
                setTimeout(() => this.init(), 200);
                return;
            }
            
            this.currentScroll = this.container.scrollLeft;
            this.targetScroll = this.currentScroll;
            
            // Remove old event listeners if re-initializing
            this.cleanup();
            
            // Touch events
            this.touchStartHandler = this.handleStart.bind(this);
            this.touchMoveHandler = this.handleMove.bind(this);
            this.touchEndHandler = this.handleEnd.bind(this);
            
            this.container.addEventListener('touchstart', this.touchStartHandler, { passive: false });
            this.container.addEventListener('touchmove', this.touchMoveHandler, { passive: false });
            this.container.addEventListener('touchend', this.touchEndHandler, { passive: true });
            this.container.addEventListener('touchcancel', this.touchEndHandler, { passive: true });
            
            // Mouse events
            this.mouseDownHandler = this.handleStart.bind(this);
            this.mouseMoveHandler = this.handleMove.bind(this);
            this.mouseUpHandler = this.handleEnd.bind(this);
            this.mouseLeaveHandler = this.handleEnd.bind(this);
            
            this.container.addEventListener('mousedown', this.mouseDownHandler);
            document.addEventListener('mousemove', this.mouseMoveHandler);
            document.addEventListener('mouseup', this.mouseUpHandler);
            this.container.addEventListener('mouseleave', this.mouseLeaveHandler);
            
            // Wheel for desktop
            this.wheelHandler = this.handleWheel.bind(this);
            this.container.addEventListener('wheel', this.wheelHandler, { passive: false });
            
            // Keep scroll enabled but control it manually
            this.container.style.scrollBehavior = 'auto';
            this.container.style.cursor = 'grab';
            
            // Initial card transforms
            this.updateCardTransforms();
            
            // Start animation loop
            this.animate();
        }
        
        cleanup() {
            if (this.touchStartHandler) {
                this.container.removeEventListener('touchstart', this.touchStartHandler);
                this.container.removeEventListener('touchmove', this.touchMoveHandler);
                this.container.removeEventListener('touchend', this.touchEndHandler);
            }
            if (this.mouseDownHandler) {
                this.container.removeEventListener('mousedown', this.mouseDownHandler);
                document.removeEventListener('mousemove', this.mouseMoveHandler);
                document.removeEventListener('mouseup', this.mouseUpHandler);
                this.container.removeEventListener('mouseleave', this.mouseLeaveHandler);
            }
            if (this.wheelHandler) {
                this.container.removeEventListener('wheel', this.wheelHandler);
            }
        }
        
        handleStart(e) {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            this.isDragging = true;
            this.startX = clientX;
            this.scrollLeft = this.container.scrollLeft;
            this.velocity = 0;
            this.lastX = clientX;
            this.lastTime = Date.now();
            
            // Cancel any ongoing animation
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            
            this.container.style.cursor = 'grabbing';
            this.container.style.userSelect = 'none';
            
            if (!e.touches) {
                e.preventDefault();
            }
        }
        
        handleMove(e) {
            if (!this.isDragging) return;
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const now = Date.now();
            const deltaTime = Math.max(now - this.lastTime, 1);
            
            // Calculate velocity - учитываем направление scroll
            // Когда палец двигается вправо (deltaX > 0), scroll должен двигаться влево (velocity < 0)
            const deltaX = clientX - this.lastX;
            // Инвертируем для правильного направления scroll
            this.velocity = -deltaX / deltaTime; // pixels per ms (отрицательный = вправо, положительный = влево)
            
            // Calculate scroll delta
            const walk = this.startX - clientX; // Inverted for natural scroll direction
            
            // Calculate scroll with resistance at edges
            let newScroll = this.scrollLeft + walk;
            const maxScroll = Math.max(0, this.container.scrollWidth - this.container.clientWidth);
            
            // Edge resistance (stretch effect)
            if (newScroll < 0) {
                const overScroll = Math.abs(newScroll);
                const resistance = overScroll * this.stretchConfig.resistance;
                newScroll = -resistance;
            } else if (newScroll > maxScroll) {
                const overScroll = newScroll - maxScroll;
                const resistance = overScroll * this.stretchConfig.resistance;
                newScroll = maxScroll + resistance;
            }
            
            this.container.scrollLeft = newScroll;
            this.currentScroll = newScroll;
            this.targetScroll = newScroll;
            
            // Apply stretch effect to cards
            this.applyStretchEffect(newScroll, maxScroll);
            
            // Update 3D transforms
            this.updateCardTransforms();
            
            this.lastX = clientX;
            this.lastTime = now;
            
            if (!e.touches) {
                e.preventDefault();
            }
        }
        
        handleEnd(e) {
            if (!this.isDragging) return;
            
            this.isDragging = false;
            this.container.style.cursor = 'grab';
            this.container.style.userSelect = '';
            
            // Reset stretch
            this.cards.forEach(card => {
                card.style.setProperty('--stretch-x', '1');
                card.style.setProperty('--stretch-y', '1');
            });
            
            const maxScroll = Math.max(0, this.container.scrollWidth - this.container.clientWidth);
            const containerWidth = this.container.clientWidth;
            const currentScroll = this.container.scrollLeft;
            
            // Определяем текущую центральную карточку
            const currentIndex = this.getNearestCardIndex();
            const currentCard = this.cards[currentIndex];
            
            if (!currentCard) {
                this.targetScroll = currentScroll;
                this.springToTarget();
                return;
            }
            
            // Определяем направление движения
            // velocity инвертирован: swipe вправо (палец вправо) = отрицательный velocity
            // swipe влево (палец влево) = положительный velocity
            const absVelocity = Math.abs(this.velocity);
            const velocityThreshold = 0.06; // Снижен порог для более отзывчивого переключения
            const isFastSwipe = absVelocity > velocityThreshold;
            
            // Определяем направление с более точными порогами
            const swipeRight = this.velocity < -0.015; // Swipe вправо (отрицательный velocity)
            const swipeLeft = this.velocity > 0.015;   // Swipe влево (положительный velocity)
            
            // touchend/touchcancel: e.touches обычно пустой, поэтому берем changedTouches.
            const endClientX =
                (e && e.changedTouches && e.changedTouches[0] && typeof e.changedTouches[0].clientX === 'number')
                    ? e.changedTouches[0].clientX
                    : (e && e.touches && e.touches[0] && typeof e.touches[0].clientX === 'number')
                        ? e.touches[0].clientX
                        : (e && typeof e.clientX === 'number')
                            ? e.clientX
                            : this.lastX;
            const dragDistance = Math.abs(this.startX - endClientX);
            const minDragDistance = 30; // Минимальное расстояние для переключения
            
            let targetIndex = currentIndex;
            
            // Улучшенная логика переключения с учетом скорости и расстояния
            if (isFastSwipe || dragDistance > minDragDistance) {
                // Быстрый swipe или достаточное расстояние - принудительно переключаем
                if (swipeRight && currentIndex > 0) {
                    // Swipe вправо (палец вправо) - предыдущая карточка (index - 1)
                    targetIndex = currentIndex - 1;
                } else if (swipeLeft && currentIndex < this.cards.length - 1) {
                    // Swipe влево (палец влево) - следующая карточка (index + 1)
                    targetIndex = currentIndex + 1;
                }
            } else {
                // Медленное движение - используем улучшенный momentum для определения позиции
                const momentum = this.velocity * 35; // Увеличен multiplier для лучшего переключения
                let projectedScroll = currentScroll + momentum;
                projectedScroll = Math.max(0, Math.min(projectedScroll, maxScroll));
                
                // Находим ближайшую карточку к проектируемой позиции
                const scrollCenter = projectedScroll + containerWidth / 2;
                let minDist = Infinity;
                
                this.cards.forEach((card, index) => {
                    const cardLeft = card.offsetLeft;
                    const cardWidth = card.offsetWidth;
                    const cardCenter = cardLeft + cardWidth / 2;
                    const dist = Math.abs(cardCenter - scrollCenter);
                    if (dist < minDist) {
                        minDist = dist;
                        targetIndex = index;
                    }
                });
                
                // Дополнительная проверка: если momentum достаточен, переключаем
                const currentCardWidth = currentCard.offsetWidth;
                const cardGap = currentCardWidth + 20; // Примерный gap между карточками
                
                if (Math.abs(momentum) > cardGap * 0.35) {
                    // Инвертированная логика momentum для правильного направления
                    if (momentum < 0 && currentIndex > 0) {
                        // Momentum вправо (отрицательный) - предыдущая карточка (index - 1)
                        targetIndex = currentIndex - 1;
                    } else if (momentum > 0 && currentIndex < this.cards.length - 1) {
                        // Momentum влево (положительный) - следующая карточка (index + 1)
                        targetIndex = currentIndex + 1;
                    }
                }
            }
            
            // Получаем целевую карточку и центрируем
            const targetCard = this.cards[targetIndex];
            if (targetCard) {
                const cardWidth = targetCard.offsetWidth;
                const cardLeft = targetCard.offsetLeft;
                this.targetScroll = cardLeft - (containerWidth / 2) + (cardWidth / 2);
            } else {
                this.targetScroll = currentScroll;
            }
            
            // Clamp to bounds
            this.targetScroll = Math.max(0, Math.min(this.targetScroll, maxScroll));
            
            // Start spring animation
            this.springToTarget();
        }
        
        handleWheel(e) {
            if (window.innerWidth >= 1024 && e.deltaY !== 0) {
                e.preventDefault();
                const delta = e.deltaY * 0.5;
                this.targetScroll = this.container.scrollLeft + delta;
                const maxScroll = this.container.scrollWidth - this.container.clientWidth;
                this.targetScroll = Math.max(0, Math.min(this.targetScroll, maxScroll));
                this.springToTarget();
            }
        }
        
        springToTarget() {
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            
            let current = this.currentScroll;
            const target = this.targetScroll;
            
            // Limitar velocidad inicial al soltar: así el spring lleva la tarjeta al centro
            // sin pasar de largo. Si no limitamos, al soltar con swipe la inercia hacía
            // que costara centrarse.
            const rawVelocity = this.velocity * 1.7;
            const maxVelocity = 0.72; // Menos impulso al soltar
            let velocity = Math.max(-maxVelocity, Math.min(maxVelocity, rawVelocity));
            
            const tension = this.springConfig.tension;
            const friction = this.springConfig.friction;
            const mass = this.springConfig.mass;
            
            let lastTime = performance.now();
            let iterations = 0;
            const maxIterations = 800; // Aumentado para permitir animación más suave
            
            const animate = (currentTime) => {
                const dt = Math.min((currentTime - lastTime) / 1000, 0.016);
                lastTime = currentTime;
                iterations++;
                
                const distance = target - current;
                const force = distance * (tension / mass);
                const damping = velocity * (friction / mass);
                const acceleration = (force - damping) / mass;
                
                velocity += acceleration * dt;
                current += velocity * dt;
                
                this.container.scrollLeft = current;
                this.currentScroll = current;
                this.updateCardTransforms();
                if (typeof updateCenteredCard === 'function') {
                    updateCenteredCard();
                }
                
                // Condición de parada más suave - permite que llegue al centro naturalmente
                const nearTarget = Math.abs(distance) < 0.5;
                const settled = Math.abs(velocity) < 0.01;
                const done = nearTarget && settled;
                
                if (!done && iterations < maxIterations) {
                    this.animationId = requestAnimationFrame(animate);
                } else {
                    // Snap suave al objetivo exacto
                    this.container.scrollLeft = target;
                    this.currentScroll = target;
                    this.targetScroll = target;
                    this.updateCardTransforms();
                    if (typeof updateCenteredCard === 'function') {
                        updateCenteredCard();
                    }
                    this.animationId = null;
                    this.velocity = 0;
                    
                    // Verificar centrado con pequeña animación suave si es necesario
                    requestAnimationFrame(() => {
                        this.ensureCenteredSmooth();
                    });
                    
                    if (typeof updateCenteredCard === 'function') updateCenteredCard();
                }
            };
            
            lastTime = performance.now();
            this.animationId = requestAnimationFrame(animate);
        }
        
        applyStretchEffect(scroll, maxScroll) {
            const stretchAmount = this.stretchConfig.maxStretch;
            const edgeThreshold = 84; // Entrada/salida más gradual del stretch
            
            this.cards.forEach((card, index) => {
                const cardRect = card.getBoundingClientRect();
                const containerRect = this.container.getBoundingClientRect();
                const cardCenter = cardRect.left + cardRect.width / 2 - containerRect.left;
                const containerCenter = containerRect.width / 2;
                const distance = cardCenter - containerCenter;
                
                // Stretch effect when dragging near edges - улучшенная формула
                let targetScaleX = 1;
                let targetScaleY = 1;
                
                if (scroll < edgeThreshold) {
                    // Left edge - stretch first card с плавной кривой
                    if (index === 0) {
                        const progress = (edgeThreshold - scroll) / edgeThreshold;
                        const smooth = progress * progress * (3 - 2 * progress); // smoothstep
                        const stretch = smooth * stretchAmount;
                        targetScaleX = 1 + stretch;
                        targetScaleY = 1 - stretch * 0.18;
                    }
                } else if (scroll > maxScroll - edgeThreshold) {
                    // Right edge - stretch last card с плавной кривой
                    if (index === this.cards.length - 1) {
                        const progress = (scroll - (maxScroll - edgeThreshold)) / edgeThreshold;
                        const smooth = progress * progress * (3 - 2 * progress); // smoothstep
                        const stretch = smooth * stretchAmount;
                        targetScaleX = 1 + stretch;
                        targetScaleY = 1 - stretch * 0.18;
                    }
                }
                
                // Suavizar cambio de stretch para evitar "tirón" al entrar/salir del borde.
                const currentScaleX = parseFloat(card.style.getPropertyValue('--stretch-x')) || 1;
                const currentScaleY = parseFloat(card.style.getPropertyValue('--stretch-y')) || 1;
                const blend = 0.22;
                const nextScaleX = currentScaleX + (targetScaleX - currentScaleX) * blend;
                const nextScaleY = currentScaleY + (targetScaleY - currentScaleY) * blend;

                card.style.setProperty('--stretch-x', String(nextScaleX));
                card.style.setProperty('--stretch-y', String(nextScaleY));
            });
        }
        
        updateCardTransforms() {
            if (this.cards.length === 0 && this.container) {
                const found = this.container.querySelectorAll('.session-card');
                if (found.length > 0) this.cards = Array.from(found);
            }
            if (this.cards.length === 0) return;
            
            const containerWidth = this.container.clientWidth;
            const scrollLeft = this.container.scrollLeft;
            const containerCenter = scrollLeft + containerWidth / 2;
            
            this.cards.forEach((card) => {
                const cardLeft = card.offsetLeft;
                const cardWidth = card.offsetWidth;
                const cardCenter = cardLeft + cardWidth / 2;
                const distance = cardCenter - containerCenter;
                
                // Normalize distance (0 = centered, 1 = at edge) - улучшенная формула
                const maxDistance = containerWidth / 2 + cardWidth;
                const normalizedDistance = Math.min(Math.abs(distance) / maxDistance, 1);
                
                // Плавная кривая для более естественного эффекта (ease-out cubic)
                const easeOutCubic = 1 - Math.pow(1 - normalizedDistance, 3);
                
                // 3D depth effect - rotateY for perspective (более плавный и выразительный)
                const rotateY = (distance / maxDistance) * 22 * easeOutCubic; // Увеличено до 22 degrees для большего эффекта
                
                // Scale effect - centered card is larger (более выраженный эффект)
                const baseScale = 0.82; // Еще больше уменьшен базовый scale для большего контраста
                const centeredScale = 1.0;
                const scale = baseScale + (centeredScale - baseScale) * (1 - easeOutCubic);
                
                // Opacity fade for side cards (более плавный и выразительный переход)
                const baseOpacity = 0.7; // Более выраженное затухание для лучшего фокуса
                const centeredOpacity = 1.0;
                const opacity = baseOpacity + (centeredOpacity - baseOpacity) * (1 - easeOutCubic);
                
                // Check if card is centered (within threshold)
                const isCentered = Math.abs(distance) < cardWidth / 2.5;
                
                // Apply stretch effect if dragging
                const stretchX = parseFloat(card.style.getPropertyValue('--stretch-x')) || 1;
                const stretchY = parseFloat(card.style.getPropertyValue('--stretch-y')) || 1;
                
                // Final scale with stretch
                // Mantener escala uniforme evita deformar elementos circulares (vinilo).
                const uniformStretch = (stretchX + stretchY) / 2;
                const finalScale = scale * uniformStretch;
                const finalScaleY = finalScale;
                
                // Z-index для правильного наложения
                const zIndex = isCentered ? 10 : Math.floor(5 - normalizedDistance * 5);
                
                // Apply transforms with 3D perspective - улучшенные значения
                card.style.transform = `
                    perspective(1200px) 
                    rotateY(${rotateY}deg) 
                    scale(${finalScale}, ${finalScaleY})
                    translateZ(${isCentered ? 25 : -8}px)
                `;
                const cardOpacity = Math.max(opacity, 0.7);
                card.style.zIndex = zIndex;
                const likeBtn = card.querySelector('.like-btn');
                // Móvil y desktop: opacidad en fondo y contenido, no en la tarjeta; botón like siempre misma opacidad (activa o no).
                card.style.opacity = '';
                const opacityTransition = 'opacity 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
                const likeOpacity = window.innerWidth <= 768 ? '0.42' : '0.5';
                for (let i = 0; i < card.children.length; i++) {
                    const child = card.children[i];
                    if (child.classList && child.classList.contains('like-btn')) {
                        child.style.opacity = likeOpacity;
                        child.style.transition = opacityTransition;
                    } else {
                        child.style.opacity = String(cardOpacity);
                        child.style.transition = opacityTransition;
                    }
                }
                
                // Transiciones suaves (la opacidad está en los hijos)
                if (!this.isDragging && !this.animationId) {
                    card.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
                } else {
                    card.style.transition = 'none';
                }
            });
        }
        
        getNearestCardIndex() {
            const containerWidth = this.container.clientWidth;
            const scrollLeft = this.container.scrollLeft;
            const containerCenter = scrollLeft + containerWidth / 2;
            
            let nearestIndex = 0;
            let minDistance = Infinity;
            
            this.cards.forEach((card, index) => {
                const cardLeft = card.offsetLeft;
                const cardWidth = card.offsetWidth;
                const cardCenter = cardLeft + cardWidth / 2;
                const distance = Math.abs(cardCenter - containerCenter);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestIndex = index;
                }
            });
            
            return nearestIndex;
        }
        
        animate() {
            if (!this.isDragging && !this.animationId) {
                this.updateCardTransforms();
                
                // Verificación periódica del efecto imán (cada ~1 segundo)
                if (!this.lastCenterCheck || Date.now() - this.lastCenterCheck > 1500) {
                    this.ensureCentered();
                    this.lastCenterCheck = Date.now();
                }
            }
            if (this.container && this.container.parentElement) {
                requestAnimationFrame(() => this.animate());
            }
        }
        
        ensureCenteredSmooth() {
            // Efecto imán suave: asegurar que la tarjeta más cercana esté perfectamente centrada
            const containerWidth = this.container.clientWidth;
            const scrollLeft = this.container.scrollLeft;
            const containerCenter = scrollLeft + containerWidth / 2;
            
            let nearestCard = null;
            let minDist = Infinity;
            this.cards.forEach(card => {
                const cardLeft = card.offsetLeft;
                const cardWidth = card.offsetWidth;
                const cardCenter = cardLeft + cardWidth / 2;
                const dist = Math.abs(cardCenter - containerCenter);
                if (dist < minDist) {
                    minDist = dist;
                    nearestCard = card;
                }
            });
            
            // Si la tarjeta no está perfectamente centrada, corregir de inmediato.
            if (nearestCard && minDist > 1.5) {
                const cardLeft = nearestCard.offsetLeft;
                const cardWidth = nearestCard.offsetWidth;
                const perfectCenter = cardLeft - (containerWidth / 2) + (cardWidth / 2);
                this.container.scrollLeft = perfectCenter;
                this.currentScroll = perfectCenter;
                this.targetScroll = perfectCenter;
                this.updateCardTransforms();
                
                if (typeof updateCenteredCard === 'function') {
                    updateCenteredCard();
                }
            }
        }
        
        ensureCentered() {
            // Versión simple para verificación periódica - solo snap si es necesario
            const containerWidth = this.container.clientWidth;
            const scrollLeft = this.container.scrollLeft;
            const containerCenter = scrollLeft + containerWidth / 2;
            
            let nearestCard = null;
            let minDist = Infinity;
            this.cards.forEach(card => {
                const cardLeft = card.offsetLeft;
                const cardWidth = card.offsetWidth;
                const cardCenter = cardLeft + cardWidth / 2;
                const dist = Math.abs(cardCenter - containerCenter);
                if (dist < minDist) {
                    minDist = dist;
                    nearestCard = card;
                }
            });
            
            // Solo corregir si está significativamente descentrada
            if (nearestCard && minDist > 3) {
                const cardLeft = nearestCard.offsetLeft;
                const cardWidth = nearestCard.offsetWidth;
                const perfectCenter = cardLeft - (containerWidth / 2) + (cardWidth / 2);
                this.container.scrollLeft = perfectCenter;
                this.currentScroll = perfectCenter;
                this.targetScroll = perfectCenter;
                this.updateCardTransforms();
            }
        }
        
        scrollToIndex(index) {
            const targetCard = this.cards[index];
            if (!targetCard) return;
            
            const containerWidth = this.container.clientWidth;
            const cardLeft = targetCard.offsetLeft;
            const cardWidth = targetCard.offsetWidth;
            
            this.targetScroll = cardLeft - (containerWidth / 2) + (cardWidth / 2);
            this.velocity = 0; // Reset velocity for programmatic scroll
            this.springToTarget();
        }
    }
    
    // Initialize Liquid Carousel
    let liquidCarousel = null;
    
    // Scroll horizontal con rueda y detección de tarjeta centrada (se asegura que el DOM ya existe)
    if (playlistContainer) {
        // Initialize liquid carousel after cards are rendered
        function initLiquidCarousel() {
            if (!playlistContainer) return;
            const cards = playlistContainer.querySelectorAll('.session-card');
            if (cards.length === 0) {
                setTimeout(initLiquidCarousel, 200);
                return;
            }
            
            if (liquidCarousel) {
                liquidCarousel.cleanup();
            }
            liquidCarousel = new LiquidCarousel(playlistContainer);
        }
        
        // Wait for DOM to be ready
        setTimeout(initLiquidCarousel, 300);
        
        // Re-initialize when playlist is re-rendered
        const originalRenderPlaylist = renderPlaylist;
        renderPlaylist = function(...args) {
            const result = originalRenderPlaylist.apply(this, args);
            setTimeout(() => {
                if (liquidCarousel && playlistContainer) {
                    liquidCarousel.cards = Array.from(playlistContainer.querySelectorAll('.session-card'));
                    liquidCarousel.updateCardTransforms();
                } else {
                    initLiquidCarousel();
                }
            }, 200);
            return result;
        };
    }

    // ==========================================
    // OVERLAY TIPO SPOTIFY: tarjetas al clicar el reproductor; cerrar deslizando abajo
    // ==========================================
    const playerExpandedOverlay = document.getElementById('player-expanded-overlay');
    const playerExpandedHandle = document.getElementById('player-expanded-handle');
    const playerExpandedBackdrop = document.getElementById('player-expanded-backdrop');

    let lastCloseTime = 0;
    function openPlayerOverlay() {
        if (!playerExpandedOverlay) return;
        if (Date.now() - lastCloseTime < 400) return;
        playerExpandedOverlay.classList.add('is-open');
        playerExpandedOverlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('player-expanded-open');
    }
    window.openPlayerOverlay = openPlayerOverlay;

    function closePlayerOverlay() {
        if (!playerExpandedOverlay) return;
        playerExpandedOverlay.classList.remove('is-open');
        playerExpandedOverlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('player-expanded-open');
        lastCloseTime = Date.now();
    }

    const expandedContent = playerExpandedOverlay && playerExpandedOverlay.querySelector('.player-expanded-content');
    const DRAG_OPEN_THRESHOLD = 200;
    const DRAG_CLOSE_THRESHOLD = 200;
    /* Suaviza el progreso para que el panel siga el dedo de forma más fluida (ease-out suave) */
    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function startDragOpen(startY) {
        if (!playerExpandedOverlay || !expandedContent || !playerExpandedBackdrop) return;
        if (playerExpandedOverlay.classList.contains('is-open')) return;
        playerExpandedOverlay.classList.add('is-dragging');
        const siteContent = document.querySelector('.site-content');
        let lastY = startY;
        let lastTime = Date.now();

        function onMove(e) {
            e.preventDefault();
            const y = e.touches[0].clientY;
            const deltaY = startY - y;
            let progress = Math.min(1, Math.max(0, deltaY / DRAG_OPEN_THRESHOLD));
            progress = easeOutCubic(progress);
            const translate = (1 - progress) * 100;
            const scale = 0.97 + progress * 0.03;
            expandedContent.style.transform = `translateY(${translate}%) scale(${scale})`;
            expandedContent.style.opacity = 0.03 + 0.97 * progress;
            playerExpandedBackdrop.style.opacity = progress * 0.4;
            if (progress > 0.02) document.body.classList.add('player-expanded-open');
            else document.body.classList.remove('player-expanded-open');
            lastY = y;
            lastTime = Date.now();
        }
        function onEnd(e) {
            const y = e.changedTouches[0].clientY;
            const deltaY = startY - y;
            const dt = Math.max(1, Date.now() - lastTime);
            const velocity = Math.abs((y - lastY) / dt);
            let progress = Math.min(1, Math.max(0, deltaY / DRAG_OPEN_THRESHOLD));
            progress = easeOutCubic(progress);
            const threshold = velocity > 0.5 ? 0.2 : 0.35;
            document.removeEventListener('touchmove', onMove, { passive: false });
            document.removeEventListener('touchend', onEnd, { passive: true });
            document.removeEventListener('touchcancel', onEnd, { passive: true });
            playerExpandedOverlay.classList.remove('is-dragging');
            expandedContent.style.transform = '';
            expandedContent.style.opacity = '';
            playerExpandedBackdrop.style.opacity = '';
            if (siteContent) {
                siteContent.style.removeProperty('filter');
                siteContent.style.removeProperty('-webkit-filter');
            }
            if (progress > threshold) {
                playerExpandedOverlay.classList.add('is-open');
                playerExpandedOverlay.setAttribute('aria-hidden', 'false');
                document.body.classList.add('player-expanded-open');
            } else {
                document.body.classList.remove('player-expanded-open');
            }
        }
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd, { passive: true });
        document.addEventListener('touchcancel', onEnd, { passive: true });
    }

    function startDragClose(startY) {
        if (!playerExpandedOverlay || !expandedContent || !playerExpandedBackdrop) return;
        if (!playerExpandedOverlay.classList.contains('is-open')) return;
        playerExpandedOverlay.classList.add('is-dragging');
        const siteContent = document.querySelector('.site-content');
        let lastY = startY;
        let lastTime = Date.now();

        function onMove(e) {
            e.preventDefault();
            const y = e.touches[0].clientY;
            const deltaY = y - startY;
            let progress = Math.min(1, Math.max(0, deltaY / DRAG_CLOSE_THRESHOLD));
            progress = easeOutCubic(progress);
            const translate = progress * 100;
            const scale = 1 - progress * 0.03;
            expandedContent.style.transform = `translateY(${translate}%) scale(${scale})`;
            expandedContent.style.opacity = 1 - progress * 0.97;
            playerExpandedBackdrop.style.opacity = 0.4 * (1 - progress);
            if (progress >= 0.98) document.body.classList.remove('player-expanded-open');
            else document.body.classList.add('player-expanded-open');
            lastY = y;
            lastTime = Date.now();
        }
        function onEnd(e) {
            const y = e.changedTouches[0].clientY;
            const deltaY = y - startY;
            const dt = Math.max(1, Date.now() - lastTime);
            const velocity = Math.abs((y - lastY) / dt);
            let progress = Math.min(1, Math.max(0, deltaY / DRAG_CLOSE_THRESHOLD));
            progress = easeOutCubic(progress);
            const threshold = velocity > 0.5 ? 0.2 : 0.35;
            document.removeEventListener('touchmove', onMove, { passive: false });
            document.removeEventListener('touchend', onEnd, { passive: true });
            document.removeEventListener('touchcancel', onEnd, { passive: true });
            playerExpandedOverlay.classList.remove('is-dragging');
            expandedContent.style.transform = '';
            expandedContent.style.opacity = '';
            playerExpandedBackdrop.style.opacity = '';
            if (siteContent) {
                siteContent.style.removeProperty('filter');
                siteContent.style.removeProperty('-webkit-filter');
            }
            if (progress > threshold) {
                closePlayerOverlay();
            } else {
                playerExpandedOverlay.classList.add('is-open');
                playerExpandedOverlay.setAttribute('aria-hidden', 'false');
                document.body.classList.add('player-expanded-open');
            }
        }
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd, { passive: true });
        document.addEventListener('touchcancel', onEnd, { passive: true });
    }

    const bottomPlayerEl = document.getElementById('bottom-player');
    if (bottomPlayerEl) {
        bottomPlayerEl.addEventListener('click', function (e) {
            if (e.target.closest('#play-btn, #prev-btn, #next-btn, #progress-container')) return;
            if (e.target.closest('#player-expanded-overlay')) return;
            openPlayerOverlay();
        });
        bottomPlayerEl.addEventListener('touchstart', function (e) {
            if (e.target.closest('#play-btn, #prev-btn, #next-btn, #progress-container')) return;
            if (e.target.closest('#player-expanded-overlay')) return;
            if (playerExpandedOverlay && playerExpandedOverlay.classList.contains('is-open')) return;
            const startY = e.touches[0].clientY;
            const startX = e.touches[0].clientX;
            let decided = false;
            let openBySwipeDown = false;
            function onMove(ev) {
                if (decided) return;
                const y = ev.touches[0].clientY;
                const x = ev.touches[0].clientX;
                const dy = startY - y;
                const dx = x - startX;
                if (dy > 20 && dy > 2 * Math.abs(dx)) {
                    decided = true;
                    document.removeEventListener('touchmove', onMove, { passive: false });
                    document.removeEventListener('touchend', onEnd, { passive: true });
                    document.removeEventListener('touchcancel', onEnd, { passive: true });
                    startDragOpen(startY);
                } else if (y - startY > 20 && (y - startY) > 2 * Math.abs(dx)) {
                    decided = true;
                    openBySwipeDown = true;
                }
            }
            function onEnd(ev) {
                if (ev.changedTouches && ev.changedTouches[0]) {
                    const endY = ev.changedTouches[0].clientY;
                    if (openBySwipeDown && (endY - startY) > 40) openPlayerOverlay();
                    else if (!decided && (endY - startY) > 50) openPlayerOverlay();
                }
                document.removeEventListener('touchmove', onMove, { passive: false });
                document.removeEventListener('touchend', onEnd, { passive: true });
                document.removeEventListener('touchcancel', onEnd, { passive: true });
            }
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd, { passive: true });
            document.addEventListener('touchcancel', onEnd, { passive: true });
        }, { passive: true });
    }

    const playerInfo = document.getElementById('player-info');
    if (playerInfo) {
        playerInfo.addEventListener('click', (e) => {
            e.stopPropagation();
            openPlayerOverlay();
        });
    }

    const goSessions = document.getElementById('go-sessions');
    if (goSessions) {
        goSessions.addEventListener('click', (e) => {
            e.stopPropagation();
            openPlayerOverlay();
        });
    }

    if (playerExpandedHandle) {
        playerExpandedHandle.addEventListener('click', closePlayerOverlay);
    }
    if (playerExpandedBackdrop) {
        playerExpandedBackdrop.addEventListener('click', closePlayerOverlay);
    }

    if (playerExpandedHandle) {
        playerExpandedHandle.addEventListener('touchstart', function (e) {
            if (playerExpandedOverlay && playerExpandedOverlay.classList.contains('is-open')) {
                startDragClose(e.touches[0].clientY);
            }
        }, { passive: true });
    }

    // Swipe abajo en cualquier parte del panel Antología sonora para cerrar (arrastre fluido)
    // + Evitar que el swipe vertical en el panel mueva la página (preventDefault en touchmove vertical)
    if (playerExpandedOverlay && expandedContent) {
        let contentStartY = 0;
        let contentStartX = 0;
        let panelTouchStartY = null;
        let panelTouchStartX = null;
        expandedContent.addEventListener('touchstart', function (e) {
            if (e.target.closest('.player-expanded-handle')) {
                panelTouchStartY = null;
                panelTouchStartX = null;
                return;
            }
            contentStartY = e.touches[0].clientY;
            contentStartX = e.touches[0].clientX;
            panelTouchStartY = e.touches[0].clientY;
            panelTouchStartX = e.touches[0].clientX;
        }, { passive: true });
        expandedContent.addEventListener('touchend', function (e) {
            if (e.target.closest('.player-expanded-handle')) return;
            panelTouchStartY = null;
            panelTouchStartX = null;
            const endY = e.changedTouches[0].clientY;
            if (endY - contentStartY > 80) closePlayerOverlay();
        }, { passive: true });
        expandedContent.addEventListener('touchcancel', function () {
            panelTouchStartY = null;
            panelTouchStartX = null;
        }, { passive: true });
        // Bloquear scroll de la página cuando el gesto es vertical (swipe abajo) sobre el panel
        expandedContent.addEventListener('touchmove', function (e) {
            if (!playerExpandedOverlay || !playerExpandedOverlay.classList.contains('is-open')) return;
            if (panelTouchStartY == null || panelTouchStartX == null || !e.touches[0]) return;
            const y = e.touches[0].clientY;
            const x = e.touches[0].clientX;
            const dy = y - panelTouchStartY;
            const dx = x - panelTouchStartX;
            if (Math.abs(dy) > 8 && Math.abs(dy) > 2 * Math.abs(dx)) {
                e.preventDefault();
            }
        }, { passive: false });
        // Arrastre fluido al cerrar desde cualquier parte: solo si el gesto es claramente swipe abajo (no scroll horizontal)
        expandedContent.addEventListener('touchstart', function (e) {
            if (e.target.closest('.player-expanded-handle')) return;
            if (!playerExpandedOverlay || !playerExpandedOverlay.classList.contains('is-open')) return;
            const startY = e.touches[0].clientY;
            const startX = e.touches[0].clientX;
            let decided = false;
            function onFirstMove(ev) {
                if (decided) return;
                const y = ev.touches[0].clientY;
                const x = ev.touches[0].clientX;
                const dy = y - startY;
                const dx = x - startX;
                if (dy > 15 && dy > 2 * Math.abs(dx)) {
                    decided = true;
                    document.removeEventListener('touchmove', onFirstMove, { passive: true });
                    document.removeEventListener('touchend', onFirstEnd, { passive: true });
                    document.removeEventListener('touchcancel', onFirstEnd, { passive: true });
                    startDragClose(startY);
                }
            }
            function onFirstEnd() {
                if (!decided) {
                    document.removeEventListener('touchmove', onFirstMove, { passive: true });
                    document.removeEventListener('touchend', onFirstEnd, { passive: true });
                    document.removeEventListener('touchcancel', onFirstEnd, { passive: true });
                }
            }
            document.addEventListener('touchmove', onFirstMove, { passive: true });
            document.addEventListener('touchend', onFirstEnd, { passive: true });
            document.addEventListener('touchcancel', onFirstEnd, { passive: true });
        }, { passive: true });
    }

    // Helper: cierre deslizando hacia abajo (arrastre que sigue el dedo) para paneles about/contact/records
    function setupPanelDragClose(opts) {
        const { overlay, contentEl, backdropEl, handleEl, closeFn, bodyClass } = opts;
        if (!overlay || !contentEl || !backdropEl) return;
        const DRAG_CLOSE_THRESHOLD = 200;
        function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
        const siteContent = document.querySelector('.site-content');

        function startDragClose(startY) {
            if (!overlay.classList.contains('is-open')) return;
            overlay.classList.add('is-dragging');
            let lastY = startY, lastTime = Date.now();
            function onMove(e) {
                e.preventDefault();
                const y = e.touches[0].clientY;
                const deltaY = y - startY;
                let progress = Math.min(1, Math.max(0, deltaY / DRAG_CLOSE_THRESHOLD));
                progress = easeOutCubic(progress);
                contentEl.style.transform = `translateY(${progress * 100}%) scale(${1 - progress * 0.03})`;
                contentEl.style.opacity = 1 - progress * 0.97;
                backdropEl.style.opacity = 0.4 * (1 - progress);
                if (siteContent) {
                    siteContent.style.filter = progress >= 0.98 ? '' : `brightness(1) blur(${Math.min(12, 12 * (1 - progress))}px)`;
                    if (progress >= 0.98) document.body.classList.remove(bodyClass);
                }
                lastY = y; lastTime = Date.now();
            }
            function onEnd(e) {
                const y = e.changedTouches[0].clientY;
                const deltaY = y - startY;
                const dt = Math.max(1, Date.now() - lastTime);
                const velocity = Math.abs((y - lastY) / dt);
                let progress = Math.min(1, Math.max(0, deltaY / DRAG_CLOSE_THRESHOLD));
                progress = easeOutCubic(progress);
                const threshold = velocity > 0.5 ? 0.2 : 0.35;
                document.removeEventListener('touchmove', onMove, { passive: false });
                document.removeEventListener('touchend', onEnd, { passive: true });
                document.removeEventListener('touchcancel', onEnd, { passive: true });
                overlay.classList.remove('is-dragging');
                contentEl.style.transform = ''; contentEl.style.opacity = ''; backdropEl.style.opacity = '';
                if (siteContent) siteContent.style.filter = '';
                if (progress > threshold) closeFn();
                else {
                    overlay.classList.add('is-open');
                    overlay.setAttribute('aria-hidden', 'false');
                    document.body.classList.add(bodyClass);
                }
            }
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd, { passive: true });
            document.addEventListener('touchcancel', onEnd, { passive: true });
        }

        if (handleEl) {
            handleEl.addEventListener('touchstart', function (e) {
                if (overlay.classList.contains('is-open')) startDragClose(e.touches[0].clientY);
            }, { passive: true });
        }
        contentEl.addEventListener('touchstart', function (e) {
            if (handleEl && handleEl.contains(e.target)) return;
            if (!overlay.classList.contains('is-open')) return;
            const startY = e.touches[0].clientY, startX = e.touches[0].clientX;
            let decided = false;
            function onFirstMove(ev) {
                if (decided) return;
                const y = ev.touches[0].clientY, x = ev.touches[0].clientX;
                const dy = y - startY, dx = x - startX;
                if (dy > 15 && dy > 2 * Math.abs(dx)) {
                    decided = true;
                    document.removeEventListener('touchmove', onFirstMove, { passive: true });
                    document.removeEventListener('touchend', onFirstEnd, { passive: true });
                    document.removeEventListener('touchcancel', onFirstEnd, { passive: true });
                    startDragClose(startY);
                }
            }
            function onFirstEnd() {
                if (!decided) {
                    document.removeEventListener('touchmove', onFirstMove, { passive: true });
                    document.removeEventListener('touchend', onFirstEnd, { passive: true });
                    document.removeEventListener('touchcancel', onFirstEnd, { passive: true });
                }
            }
            document.addEventListener('touchmove', onFirstMove, { passive: true });
            document.addEventListener('touchend', onFirstEnd, { passive: true });
            document.addEventListener('touchcancel', onFirstEnd, { passive: true });
        }, { passive: true });

        let panelTouchStartY = null, panelTouchStartX = null;
        contentEl.addEventListener('touchstart', function (e) {
            if (handleEl && handleEl.contains(e.target)) return;
            panelTouchStartY = e.touches[0].clientY;
            panelTouchStartX = e.touches[0].clientX;
        }, { passive: true });
        contentEl.addEventListener('touchmove', function (e) {
            if (!overlay.classList.contains('is-open')) return;
            if (panelTouchStartY == null || !e.touches[0]) return;
            const y = e.touches[0].clientY, x = e.touches[0].clientX;
            const dy = y - panelTouchStartY, dx = x - panelTouchStartX;
            if (Math.abs(dy) > 8 && Math.abs(dy) > 2 * Math.abs(dx)) e.preventDefault();
        }, { passive: false });
        contentEl.addEventListener('touchcancel', function () { panelTouchStartY = null; panelTouchStartX = null; }, { passive: true });
    }

    // ==========================================
    // PANEL DE SELECCIÓN (RECORDS) — abre al clicar Selección en navbar
    // ==========================================
    const recordsExpandedOverlay = document.getElementById('records-expanded-overlay');
    const recordsExpandedHandle = document.getElementById('records-expanded-handle');
    const recordsExpandedBackdrop = document.getElementById('records-expanded-backdrop');
    const recordsExpandedInner = document.getElementById('records-expanded-inner');
    const recordsSection = document.getElementById('records');
    let recordsContentCloned = false;

    function openRecordsOverlay() {
        if (!recordsExpandedOverlay || !recordsExpandedInner) return;
        if (!recordsContentCloned && recordsSection) {
            const plaqueWrap = recordsSection.querySelector('.w-full.relative.group');
            const footerText = plaqueWrap?.nextElementSibling;
            if (plaqueWrap) {
                const clone = plaqueWrap.cloneNode(true);
                recordsExpandedInner.appendChild(clone);
            }
            if (footerText) {
                const footerClone = footerText.cloneNode(true);
                recordsExpandedInner.appendChild(footerClone);
            }
            recordsContentCloned = true;
        }
        recordsExpandedOverlay.classList.add('is-open');
        recordsExpandedOverlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('records-panel-open');
    }
    window.openRecordsOverlay = openRecordsOverlay;

    function closeRecordsOverlay() {
        if (!recordsExpandedOverlay) return;
        recordsExpandedOverlay.classList.remove('is-open');
        recordsExpandedOverlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('records-panel-open');
    }

    if (recordsExpandedHandle) {
        recordsExpandedHandle.addEventListener('click', closeRecordsOverlay);
    }
    if (recordsExpandedBackdrop) {
        recordsExpandedBackdrop.addEventListener('click', closeRecordsOverlay);
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && recordsExpandedOverlay && recordsExpandedOverlay.classList.contains('is-open')) {
            closeRecordsOverlay();
        }
    });
    if (recordsExpandedOverlay) {
        const recordsContent = recordsExpandedOverlay.querySelector('.records-expanded-content');
        if (recordsContent) {
            let contentStartY = 0;
            recordsContent.addEventListener('touchstart', function (e) {
                if (e.target.closest('.records-expanded-handle')) return;
                contentStartY = e.touches[0].clientY;
            }, { passive: true });
            recordsContent.addEventListener('touchend', function (e) {
                if (e.target.closest('.records-expanded-handle')) return;
                const endY = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0;
                if (endY - contentStartY > 80) closeRecordsOverlay();
            }, { passive: true });
            setupPanelDragClose({
                overlay: recordsExpandedOverlay,
                contentEl: recordsContent,
                backdropEl: recordsExpandedBackdrop,
                handleEl: recordsExpandedHandle,
                closeFn: closeRecordsOverlay,
                bodyClass: 'records-panel-open'
            });
        }
    }
    // Enlaces de navbar → paneles SOLO en móvil/tablet (PC hace scroll normal)
    const PANEL_MAX_WIDTH = 1023; // < 1024px = móvil/tablet

    document.querySelectorAll('a[href="#records"]').forEach((link) => {
        link.addEventListener('click', (e) => {
            if (window.innerWidth <= PANEL_MAX_WIDTH) {
                e.preventDefault();
                openRecordsOverlay();
            }
        });
    });
    document.querySelectorAll('a[href="#music"]').forEach((link) => {
        link.addEventListener('click', (e) => {
            if (window.innerWidth <= PANEL_MAX_WIDTH) {
                e.preventDefault();
                if (typeof window.openPlayerOverlay === 'function') window.openPlayerOverlay();
            }
        });
    });
    document.querySelectorAll('a[href="#contact"]').forEach((link) => {
        link.addEventListener('click', (e) => {
            if (window.innerWidth <= PANEL_MAX_WIDTH) {
                e.preventDefault();
                if (typeof window.openContactOverlay === 'function') window.openContactOverlay();
            }
        });
    });
    document.querySelectorAll('a[href="#about"]').forEach((link) => {
        link.addEventListener('click', (e) => {
            if (window.innerWidth <= PANEL_MAX_WIDTH) {
                e.preventDefault();
                if (typeof window.openAboutOverlay === 'function') window.openAboutOverlay();
            }
        });
    });

    // ==========================================
    // PANEL DE VISIÓN (ABOUT) — abre al clicar Visión en navbar, sin imagen gal-3
    // ==========================================
    const aboutExpandedOverlay = document.getElementById('about-expanded-overlay');
    const aboutExpandedHandle = document.getElementById('about-expanded-handle');
    const aboutExpandedBackdrop = document.getElementById('about-expanded-backdrop');
    const aboutExpandedInner = document.getElementById('about-expanded-inner');
    const aboutSection = document.getElementById('about');
    let aboutContentCloned = false;

    function openAboutOverlay() {
        if (!aboutExpandedOverlay || !aboutExpandedInner) return;
        if (!aboutContentCloned && aboutSection) {
            const plaqueWrap = aboutSection.querySelector('.subscribe-glass-card.about-plaque');
            if (plaqueWrap) {
                const clone = plaqueWrap.cloneNode(true);
                const gal3Img = clone.querySelector('img[src*="gal-3"]');
                if (gal3Img) {
                    const imgCol = gal3Img.closest('[class*="col-span-5"]') || gal3Img.closest('.aether-portrait-container')?.parentElement;
                    if (imgCol) imgCol.remove();
                }
                aboutExpandedInner.appendChild(clone);
                aboutContentCloned = true;
                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }
            }
        }
        aboutExpandedOverlay.classList.add('is-open');
        aboutExpandedOverlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('about-panel-open');
    }
    window.openAboutOverlay = openAboutOverlay;

    function closeAboutOverlay() {
        if (!aboutExpandedOverlay) return;
        aboutExpandedOverlay.classList.remove('is-open');
        aboutExpandedOverlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('about-panel-open');
    }

    if (aboutExpandedHandle) {
        aboutExpandedHandle.addEventListener('click', closeAboutOverlay);
    }
    if (aboutExpandedBackdrop) {
        aboutExpandedBackdrop.addEventListener('click', closeAboutOverlay);
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && aboutExpandedOverlay && aboutExpandedOverlay.classList.contains('is-open')) {
            closeAboutOverlay();
        }
    });
    const aboutContent = aboutExpandedOverlay && aboutExpandedOverlay.querySelector('.about-expanded-content');
    if (aboutContent) {
        let contentStartY = 0;
        aboutContent.addEventListener('touchstart', function (e) {
            if (e.target.closest('.about-expanded-handle')) return;
            contentStartY = e.touches[0].clientY;
        }, { passive: true });
        aboutContent.addEventListener('touchend', function (e) {
            if (e.target.closest('.about-expanded-handle')) return;
            const endY = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0;
            if (endY - contentStartY > 80) closeAboutOverlay();
        }, { passive: true });
        setupPanelDragClose({
            overlay: aboutExpandedOverlay,
            contentEl: aboutContent,
            backdropEl: aboutExpandedBackdrop,
            handleEl: aboutExpandedHandle,
            closeFn: closeAboutOverlay,
            bodyClass: 'about-panel-open'
        });
    }

    // ==========================================
    // PANEL DE CONTACTO — abre al clicar Contacto en navbar
    // ==========================================
    const contactExpandedOverlay = document.getElementById('contact-expanded-overlay');
    const contactExpandedHandle = document.getElementById('contact-expanded-handle');
    const contactExpandedBackdrop = document.getElementById('contact-expanded-backdrop');
    const contactExpandedInner = document.getElementById('contact-expanded-inner');
    const contactSection = document.getElementById('contact');
    let contactContentCloned = false;

    function openContactOverlay() {
        if (!contactExpandedOverlay || !contactExpandedInner) return;
        if (!contactContentCloned && contactSection) {
            const contentWrap = contactSection.querySelector('.max-w-4xl.mx-auto');
            if (contentWrap) {
                const clone = contentWrap.cloneNode(true);
                contactExpandedInner.appendChild(clone);
                contactContentCloned = true;
                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }
            }
        }
        contactExpandedOverlay.classList.add('is-open');
        contactExpandedOverlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('contact-panel-open');
    }
    window.openContactOverlay = openContactOverlay;

    function closeContactOverlay() {
        if (!contactExpandedOverlay) return;
        contactExpandedOverlay.classList.remove('is-open');
        contactExpandedOverlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('contact-panel-open');
    }

    if (contactExpandedHandle) {
        contactExpandedHandle.addEventListener('click', closeContactOverlay);
    }
    if (contactExpandedBackdrop) {
        contactExpandedBackdrop.addEventListener('click', closeContactOverlay);
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && contactExpandedOverlay && contactExpandedOverlay.classList.contains('is-open')) {
            closeContactOverlay();
        }
    });
    const contactContent = contactExpandedOverlay && contactExpandedOverlay.querySelector('.contact-expanded-content');
    if (contactContent) {
        let contentStartY = 0;
        contactContent.addEventListener('touchstart', function (e) {
            if (e.target.closest('.contact-expanded-handle')) return;
            contentStartY = e.touches[0].clientY;
        }, { passive: true });
        contactContent.addEventListener('touchend', function (e) {
            if (e.target.closest('.contact-expanded-handle')) return;
            const endY = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0;
            if (endY - contentStartY > 80) closeContactOverlay();
        }, { passive: true });
        setupPanelDragClose({
            overlay: contactExpandedOverlay,
            contentEl: contactContent,
            backdropEl: contactExpandedBackdrop,
            handleEl: contactExpandedHandle,
            closeFn: closeContactOverlay,
            bodyClass: 'contact-panel-open'
        });
    }

    // Barrita cerrada: clic abre; deslizar arriba sigue el dedo; deslizar abajo también abre
    const playerCollapsedHandle = document.getElementById('player-collapsed-handle');
    if (playerCollapsedHandle) {
        playerCollapsedHandle.addEventListener('click', function (e) {
            e.stopPropagation();
            openPlayerOverlay();
        });
        playerCollapsedHandle.addEventListener('touchstart', function (e) {
            if (playerExpandedOverlay && playerExpandedOverlay.classList.contains('is-open')) return;
            e.stopPropagation();
            const startY = e.touches[0].clientY;
            const startX = e.touches[0].clientX;
            let decided = false;
            let openBySwipeDown = false;
            function onMove(ev) {
                if (decided) return;
                const y = ev.touches[0].clientY;
                const x = ev.touches[0].clientX;
                const dy = startY - y;
                const dx = x - startX;
                if (dy > 20 && dy > 2 * Math.abs(dx)) {
                    decided = true;
                    document.removeEventListener('touchmove', onMove, { passive: false });
                    document.removeEventListener('touchend', onEnd, { passive: true });
                    document.removeEventListener('touchcancel', onEnd, { passive: true });
                    startDragOpen(startY);
                } else if (y - startY > 20 && (y - startY) > 2 * Math.abs(dx)) {
                    decided = true;
                    openBySwipeDown = true;
                }
            }
            function onEnd(ev) {
                if (ev.changedTouches && ev.changedTouches[0]) {
                    const endY = ev.changedTouches[0].clientY;
                    if (openBySwipeDown && (endY - startY) > 40) openPlayerOverlay();
                    else if (!decided && (endY - startY) > 50) openPlayerOverlay();
                }
                document.removeEventListener('touchmove', onMove, { passive: false });
                document.removeEventListener('touchend', onEnd, { passive: true });
                document.removeEventListener('touchcancel', onEnd, { passive: true });
            }
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd, { passive: true });
            document.addEventListener('touchcancel', onEnd, { passive: true });
        }, { passive: true });
    }
}); // Fin DOMContentLoaded




  function toggleVinyl(element) {
        // 1. Si el disco ya está activo, lo cerramos
        if (element.classList.contains('active')) {
            element.classList.remove('active');
        } else {
            // 2. Opcional: Cerrar todos los otros discos antes de abrir este
            document.querySelectorAll('.disco-item-pc').forEach(el => el.classList.remove('active'));
            
            // 3. Abrir el disco clickado
            element.classList.add('active');
        }
    }



/* EFECTO SHRINK EN HEADER AL SCROLL — clase binaria + transición CSS */
/* Usar posición del header en pantalla (getBoundingClientRect) para no depender de quién hace scroll */
function updateHeaderShrink() {
    const headerSection = document.getElementById('home');
    const headerWrapper = document.querySelector('.home-header-wrapper');
    if (!headerSection || !headerWrapper) return;
    var top = headerSection.getBoundingClientRect().top;
    var on = top < -80; /* header ha subido más de 80px → modo tarjeta */
    headerSection.classList.toggle('header-shrink', on);
    headerWrapper.classList.toggle('header-scrolled', on);
}

function setupHeaderShrink() {
    updateHeaderShrink();
    window.__scrollTickCallbacks = window.__scrollTickCallbacks || [];
    window.__scrollTickCallbacks.push(updateHeaderShrink);
    window.addEventListener('resize', updateHeaderShrink, { passive: true });
}

window.addEventListener('load', setupHeaderShrink);
document.addEventListener('DOMContentLoaded', setupHeaderShrink);





/* ==========================================
   AVISO PRIVACIDAD (solo almacenamiento local, sin YouTube)
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'aether_consent_v1';

    function getBanner() {
        return document.getElementById('cookie-banner');
    }

    function showBanner() {
        if (!document.documentElement.classList.contains('styles-loaded')) return false;
        var banner = getBanner();
        if (banner) banner.classList.remove('translate-y-[120%]');
        return true;
    }

    function hideBanner() {
        var banner = getBanner();
        if (banner) banner.classList.add('translate-y-[120%]');
    }

    function handleConsent() {
        localStorage.setItem(STORAGE_KEY, 'acknowledged');
        hideBanner();
    }

    // Mostrar banner solo si no ha aceptado/entendido antes
    if (!localStorage.getItem(STORAGE_KEY)) {
        if (!showBanner()) {
            var check = setInterval(function () {
                if (showBanner()) clearInterval(check);
            }, 250);
        }
    }

    // Botón Entendido: listener directo para que siempre funcione
    var okBtn = document.getElementById('cookie-banner-ok');
    if (okBtn) {
        okBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            handleConsent();
        });
    }
});






/* ==========================================
   LÓGICA MODAL PRIVACIDAD
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('open-privacy-btn');
    const closeBtn = document.getElementById('close-privacy-btn');
    const modal = document.getElementById('privacy-modal');
    const backdrop = document.getElementById('privacy-backdrop');
    const contentBox = document.getElementById('privacy-content-box');

    if (!modal) return;

    function openModal(e) {
        if(e) e.preventDefault();
        // 1. Mostrar (quitar hidden)
        modal.classList.remove('hidden');
        modal.classList.add('flex'); // Usar flex para centrar
        
        // 2. Animar entrada (pequeño retardo para que el navegador pínte)
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            contentBox.classList.remove('scale-95');
            contentBox.classList.add('scale-100');
        }, 10);
        
        // Bloquear scroll del body
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        // 1. Animar salida
        modal.classList.add('opacity-0');
        contentBox.classList.remove('scale-100');
        contentBox.classList.add('scale-95');

        // 2. Ocultar tras la animación (300ms)
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            document.body.style.overflow = ''; // Restaurar scroll
        }, 300);
    }

    // Eventos
    if(openBtn) openBtn.addEventListener('click', openModal);
    if(closeBtn) closeBtn.addEventListener('click', closeModal);
    if(backdrop) backdrop.addEventListener('click', closeModal); // Cerrar al tocar lo negro
    
    // Cerrar con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal();
        }
    });
});




/* ==========================================
   TRADUCTOR DINÁMICO DE LEGALES (COINCIDENCIA EXACTA)
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Textos en ambos idiomas
    const legalContent = {
        es: {
            bannerTitle: "Privacidad",
            bannerText: "Usamos almacenamiento local para recordar tus preferencias (idioma, animación de entrada). No usamos cookies de terceros.",
            bannerLink: "Leer política",
            btnOk: "Entendido",
            toggleLabel: "Translate to EN",
            privacyBody: `
                <div class="mb-8">
                    <h2 class="font-serif text-2xl text-white mb-2">Política de Privacidad</h2>
                    <div class="w-10 h-[1px] bg-brand-accent"></div>
                </div>

                <p><strong>1. Identidad del Responsable</strong><br>
                AETHER (en adelante, "el Titular"). Sitio web informativo y artístico sin recolección de datos personales directos.</p>

                <p><strong>2. Datos que se recopilan</strong><br>
                Este sitio web no tiene formularios de registro, ni tienda online, ni sistema de comentarios. No recopilamos nombres, correos ni datos personales de los usuarios.</p>

                <p><strong>3. Almacenamiento Local</strong><br>
                Utilizamos almacenamiento local en su navegador para recordar si ya ha visto la animación de introducción y sus preferencias (por ejemplo, idioma). No utilizamos cookies de terceros.</p>

                <p><strong>4. Sus Derechos</strong><br>
                Puede eliminar los datos almacenados en su navegador (caché y almacenamiento local) en cualquier momento desde las opciones de configuración de su navegador.</p>

                <p class="text-xs opacity-50 mt-8 pt-4 border-t border-white/10">
                    Última actualización: Enero 2026.
                </p>
            `
        },
        en: {
            bannerTitle: "Privacy",
            bannerText: "We use local storage to remember your preferences (language, intro animation). We do not use third-party cookies.",
            bannerLink: "Read policy",
            btnOk: "Understood",
            toggleLabel: "Traducir a ES",
            privacyBody: `
                <div class="mb-8">
                    <h2 class="font-serif text-2xl text-white mb-2">Privacy Policy</h2>
                    <div class="w-10 h-[1px] bg-brand-accent"></div>
                </div>

                <p><strong>1. Identity of the Owner</strong><br>
                AETHER (hereinafter, "the Owner"). Informational and artistic website with no direct collection of personal data.</p>

                <p><strong>2. Data Collection</strong><br>
                This website has no registration forms, online store, or comment systems. We do not collect names, emails, or personal data from users.</p>

                <p><strong>3. Local Storage</strong><br>
                We use local storage in your browser to remember if you have seen the intro animation and your preferences (e.g. language). We do not use third-party cookies.</p>

                <p><strong>4. Your Rights</strong><br>
                You can delete data stored in your browser (cache and local storage) at any time via your browser settings.</p>

                <p class="text-xs opacity-50 mt-8 pt-4 border-t border-white/10">
                    Last updated: January 2026.
                </p>
            `
        }
    };

    let currentLegalLang = 'es';
    const toggleBtn = document.getElementById('toggle-legal-lang-btn');

    function toggleLegalLanguage() {
        currentLegalLang = (currentLegalLang === 'es') ? 'en' : 'es';
        const content = legalContent[currentLegalLang];

        const titleEl = document.getElementById('legal-banner-title');
        const textEl = document.getElementById('legal-banner-text');
        const linkEl = document.getElementById('legal-banner-link');
        const okBtn = document.getElementById('cookie-banner-ok');

        if (titleEl) titleEl.innerText = content.bannerTitle;
        if (textEl) textEl.innerText = content.bannerText;
        if (linkEl) linkEl.innerText = content.bannerLink;
        if (okBtn) okBtn.innerText = content.btnOk;
        if (toggleBtn) toggleBtn.innerText = content.toggleLabel;

        const modalBody = document.getElementById('privacy-text-content');
        if (modalBody) modalBody.innerHTML = content.privacyBody;
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleLegalLanguage();
        });
    }
});

/* ==========================================
   RITUAL VU: immersive ambient microphone meter
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    const triggers = Array.from(document.querySelectorAll('[data-ritual-vu-trigger]'));
    const overlay = document.getElementById('ritual-vu-overlay');
    const closeBtn = document.getElementById('ritual-vu-close');
    const needleWrap = overlay ? overlay.querySelector('.ritual-vu-needle-wrap') : null;
    const glow = overlay ? overlay.querySelector('.ritual-vu-mic-glow') : null;
    const status = document.getElementById('ritual-vu-status');

    if (!triggers.length || !overlay || !needleWrap || !status) return;

    let audioContext = null;
    let analyser = null;
    let stream = null;
    let sourceNode = null;
    let dataArray = null;
    let rafId = 0;
    let smoothedLevel = 0;
    let isActive = false;
    let micReady = false;

    const setStatus = (text) => {
        status.textContent = text;
    };

    function setNeedle(level) {
        const clamped = Math.max(0, Math.min(1, level));
        const angle = -52 + clamped * 104;
        needleWrap.style.setProperty('--needle-rotation', `${angle}deg`);
        if (glow) {
            glow.style.opacity = `${0.38 + clamped * 0.55}`;
            glow.style.transform = `scale(${0.96 + clamped * 0.12})`;
        }
    }

    function updateNeedleFromMic() {
        if (!analyser || !dataArray) return;
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i += 1) {
            const centered = (dataArray[i] - 128) / 128;
            sum += centered * centered;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const db = 20 * Math.log10(Math.max(rms, 0.00001));
        const normalized = Math.max(0, Math.min(1, (db + 60) / 60));

        const attack = 0.26;
        const release = 0.07;
        const factor = normalized > smoothedLevel ? attack : release;
        smoothedLevel += (normalized - smoothedLevel) * factor;

        setNeedle(smoothedLevel);
        rafId = requestAnimationFrame(updateNeedleFromMic);
    }

    async function startMic() {
        if (micReady) return true;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setStatus('Microphone is not supported');
            return false;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) {
                setStatus('Audio engine is not supported');
                return false;
            }

            audioContext = new Ctx();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            sourceNode = audioContext.createMediaStreamSource(stream);
            sourceNode.connect(analyser);
            dataArray = new Uint8Array(analyser.fftSize);
            micReady = true;
            setStatus('Listening to ambient space');
            return true;
        } catch (_) {
            setStatus('Tap to grant microphone access');
            return false;
        }
    }

    function stopMic() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        if (sourceNode) {
            try { sourceNode.disconnect(); } catch (_) {}
        }
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
        }
        if (audioContext) {
            try { audioContext.close(); } catch (_) {}
        }
        sourceNode = null;
        stream = null;
        analyser = null;
        audioContext = null;
        dataArray = null;
        micReady = false;
        smoothedLevel = 0;
        setNeedle(0.02);
    }

    async function openRitual() {
        if (isActive) return;
        isActive = true;
        overlay.classList.add('is-active');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('ritual-vu-open');
        const ok = await startMic();
        if (ok) {
            if (audioContext && audioContext.state === 'suspended') {
                try { await audioContext.resume(); } catch (_) {}
            }
            if (!rafId) updateNeedleFromMic();
        }
    }

    function closeRitual() {
        if (!isActive) return;
        isActive = false;
        overlay.classList.remove('is-active');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('ritual-vu-open');
        stopMic();
        setStatus('Tap to awaken microphone');
    }

    function toggleRitual() {
        if (isActive) closeRitual();
        else openRitual();
    }

    function isMobileLandscape() {
        const coarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        const isLandscape = window.matchMedia('(orientation: landscape)').matches;
        return coarsePointer && isLandscape;
    }

    triggers.forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            toggleRitual();
        });
    });

    closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeRitual();
    });

    overlay.addEventListener('click', async (e) => {
        if (e.target === overlay) {
            closeRitual();
            return;
        }
        if (!micReady) {
            const ok = await startMic();
            if (ok && !rafId) updateNeedleFromMic();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeRitual();
    });

    const orientationMql = window.matchMedia('(orientation: landscape)');
    const onOrientation = () => {
        if (isMobileLandscape() && !isActive) openRitual();
    };
    if (orientationMql.addEventListener) {
        orientationMql.addEventListener('change', onOrientation);
    } else if (orientationMql.addListener) {
        orientationMql.addListener(onOrientation);
    }

    if (isMobileLandscape()) {
        openRitual();
    } else {
        setNeedle(0.02);
    }
});





