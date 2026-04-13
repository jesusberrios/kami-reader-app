import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { WebView } from 'react-native-webview';
import { Picker } from '@react-native-picker/picker';
import { usePersonalization } from '../contexts/PersonalizationContext';
import { useAlertContext } from '../contexts/AlertContext';
import { getAnimeEpisodes, getEpisodeStreams } from '../services/backendApi';
import { auth, db } from '../firebase/config';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

const ENABLE_WEBVIEW_FALLBACK = false;
const FORCE_WEBVIEW_MODE = false;
const PLAYER_EPISODES_PAGE_SIZE = 120;
const PLAYER_EPISODES_MAX_PAGES = 12;

const isNativePlayableUrl = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return false;

    const candidates = [raw];
    try {
        const parsed = new URL(raw);
        const nested = String(parsed.searchParams.get('u') || '').trim();
        if (nested) {
            candidates.push(nested);
            try {
                candidates.push(decodeURIComponent(nested));
            } catch (_) {
                // Keep non-decoded nested candidate.
            }
        }
    } catch (_) {
        // Ignore malformed URL for nested parsing.
    }

    return candidates.some((candidateRaw) => {
        const url = String(candidateRaw || '').trim().toLowerCase();
        if (!url) return false;

        const isLikelyEmbedHtml = url.endsWith('.html')
            || /\/embed[-/]/i.test(url)
            || /\/e\//i.test(url)
            || /\/v\//i.test(url);

        if (isLikelyEmbedHtml && !url.includes('/get_video?') && !url.includes('.m3u8')) {
            return false;
        }

        return url.includes('.m3u8')
            || url.includes('.mp4')
            || url.includes('/get_video?')
            || /[?&](?:file|src|url)=https?:[^\s]+(?:m3u8|mp4)/i.test(url);
    });
};

const buildDPlayerHtml = (mediaUrl: string, requestHeaders?: Record<string, string>) => {
        const safeUrl = String(mediaUrl || '').trim();
        const isHls = /\.m3u8(?:\?|#|$)/i.test(safeUrl) || /[?&](?:file|src|url)=https?:[^\s]+\.m3u8/i.test(safeUrl);
        const headers = requestHeaders && typeof requestHeaders === 'object' ? requestHeaders : {};

        return `<!doctype html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <title>DPlayer</title>
        <style>
            html, body { margin: 0; padding: 0; background: #000; width: 100%; height: 100%; overflow: hidden; }
            #app { width: 100%; height: 100%; }
        </style>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/dplayer/dist/DPlayer.min.css" />
    </head>
    <body>
        <div id="app"></div>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/dplayer/dist/DPlayer.min.js"></script>
        <script>
            (function () {
                var mediaUrl = ${JSON.stringify(safeUrl)};
                var headers = ${JSON.stringify(headers)};
                var isHls = ${JSON.stringify(isHls)};

                var player = new DPlayer({
                    container: document.getElementById('app'),
                    autoplay: true,
                    screenshot: false,
                    video: {
                        url: mediaUrl,
                        type: isHls ? 'customHls' : 'auto',
                        customType: {
                            customHls: function (video) {
                                if (!window.Hls || !window.Hls.isSupported()) {
                                    video.src = mediaUrl;
                                    return;
                                }
                                var hls = new Hls({
                                    xhrSetup: function (xhr) {
                                        try {
                                            Object.keys(headers || {}).forEach(function (key) {
                                                var value = String(headers[key] || '').trim();
                                                if (!value) return;
                                                xhr.setRequestHeader(String(key), value);
                                            });
                                        } catch (e) {}
                                    }
                                });
                                hls.loadSource(mediaUrl);
                                hls.attachMedia(video);
                            }
                        }
                    }
                });

                window.addEventListener('error', function (e) {
                    try {
                        var msg = String((e && e.message) || 'dplayer_error');
                        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                            window.ReactNativeWebView.postMessage('dplayer_error:' + msg);
                        }
                    } catch (_) {}
                });
            })();
        </script>
    </body>
</html>`;
};

const pickStreamUrl = (stream: any) => {
    const candidates = [stream?.playbackUrl, stream?.directUrl, stream?.embedUrl];
    for (const candidate of candidates) {
        const url = String(candidate || '').trim();
        if (url) return url;
    }
    return '';
};

const extractEpisodeNumber = (item: any) => {
    const direct = Number(item?.number);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const raw = String(item?.episodeSlug || item?.slug || item?.title || '');
    const match = raw.match(/(\d+(?:\.\d+)?)/);
    if (match) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    return 0;
};

const hasUsableStreamUrl = (stream: any) => {
    // Streams webviewer pueden venir como playable=false para nativo, pero igual son validos para WebView.
    if (stream?.playable === false && stream?.isWebviewer !== true) return false;
    const value = pickStreamUrl(stream);
    return String(value || '').trim().length > 0;
};

const BLOCKED_WEBVIEW_HOST_PATTERNS = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adnxs.com',
    'exoclick.com',
    'popads.net',
    'propellerads.com',
    'hilltopads.net',
    'trafficstars.com',
    'adsterra.com',
    'taboola.com',
    'outbrain.com',
    'onclickperformance.com',
    'highperformanceformat.com',
    'gredirector.com',
    'profitableratecpm.com',
    'fconverts.com',
    'adnimation.com',
    'easyads28.mom',
    'pyppo.com',
    'medixiru.com',
];

const BLOCKED_WEBVIEW_URL_PATTERNS = [
    /^intent:/i,
    /^market:/i,
    /pyppo\.com/i,
    /onclickperformance\.com/i,
    /highperformanceformat\.com/i,
    /gredirector\.com/i,
];

const WEBVIEW_STREAMING_HOST_HINTS = [
    'streamwish',
    'sfastwish',
    'flaswish',
    'vidhide',
    'mp4upload',
    'filemoon',
    'dood',
    'voe',
    'mixdrop',
    'hqq',
    'mega',
    'mytsumi',
    'streamtape',
    'ok.ru',
    'uqload',
];

const UNSTABLE_WEBVIEW_HOST_PATTERNS = [
    'hqq.tv',
    'waaw.to',
    'netu.tv',
    'sfastwish.com',
    'flaswish.com',
    'vidhidevip.com',
    'callistanise.com',
    'hglamioz.com',
    'mdbekjwqa.pw',
    'mega.nz',
];

const UNSTABLE_WEBVIEW_HOST_HINTS = [
    'vidhide',
    'flaswish',
    'sfastwish',
    'callistanise',
    'hglamioz',
    'mdbekjwqa',
    'mega',
];

const getHost = (value: string) => {
    try {
        return new URL(String(value || '').trim()).hostname.toLowerCase();
    } catch (_) {
        return '';
    }
};

const getRootDomain = (host: string) => {
    const parts = String(host || '').toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    return parts.slice(-2).join('.');
};

const isLikelyMediaNavigation = (url: string) => {
    const raw = String(url || '').toLowerCase();
    return /\.(m3u8|mp4|m4v|webm|mov)(\?|#|$)/i.test(raw)
        || raw.includes('/get_video?')
        || raw.includes('mime=video')
        || /[?&](file|src|url)=https?:[^\s]+(m3u8|mp4)/i.test(raw);
};

const isBlockedHost = (host: string) => {
    const safeHost = String(host || '').toLowerCase();
    if (!safeHost) return false;
    return BLOCKED_WEBVIEW_HOST_PATTERNS.some((pattern) => safeHost === pattern || safeHost.endsWith(`.${pattern}`));
};

const isStreamingHost = (host: string) => {
    const safeHost = String(host || '').toLowerCase();
    if (!safeHost) return false;
    return WEBVIEW_STREAMING_HOST_HINTS.some((hint) => safeHost.includes(hint));
};

const isKnownStreamOrCdnHost = (host: string) => {
    const safeHost = String(host || '').toLowerCase();
    if (!safeHost) return false;
    if (isStreamingHost(safeHost)) return true;
    return safeHost.includes('cloudfront')
        || safeHost.includes('cdn')
        || safeHost.includes('akamaized')
        || safeHost.includes('googlevideo');
};

const isUnstableWebViewHost = (host: string) => {
    const safeHost = String(host || '').toLowerCase();
    if (!safeHost) return false;
    if (UNSTABLE_WEBVIEW_HOST_PATTERNS.some((pattern) => safeHost === pattern || safeHost.endsWith(`.${pattern}`))) {
        return true;
    }
    return UNSTABLE_WEBVIEW_HOST_HINTS.some((hint) => safeHost.includes(hint));
};

const isEmbedOnlyHost = (host: string) => {
    const safeHost = String(host || '').toLowerCase();
    if (!safeHost) return false;
    return safeHost.includes('mega.nz')
        || safeHost.includes('hqq.tv')
        || safeHost.includes('waaw.to')
        || safeHost.includes('netu.tv');
};

const isAllowedWebViewNavigation = (currentUrl: string, nextUrl: string) => {
    const next = String(nextUrl || '').trim();
    if (!next) return false;

    if (BLOCKED_WEBVIEW_URL_PATTERNS.some((pattern) => pattern.test(next))) return false;

    if (next.startsWith('about:blank') || next.startsWith('blob:') || next.startsWith('data:')) return true;
    if (next.startsWith('intent:') || next.startsWith('market:') || next.startsWith('mailto:') || next.startsWith('tel:')) return false;
    if (!/^https?:\/\//i.test(next)) return false;

    const nextHost = getHost(next);
    if (isBlockedHost(nextHost)) return false;

    if (isLikelyMediaNavigation(next)) return true;

    const currentHost = getHost(currentUrl);
    if (!currentHost) return true;

    // Stream hosts often redirect through mirrors/CDNs; block unrelated navigations aggressively.
    if (isStreamingHost(currentHost)) {
        const sameHost = currentHost === nextHost;
        const sameRoot = getRootDomain(currentHost) === getRootDomain(nextHost);
        if (sameHost || sameRoot) return true;
        if (isKnownStreamOrCdnHost(nextHost)) return true;
        if (/^https?:\/\/[^/]+\/(e|embed|v)\//i.test(next)) return true;
        return false;
    }

    const sameHost = currentHost === nextHost;
    const sameRoot = getRootDomain(currentHost) === getRootDomain(nextHost);
    return sameHost || sameRoot;
};

const WEBVIEW_GUARD_SCRIPT = `
    (function () {
        try {
            window.alert = function () { return null; };
            window.confirm = function () { return false; };
            window.prompt = function () { return ''; };
            window.onbeforeunload = null;

            var isBlockedUrl = function (value) {
                var raw = String(value || '').trim().toLowerCase();
                if (!raw) return false;
                return raw.indexOf('intent:') === 0
                    || raw.indexOf('market:') === 0
                    || raw.indexOf('mailto:') === 0
                    || raw.indexOf('tel:') === 0
                    || raw.indexOf('pyppo.com') >= 0
                    || raw.indexOf('onclickperformance.com') >= 0
                    || raw.indexOf('highperformanceformat.com') >= 0
                    || raw.indexOf('gredirector.com') >= 0
                    || raw.indexOf('doubleclick.net') >= 0
                    || raw.indexOf('googlesyndication.com') >= 0
                    || raw.indexOf('adsterra') >= 0
                    || raw.indexOf('popads') >= 0
                    || raw.indexOf('exoclick') >= 0;
                return null;
            };
            window.open = function () { return null; };
            if (window.parent) {
                try { window.parent.open = function () { return null; }; } catch (e) {}
            }
            try {
                Object.defineProperty(window, 'opener', { get: function () { return null; }, set: function () {} });
            } catch (e) {}

            document.addEventListener('click', function (event) {
                var node = event.target;
                while (node && node.tagName !== 'A') node = node.parentElement;
                if (!node) return;
                var href = String(node.getAttribute('href') || '').trim();
                var target = String(node.getAttribute('target') || '').trim().toLowerCase();
                if (target === '_blank') {
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
                if (href.startsWith('intent:') || href.startsWith('market:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
                if (isBlockedUrl(href)) {
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
            }, true);

            var removeAdNodes = function () {
                try {
                    var selectors = [
                        'iframe[src*="doubleclick"]',
                        'iframe[src*="googlesyndication"]',
                        'iframe[src*="ad"]',
                        'script[src*="doubleclick"]',
                        'script[src*="googlesyndication"]',
                        '[id*="ad-"]',
                        '[class*="ad-"]',
                        '[class*="ads"]',
                        '.adsbygoogle',
                        '.advertisement',
                        '.popup',
                        '.popunder'
                    ];
                    for (var i = 0; i < selectors.length; i += 1) {
                        var nodes = document.querySelectorAll(selectors[i]);
                        for (var j = 0; j < nodes.length; j += 1) {
                            if (nodes[j] && nodes[j].parentNode) {
                                nodes[j].parentNode.removeChild(nodes[j]);
                            }
                        }
                    }
                } catch (e) {}
            };

            removeAdNodes();
            setTimeout(removeAdNodes, 600);
            setTimeout(removeAdNodes, 1600);

            if (window.MutationObserver) {
                var observer = new MutationObserver(function () { removeAdNodes(); });
                observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
            }
        } catch (e) {}
        true;
    })();
`;

const isStreamPlayable = (stream: any) => {
    if (!stream) return false;
    if (stream?.playable === false) return false;

    const url = pickStreamUrl(stream);
    const host = getHost(url);
    if (isEmbedOnlyHost(host)) return false;

    if (stream?.playable === true) {
        // Defensive: provider flags can be optimistic; keep native only for real media URLs.
        return isNativePlayableUrl(url);
    }

    return isNativePlayableUrl(url);
};

const PlayerScreen: React.FC = () => {
    const { theme } = usePersonalization();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { alertError } = useAlertContext();
    const animeSlug = String(route.params?.animeSlug || '').trim();
    const episodeSlug = String(route.params?.episodeSlug || '').trim();

    const [streams, setStreams] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStreamId, setSelectedStreamId] = useState<string>('');
    const [playerLoading, setPlayerLoading] = useState(true);
    const [lastErrorMessage, setLastErrorMessage] = useState<string>('');
    const [playbackMode, setPlaybackMode] = useState<'webview' | 'native'>('native');
    const [episodeCatalog, setEpisodeCatalog] = useState<any[]>([]);
    const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState<number>(-1);
    const [episodeNavLoading, setEpisodeNavLoading] = useState(false);
    const webViewLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const webViewNavLoopRef = useRef<{ url: string; ts: number; count: number }>({ url: '', ts: 0, count: 0 });
    const webViewLoadLoopRef = useRef<{ host: string; ts: number; count: number }>({ host: '', ts: 0, count: 0 });
    const failedStreamIdsRef = useRef<Set<string>>(new Set());
    const refreshAttemptsRef = useRef(0);

    const pushDebugEvent = useCallback((_label: string, _payload?: any) => {
        // Debug logs disabled in production and development to reduce noise/overhead.
    }, []);

    const loadStreams = useCallback(async () => {
        if (!animeSlug || !episodeSlug) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await getEpisodeStreams(animeSlug, episodeSlug, {
                timeoutMs: 30000,
                ttlMs: 5000,
                forceRefresh: true,
                strictStreams: false,
                streamMode: 'native',
            });
            const nextStreams = Array.isArray(res?.streams) ? res.streams : [];
            setStreams(nextStreams);
            failedStreamIdsRef.current.clear();
            const preferredJkDesu = nextStreams.find((stream) => {
                const server = String(stream?.server || '').toLowerCase();
                const label = String(stream?.label || '').toLowerCase();
                const isDesu = server === 'desu' || label.includes('desu');
                return isDesu && hasUsableStreamUrl(stream);
            });
            const firstNative = nextStreams.find((stream) => isStreamPlayable(stream));
            const firstWeb = nextStreams.find((stream) => hasUsableStreamUrl(stream));
            const firstSelectable = (ENABLE_WEBVIEW_FALLBACK && (FORCE_WEBVIEW_MODE || playbackMode === 'webview'))
                ? (firstWeb || firstNative)
                : (firstNative || firstWeb);
            const initialSelection = preferredJkDesu || firstSelectable;
            setSelectedStreamId(initialSelection?.id || '');
            pushDebugEvent('streams_loaded', {
                total: nextStreams.length,
                playable: nextStreams.filter((s) => isStreamPlayable(s)).length,
                firstPlayableId: initialSelection?.id || null,
                preferredJkDesuId: preferredJkDesu?.id || null,
            });
        } catch (error: any) {
            const message = error?.message || 'No se pudieron cargar los streams.';
            setLastErrorMessage(message);
            pushDebugEvent('streams_load_error', message);
            alertError(error?.message || 'No se pudieron cargar los streams.');
        } finally {
            setLoading(false);
        }
    }, [alertError, animeSlug, episodeSlug, playbackMode, pushDebugEvent]);

    useEffect(() => {
        loadStreams();
    }, [loadStreams]);

    useEffect(() => {
        let cancelled = false;

        const resolveEpisodeCatalog = async () => {
            if (!animeSlug || !episodeSlug) {
                setEpisodeCatalog([]);
                setCurrentEpisodeIndex(-1);
                return;
            }

            setEpisodeNavLoading(true);
            try {
                const allEpisodes: any[] = [];

                for (let page = 1; page <= PLAYER_EPISODES_MAX_PAGES; page += 1) {
                    const payload = await getAnimeEpisodes(animeSlug, { page, limit: PLAYER_EPISODES_PAGE_SIZE });
                    const batch = Array.isArray(payload?.episodes) ? payload.episodes : [];
                    if (!batch.length) break;

                    allEpisodes.push(...batch);
                    if (batch.length < PLAYER_EPISODES_PAGE_SIZE) break;
                }

                const dedupe = new Map<string, any>();
                for (const item of allEpisodes) {
                    const key = String(item?.episodeSlug || item?.slug || '').trim();
                    if (!key) continue;
                    if (!dedupe.has(key)) dedupe.set(key, item);
                }

                const ordered = Array.from(dedupe.values()).sort((a, b) => {
                    const aNum = extractEpisodeNumber(a);
                    const bNum = extractEpisodeNumber(b);
                    if (aNum !== bNum) return aNum - bNum;

                    const aKey = String(a?.episodeSlug || a?.slug || '').toLowerCase();
                    const bKey = String(b?.episodeSlug || b?.slug || '').toLowerCase();
                    return aKey.localeCompare(bKey);
                });

                const currentIdx = ordered.findIndex((item) => {
                    const candidate = String(item?.episodeSlug || item?.slug || '').trim();
                    return candidate === episodeSlug;
                });

                if (!cancelled) {
                    setEpisodeCatalog(ordered);
                    setCurrentEpisodeIndex(currentIdx);
                }
            } catch (_) {
                if (!cancelled) {
                    setEpisodeCatalog([]);
                    setCurrentEpisodeIndex(-1);
                }
            } finally {
                if (!cancelled) {
                    setEpisodeNavLoading(false);
                }
            }
        };

        resolveEpisodeCatalog();

        return () => {
            cancelled = true;
        };
    }, [animeSlug, episodeSlug]);

    const currentEpisode = useMemo(() => {
        if (currentEpisodeIndex < 0 || currentEpisodeIndex >= episodeCatalog.length) return null;
        return episodeCatalog[currentEpisodeIndex] || null;
    }, [currentEpisodeIndex, episodeCatalog]);

    const prevEpisode = useMemo(() => {
        if (currentEpisodeIndex <= 0) return null;
        return episodeCatalog[currentEpisodeIndex - 1] || null;
    }, [currentEpisodeIndex, episodeCatalog]);

    const nextEpisode = useMemo(() => {
        if (currentEpisodeIndex < 0) return null;
        return episodeCatalog[currentEpisodeIndex + 1] || null;
    }, [currentEpisodeIndex, episodeCatalog]);

    const currentEpisodeTitle = useMemo(() => {
        const number = extractEpisodeNumber(currentEpisode);
        const title = String(currentEpisode?.title || '').trim();

        if (title && number > 0) return `Episodio ${number} · ${title}`;
        if (title) return title;
        if (number > 0) return `Episodio ${number}`;
        if (episodeSlug) return `Episodio ${episodeSlug}`;
        return 'Episodio';
    }, [currentEpisode, episodeSlug]);

    const markEpisodeAsWatched = useCallback(async (episode: any) => {
        const currentUserUid = String(auth.currentUser?.uid || '').trim();
        if (!currentUserUid || !animeSlug || !episode) return;

        const targetSlug = String(episode?.episodeSlug || episode?.slug || '').trim();
        if (!targetSlug) return;

        const sourceToken = String(animeSlug || '').includes('__')
            ? String(animeSlug).split('__')[0]
            : 'jkanime';

        const watchedId = `${animeSlug}__${targetSlug}`;
        const watchedRef = doc(db, 'users', currentUserUid, 'watchedAnime', watchedId);
        const inProgressRef = doc(db, 'users', currentUserUid, 'inProgressAnime', animeSlug);

        await Promise.all([
            setDoc(watchedRef, {
                animeSlug,
                episodeSlug: targetSlug,
                episodeTitle: String(episode?.title || '').trim() || `Episodio ${extractEpisodeNumber(episode) || ''}`,
                watchedAt: serverTimestamp(),
                isCompleted: true,
                source: sourceToken,
            }, { merge: true }),
            setDoc(inProgressRef, {
                animeSlug,
                animeTitle: String(route.params?.animeTitle || animeSlug).trim(),
                coverUrl: String(route.params?.cover || '').trim(),
                lastEpisodeSlug: targetSlug,
                lastEpisodeNumber: Number(extractEpisodeNumber(episode) || 0),
                updatedAt: serverTimestamp(),
                source: sourceToken,
            }, { merge: true }),
        ]);
    }, [animeSlug, route.params?.animeTitle, route.params?.cover]);

    const navigateToEpisode = useCallback(async (episode: any) => {
        const targetSlug = String(episode?.episodeSlug || episode?.slug || '').trim();
        if (!targetSlug || targetSlug === episodeSlug) return;

        try {
            await markEpisodeAsWatched(episode);
        } catch (_) {
            // Keep episode switch responsive even if tracking fails.
        }

        navigation.replace('Player', {
            animeSlug,
            episodeSlug: targetSlug,
            startAtMs: 0,
        });
    }, [animeSlug, episodeSlug, markEpisodeAsWatched, navigation]);

    const selectedStream = useMemo(() => {
        if (!selectedStreamId) return null;
        return streams.find((stream) => stream.id === selectedStreamId) || null;
    }, [selectedStreamId, streams]);

    const pickNextPlayableStreamId = useCallback((excludeIds: Set<string>) => {
        const next = streams.find((stream) => {
            const streamId = String(stream?.id || '').trim();
            if (!streamId) return false;
            if (excludeIds.has(streamId)) return false;
            return isStreamPlayable(stream);
        });
        return String(next?.id || '');
    }, [streams]);

    const selectedPlaybackUrl = useMemo(() => pickStreamUrl(selectedStream), [selectedStream]);
    const selectedEmbedUrl = useMemo(
        () => String(selectedStream?.embedUrl || selectedStream?.originPlaybackUrl || selectedStream?.playbackUrl || '').trim(),
        [selectedStream]
    );
    const selectedWebViewUrl = useMemo(
        () => String(
            selectedStream?.embedUrl
            || selectedStream?.originPlaybackUrl
            || selectedStream?.playbackUrl
            || selectedStream?.directUrl
            || ''
        ).trim(),
        [selectedStream]
    );
    const selectedRequestHeaders = useMemo(() => {
        const rawHeaders = selectedStream?.requestHeaders;
        if (!rawHeaders || typeof rawHeaders !== 'object') return undefined;
        const sanitized = Object.entries(rawHeaders).reduce((acc: Record<string, string>, [key, val]) => {
            const safeKey = String(key || '').trim();
            const safeVal = String(val || '').trim();
            if (!safeKey || !safeVal) return acc;
            acc[safeKey] = safeVal;
            return acc;
        }, {});
        return Object.keys(sanitized).length ? sanitized : undefined;
    }, [selectedStream]);
    const selectedStreamIsPlayable = useMemo(
        () => isStreamPlayable(selectedStream),
        [selectedStream]
    );
    
    // Si un stream marcado como webviewer tiene URL nativa (m3u8/mp4), priorizamos nativo para evitar crashes del renderer WebView.
    const hasNativePlaybackCandidate = selectedStreamIsPlayable && !!selectedPlaybackUrl;
    const isStreamRequiringWebView = selectedStream?.isWebviewer === true && !hasNativePlaybackCandidate;

    const useWebViewMode = (ENABLE_WEBVIEW_FALLBACK || isStreamRequiringWebView)
        && (FORCE_WEBVIEW_MODE || playbackMode === 'webview' || isStreamRequiringWebView);
    const shouldUseDPlayer = false;
    const dplayerHtml = useMemo(() => {
        if (!shouldUseDPlayer) return '';
        return buildDPlayerHtml(selectedPlaybackUrl, selectedRequestHeaders);
    }, [selectedPlaybackUrl, selectedRequestHeaders, shouldUseDPlayer]);

    const videoSource = useMemo(() => {
        if (useWebViewMode || !selectedStreamIsPlayable || !selectedPlaybackUrl) return null;
        const isHls = /\.m3u8(?:\?|#|$)/i.test(selectedPlaybackUrl);
        const rawHeaders = selectedStream?.requestHeaders;
        const headers = rawHeaders && typeof rawHeaders === 'object'
            ? Object.entries(rawHeaders).reduce((acc: Record<string, string>, [key, val]) => {
                const safeKey = String(key || '').trim();
                const safeVal = String(val || '').trim();
                if (!safeKey || !safeVal) return acc;
                acc[safeKey] = safeVal;
                return acc;
            }, {})
            : undefined;

        return {
            uri: selectedPlaybackUrl,
            contentType: isHls ? 'hls' as const : 'auto' as const,
            headers,
        };
    }, [selectedPlaybackUrl, selectedStream, selectedStreamIsPlayable, useWebViewMode]);

    const player = useVideoPlayer(videoSource, (instance) => {
        instance.loop = false;
    });

    const playableStreams = useMemo(() => streams.filter((stream) => isStreamPlayable(stream)), [streams]);

    const selectableStreams = useMemo(() => streams.filter((stream) => hasUsableStreamUrl(stream)), [streams]);

    const pickNextWebViewSafeStreamId = useCallback((excludeIds: Set<string>) => {
        const next = streams.find((stream) => {
            const streamId = String(stream?.id || '').trim();
            if (!streamId) return false;
            if (excludeIds.has(streamId)) return false;
            if (!hasUsableStreamUrl(stream)) return false;
            const streamUrl = String(
                stream?.embedUrl
                || stream?.originPlaybackUrl
                || stream?.playbackUrl
                || stream?.directUrl
                || ''
            ).trim();
            const host = getHost(streamUrl);
            return !isUnstableWebViewHost(host);
        });
        return String(next?.id || '');
    }, [streams]);

    const pickNextAnyWebViewStreamId = useCallback((excludeIds: Set<string>) => {
        const next = streams.find((stream) => {
            const streamId = String(stream?.id || '').trim();
            if (!streamId) return false;
            if (excludeIds.has(streamId)) return false;
            return hasUsableStreamUrl(stream);
        });
        return String(next?.id || '');
    }, [streams]);

    useEffect(() => {
        if (!useWebViewMode) return;
        const currentUrl = String(selectedWebViewUrl || '').trim();
        if (!currentUrl) return;

        const host = getHost(currentUrl);
        if (!isUnstableWebViewHost(host)) return;

        const currentId = String(selectedStream?.id || selectedStreamId || '').trim();
        if (currentId) {
            failedStreamIdsRef.current.add(currentId);
        }

        const nextId = pickNextWebViewSafeStreamId(failedStreamIdsRef.current);
        if (nextId && nextId !== currentId) {
            setLastErrorMessage(`Servidor web inestable detectado (${host}). Cambiando automaticamente...`);
            pushDebugEvent('webview_unstable_host_skip', { host, currentId, nextId });
            setSelectedStreamId(nextId);
            return;
        }

        setLastErrorMessage(`Servidor web inestable detectado (${host}). Prueba otro servidor.`);
    }, [pickNextWebViewSafeStreamId, pushDebugEvent, selectedStream?.id, selectedStreamId, selectedWebViewUrl, useWebViewMode]);

    const handleWebViewShouldStart = useCallback((request: any) => {
        const next = String(request?.url || '').trim();
        const current = String((shouldUseDPlayer ? selectedPlaybackUrl : selectedWebViewUrl) || '').trim();

        const now = Date.now();
        const prev = webViewNavLoopRef.current;
        if (next && prev.url === next && (now - prev.ts) < 1200) {
            const nextCount = prev.count + 1;
            webViewNavLoopRef.current = { url: next, ts: now, count: nextCount };
            if (nextCount >= 8) {
                setLastErrorMessage('Se detecto un bucle de redireccion en este servidor. Prueba otro servidor.');
                pushDebugEvent('webview_loop_blocked', { next, count: nextCount });
                return false;
            }
        } else {
            webViewNavLoopRef.current = { url: next, ts: now, count: 1 };
        }

        const allowed = isAllowedWebViewNavigation(current, next);
        if (!allowed) {
            pushDebugEvent('webview_nav_blocked', { current, next });
        }
        return allowed;
    }, [pushDebugEvent, selectedPlaybackUrl, selectedWebViewUrl, shouldUseDPlayer]);

    const handleWebViewLoadError = useCallback((event: any) => {
        const description = String(event?.nativeEvent?.description || '').trim();
        const code = Number(event?.nativeEvent?.code);
        const failingUrl = String(event?.nativeEvent?.url || '').trim();
        const message = description || `Fallo WebView (${Number.isFinite(code) ? code : 'unknown'})`;
        setLastErrorMessage(message);
        pushDebugEvent('webview_error', { code, description, url: failingUrl });
    }, [pushDebugEvent]);

    const fallbackAfterWebViewFailure = useCallback((reason: string, extra?: Record<string, unknown>) => {
        const currentId = String(selectedStream?.id || selectedStreamId || '').trim();
        if (currentId) {
            failedStreamIdsRef.current.add(currentId);
        }

        const nextId = pickNextWebViewSafeStreamId(failedStreamIdsRef.current);
        if (nextId && nextId !== currentId) {
            setLastErrorMessage('Servidor web inestable. Cambiando automaticamente...');
            pushDebugEvent('webview_auto_fallback', { reason, currentId, nextId, ...(extra || {}) });
            setSelectedStreamId(nextId);
            return true;
        }

        setLastErrorMessage('No se pudo estabilizar el reproductor web. Prueba otro servidor.');
        pushDebugEvent('webview_auto_fallback_exhausted', { reason, currentId, ...(extra || {}) });
        return false;
    }, [pickNextWebViewSafeStreamId, pushDebugEvent, selectedStream?.id, selectedStreamId]);

    const handleWebViewRenderProcessGone = useCallback((event: any) => {
        const native = event?.nativeEvent || {};
        const didCrash = Boolean(native?.didCrash);
        const currentId = String(selectedStream?.id || selectedStreamId || '').trim();
        if (currentId) {
            failedStreamIdsRef.current.add(currentId);
        }

        const nextId = pickNextWebViewSafeStreamId(failedStreamIdsRef.current);
        if (nextId && nextId !== currentId) {
            setLastErrorMessage('El render web se reinicio por inestabilidad del servidor. Cambiando automaticamente...');
            pushDebugEvent('webview_render_process_gone_fallback', { didCrash, currentId, nextId });
            setSelectedStreamId(nextId);
            return;
        }

        setLastErrorMessage('El render web se cerro inesperadamente. Prueba otro servidor.');
        pushDebugEvent('webview_render_process_gone', { didCrash, currentId });
    }, [pickNextWebViewSafeStreamId, pushDebugEvent, selectedStream?.id, selectedStreamId]);

    const scheduleWebViewLoadTimeout = useCallback(() => {
        if (webViewLoadTimeoutRef.current) {
            clearTimeout(webViewLoadTimeoutRef.current);
        }
        webViewLoadTimeoutRef.current = setTimeout(() => {
            pushDebugEvent('webview_timeout', { url: selectedWebViewUrl || null });
            fallbackAfterWebViewFailure('timeout', { url: selectedWebViewUrl || null });
        }, 18000);
    }, [fallbackAfterWebViewFailure, pushDebugEvent, selectedWebViewUrl]);

    const clearWebViewLoadTimeout = useCallback(() => {
        if (!webViewLoadTimeoutRef.current) return;
        clearTimeout(webViewLoadTimeoutRef.current);
        webViewLoadTimeoutRef.current = null;
    }, []);

    const clearPlaybackSession = useCallback(() => {
        clearWebViewLoadTimeout();
        webViewNavLoopRef.current = { url: '', ts: 0, count: 0 };
        webViewLoadLoopRef.current = { host: '', ts: 0, count: 0 };
        failedStreamIdsRef.current.clear();
        refreshAttemptsRef.current = 0;

        setPlayerLoading(false);
        setLastErrorMessage('');
        setSelectedStreamId('');
        setStreams([]);
    }, [clearWebViewLoadTimeout]);

    useFocusEffect(
        useCallback(() => {
            return () => {
                clearPlaybackSession();
            };
        }, [clearPlaybackSession])
    );

    useEffect(() => {
        return () => {
            if (webViewLoadTimeoutRef.current) {
                clearTimeout(webViewLoadTimeoutRef.current);
                webViewLoadTimeoutRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        pushDebugEvent('stream_selected', {
            id: selectedStream?.id || null,
            server: selectedStream?.server || null,
            playable: selectedStreamIsPlayable,
            url: selectedPlaybackUrl || null,
        });
    }, [pushDebugEvent, selectedPlaybackUrl, selectedStream, selectedStreamIsPlayable]);

    const hasActiveNativeSource = !useWebViewMode && selectedStreamIsPlayable && !!selectedPlaybackUrl;

    useEffect(() => {
        const sub = player.addListener('statusChange', ({ status, error }) => {
            if (!hasActiveNativeSource) return;

            pushDebugEvent('status_change', {
                status,
                streamId: selectedStream?.id || selectedStreamId || null,
                error: error?.message || null,
            });

            if (status === 'loading') {
                setPlayerLoading(true);
                return;
            }
            if (status === 'readyToPlay') {
                setPlayerLoading(false);
                setLastErrorMessage('');
                refreshAttemptsRef.current = 0;
                return;
            }
            if (status === 'error') {
                setPlayerLoading(false);
                const incomingError = error?.message || 'No se pudo cargar el video dentro de la app.';
                setLastErrorMessage(incomingError);

                const currentId = String(selectedStream?.id || selectedStreamId || '').trim();
                if (currentId) {
                    failedStreamIdsRef.current.add(currentId);
                }

                const nextId = pickNextPlayableStreamId(failedStreamIdsRef.current);
                if (nextId && nextId !== currentId) {
                    setSelectedStreamId(nextId);
                    pushDebugEvent('fallback_next_stream', {
                        failedStreamId: currentId,
                        nextStreamId: nextId,
                    });
                    alertError('Este servidor fallo por conexion. Cambiando automaticamente al siguiente...');
                    return;
                }

                const nextWebId = pickNextAnyWebViewStreamId(failedStreamIdsRef.current);
                if (nextWebId && nextWebId !== currentId) {
                    setPlaybackMode('webview');
                    setSelectedStreamId(nextWebId);
                    pushDebugEvent('fallback_webview_stream', {
                        failedStreamId: currentId,
                        nextStreamId: nextWebId,
                    });
                    alertError('Este servidor nativo no se pudo reproducir. Cambiando a reproductor web...');
                    return;
                }

                if (refreshAttemptsRef.current < 1) {
                    refreshAttemptsRef.current += 1;
                    pushDebugEvent('refresh_streams_after_failures', {
                        attempt: refreshAttemptsRef.current,
                    });
                    alertError('Reintentando con enlaces renovados...');
                    loadStreams();
                    return;
                }

                alertError(incomingError || 'No se pudo cargar el video dentro de la app. Intenta otro episodio.');
            }
        });
        return () => sub.remove();
    }, [alertError, hasActiveNativeSource, loadStreams, pickNextAnyWebViewStreamId, pickNextPlayableStreamId, player, pushDebugEvent, selectedPlaybackUrl, selectedStream?.id, selectedStreamId, selectedStreamIsPlayable]);

    useEffect(() => {
        if (useWebViewMode) {
            setPlayerLoading(false);
            return;
        }
        setPlayerLoading(selectedStreamIsPlayable);
    }, [selectedStreamId, selectedStreamIsPlayable, useWebViewMode]);

    return (
        <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={theme.background} />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={26} color={theme.text} />
                    </TouchableOpacity>
                    <View style={styles.topBarTitleWrap}>
                        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{currentEpisodeTitle}</Text>
                        <Text style={[styles.topBarSubtitle, { color: theme.textMuted }]}>Reproduccion inteligente por servidor</Text>
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.nextEpisodeButton,
                            { backgroundColor: nextEpisode ? theme.accentSoft : 'rgba(255,255,255,0.08)' },
                        ]}
                        onPress={() => navigateToEpisode(nextEpisode)}
                        disabled={!nextEpisode || episodeNavLoading}
                    >
                        {episodeNavLoading ? (
                            <ActivityIndicator size="small" color={theme.accent} />
                        ) : (
                            <>
                                <Text style={[styles.nextEpisodeButtonText, { color: nextEpisode ? theme.text : theme.textMuted }]}>Siguiente</Text>
                                <Ionicons name="play-forward" size={16} color={nextEpisode ? theme.accent : theme.textMuted} />
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator size="large" color={theme.accent} />
                        <Text style={[styles.loadingText, { color: theme.textMuted }]}>Cargando streams...</Text>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <View style={[styles.playerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            {useWebViewMode && !!selectedWebViewUrl ? (
                                <View style={styles.videoWrap}>
                                    <WebView
                                        source={{ uri: selectedWebViewUrl }}
                                        originWhitelist={['https://*', 'http://*']}
                                        style={styles.video}
                                        onLoadStart={() => {
                                            const targetUrl = String(selectedWebViewUrl || '').trim();
                                            const host = getHost(targetUrl);
                                            const now = Date.now();
                                            const prev = webViewLoadLoopRef.current;
                                            if (host && prev.host === host && (now - prev.ts) < 12000) {
                                                webViewLoadLoopRef.current = { host, ts: now, count: prev.count + 1 };
                                            } else {
                                                webViewLoadLoopRef.current = { host, ts: now, count: 1 };
                                            }

                                            if (webViewLoadLoopRef.current.count >= 4) {
                                                fallbackAfterWebViewFailure('load_loop', {
                                                    host,
                                                    count: webViewLoadLoopRef.current.count,
                                                });
                                                return;
                                            }

                                            scheduleWebViewLoadTimeout();
                                            pushDebugEvent('webview_load_start', {
                                                url: targetUrl,
                                                mode: 'webview',
                                                host,
                                                loopCount: webViewLoadLoopRef.current.count,
                                            });
                                        }}
                                        onLoad={() => {
                                            clearWebViewLoadTimeout();
                                            setLastErrorMessage('');
                                            pushDebugEvent('webview_loaded', { url: selectedWebViewUrl, mode: 'webview' });
                                        }}
                                        onLoadEnd={() => {
                                            clearWebViewLoadTimeout();
                                        }}
                                        injectedJavaScriptBeforeContentLoaded={WEBVIEW_GUARD_SCRIPT}
                                        onMessage={(event) => {
                                            const payload = String(event?.nativeEvent?.data || '').trim();
                                            if (payload) pushDebugEvent('webview_message', payload);
                                        }}
                                        onError={handleWebViewLoadError}
                                        onHttpError={handleWebViewLoadError}
                                        onRenderProcessGone={handleWebViewRenderProcessGone}
                                        onShouldStartLoadWithRequest={handleWebViewShouldStart}
                                        setSupportMultipleWindows={false}
                                        javaScriptCanOpenWindowsAutomatically={false}
                                        javaScriptEnabled
                                        domStorageEnabled
                                        thirdPartyCookiesEnabled
                                        sharedCookiesEnabled
                                        allowsInlineMediaPlayback
                                        mediaPlaybackRequiresUserAction={false}
                                        allowsFullscreenVideo
                                        startInLoadingState
                                        renderLoading={() => (
                                            <View style={styles.videoLoadingOverlay}>
                                                <ActivityIndicator size="large" color={theme.accent} />
                                                <Text style={[styles.loadingText, { color: theme.textMuted }]}>Cargando reproductor web...</Text>
                                            </View>
                                        )}
                                    />
                                </View>
                            ) : selectedStreamIsPlayable && selectedPlaybackUrl ? (
                                <View style={styles.videoWrap}>
                                    <VideoView
                                        style={styles.video}
                                        player={player}
                                        nativeControls
                                        contentFit="contain"
                                        onFirstFrameRender={() => setPlayerLoading(false)}
                                    />
                                    {playerLoading && (
                                        <View style={styles.videoLoadingOverlay}>
                                            <ActivityIndicator size="large" color={theme.accent} />
                                            <Text style={[styles.loadingText, { color: theme.textMuted }]}>Cargando video...</Text>
                                        </View>
                                    )}
                                </View>
                            ) : (
                                <View style={styles.emptyPlayerWrap}>
                                    <Ionicons name="videocam-off-outline" size={32} color={theme.textMuted} />
                                    <Text style={[styles.emptyText, { color: theme.textMuted, marginTop: 10 }]}>No hay stream nativo disponible para este episodio.</Text>
                                    {selectedStream?.unavailableReason ? (
                                        <Text style={[styles.emptyText, { color: theme.textMuted, marginTop: 6 }]}>
                                            Motivo: {String(selectedStream.unavailableReason)}
                                        </Text>
                                    ) : null}
                                </View>
                            )}
                        </View>

                        {!useWebViewMode && (
                            <View style={styles.episodeNavRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.episodeNavButton,
                                        { borderColor: theme.border, backgroundColor: prevEpisode ? theme.surface : 'rgba(255,255,255,0.05)' },
                                    ]}
                                    onPress={() => navigateToEpisode(prevEpisode)}
                                    disabled={!prevEpisode || episodeNavLoading}
                                >
                                    <Ionicons name="play-back" size={16} color={prevEpisode ? theme.accent : theme.textMuted} />
                                    <Text style={[styles.episodeNavButtonText, { color: prevEpisode ? theme.text : theme.textMuted }]}>Anterior</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.episodeNavButton,
                                        { borderColor: theme.border, backgroundColor: nextEpisode ? theme.surface : 'rgba(255,255,255,0.05)' },
                                    ]}
                                    onPress={() => navigateToEpisode(nextEpisode)}
                                    disabled={!nextEpisode || episodeNavLoading}
                                >
                                    <Text style={[styles.episodeNavButtonText, { color: nextEpisode ? theme.text : theme.textMuted }]}>Siguiente</Text>
                                    <Ionicons name="play-forward" size={16} color={nextEpisode ? theme.accent : theme.textMuted} />
                                </TouchableOpacity>
                            </View>
                        )}

                        {!!selectedStream && (
                            <View style={[styles.nowPlayingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <View style={styles.nowPlayingHeader}>
                                    <Text style={[styles.nowPlayingTitle, { color: theme.text }]}>Servidor activo</Text>
                                    <View style={[styles.nowPlayingModeBadge, { backgroundColor: useWebViewMode ? theme.accentSoft : `${theme.success}22` }]}>
                                        <Text style={[styles.nowPlayingModeText, { color: useWebViewMode ? theme.accent : theme.success }]}>
                                            {useWebViewMode ? 'WEB' : 'NATIVO'}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={[styles.nowPlayingServer, { color: theme.text }]}>
                                    {String(selectedStream.label || selectedStream.server || 'Desconocido')}
                                </Text>
                                <Text style={[styles.nowPlayingUrl, { color: theme.textMuted }]} numberOfLines={1}>
                                    {selectedWebViewUrl || selectedPlaybackUrl || 'Sin URL disponible'}
                                </Text>
                            </View>
                        )}

                        {ENABLE_WEBVIEW_FALLBACK && !FORCE_WEBVIEW_MODE && (
                            <View style={styles.modeSwitchWrap}>
                                <TouchableOpacity
                                    style={[
                                        styles.modePill,
                                        { borderColor: theme.border, backgroundColor: playbackMode === 'native' ? theme.accentSoft : theme.surface },
                                    ]}
                                    onPress={() => setPlaybackMode('native')}
                                >
                                    <Text style={[styles.modePillText, { color: theme.text }]}>Nativo</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.modePill,
                                        { borderColor: theme.border, backgroundColor: playbackMode === 'webview' ? theme.accentSoft : theme.surface },
                                    ]}
                                    onPress={() => setPlaybackMode('webview')}
                                >
                                    <Text style={[styles.modePillText, { color: theme.text }]}>Web Integrado</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Servidor</Text>
                            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>Elige la fuente de reproduccion</Text>
                        </View>

                        <View style={[styles.pickerWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
                            <Picker
                                selectedValue={selectedStreamId}
                                onValueChange={(value) => {
                                    const nextId = String(value || '').trim();
                                    if (!nextId) return;
                                    failedStreamIdsRef.current.delete(nextId);
                                    setSelectedStreamId(nextId);
                                }}
                                style={[styles.picker, { color: theme.text }]}
                                dropdownIconColor={theme.textMuted}
                            >
                                {selectableStreams.map((stream) => {
                                    const streamId = String(stream.id || '').trim();
                                    const label = `${stream.label || stream.server || 'Stream'} · ${(stream.language || 'sub').toUpperCase()}${stream?.isWebviewer ? ' · WEB' : ''}`;
                                    return (
                                        <Picker.Item
                                            key={streamId || `${stream.server}:${stream.language}`}
                                            label={label}
                                            value={streamId}
                                            color={theme.text}
                                        />
                                    );
                                })}
                            </Picker>
                        </View>

                        {!!selectedStream && (
                            <View style={[styles.streamHintCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <Text style={[styles.streamHintTitle, { color: theme.text }]}>
                                    {selectedStream.label || selectedStream.server || 'Servidor'}
                                </Text>
                                <Text style={[styles.streamHintText, { color: theme.textMuted }]}>
                                    {selectedStream?.isWebviewer ? 'Este servidor se abre en reproductor web integrado.' : 'Este servidor se reproduce en modo nativo.'}
                                </Text>
                            </View>
                        )}

                        {selectableStreams.length === 0 && (
                            <View style={styles.emptyWrap}>
                                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                                    {useWebViewMode ? 'No hay servidores web disponibles ahora.' : 'No hay servidores nativos disponibles ahora.'}
                                </Text>
                            </View>
                        )}

                        {!!lastErrorMessage && (
                            <View style={[styles.errorCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
                                <Text style={[styles.errorCardTitle, { color: theme.text }]}>No se pudo reproducir</Text>
                                <Text style={[styles.errorCardText, { color: theme.textMuted }]}>{lastErrorMessage}</Text>
                            </View>
                        )}
                    </ScrollView>
                )}
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
    backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
    topBarTitleWrap: { flex: 1, minWidth: 0 },
    title: { marginLeft: 12, fontSize: 22, fontFamily: 'Roboto-Bold' },
    topBarSubtitle: { marginLeft: 12, marginTop: 2, fontSize: 12, fontFamily: 'Roboto-Regular' },
    nextEpisodeButton: { minWidth: 108, height: 40, borderRadius: 20, paddingHorizontal: 12, marginLeft: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    nextEpisodeButtonText: { fontSize: 12, fontFamily: 'Roboto-Bold' },
    episodeNavRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    episodeNavButton: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    episodeNavButtonText: { fontSize: 13, fontFamily: 'Roboto-Bold' },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 10, fontSize: 14, fontFamily: 'Roboto-Regular' },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
    playerCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 16, minHeight: 260 },
    videoWrap: { width: '100%', height: 260, backgroundColor: '#000', position: 'relative' },
    video: { width: '100%', height: '100%' },
    videoLoadingOverlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
    emptyPlayerWrap: { minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
    modeSwitchWrap: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    modePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    modePillText: { fontSize: 12, fontFamily: 'Roboto-Bold' },
    sectionHeader: { marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontFamily: 'Roboto-Bold' },
    sectionSubtitle: { marginTop: 4, fontSize: 12, fontFamily: 'Roboto-Regular' },
    pickerWrap: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
    picker: { width: '100%', height: 54 },
    streamHintCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
    streamHintTitle: { fontSize: 14, fontFamily: 'Roboto-Bold' },
    streamHintText: { marginTop: 4, fontSize: 12, fontFamily: 'Roboto-Regular' },
    nowPlayingCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
    nowPlayingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    nowPlayingTitle: { fontSize: 12, fontFamily: 'Roboto-Medium', textTransform: 'uppercase', letterSpacing: 0.6 },
    nowPlayingModeBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    nowPlayingModeText: { fontSize: 10, fontFamily: 'Roboto-Bold', letterSpacing: 0.5 },
    nowPlayingServer: { marginTop: 8, fontSize: 15, fontFamily: 'Roboto-Bold' },
    nowPlayingUrl: { marginTop: 4, fontSize: 11, fontFamily: 'Roboto-Regular' },
    streamRow: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    streamRowDisabled: { opacity: 0.6 },
    streamMeta: { flex: 1, minWidth: 0, paddingRight: 12 },
    streamTitle: { fontSize: 15, fontFamily: 'Roboto-Bold' },
    streamSub: { marginTop: 4, fontSize: 12, fontFamily: 'Roboto-Regular' },
    streamRightSide: { alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
    streamCompatText: { fontSize: 10, fontFamily: 'Roboto-Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
    emptyWrap: { paddingVertical: 28, alignItems: 'center' },
    emptyText: { fontSize: 13, fontFamily: 'Roboto-Regular' },
    errorCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
    errorCardTitle: { fontSize: 13, fontFamily: 'Roboto-Bold' },
    errorCardText: { marginTop: 4, fontSize: 12, fontFamily: 'Roboto-Regular' },
});

export default PlayerScreen;
