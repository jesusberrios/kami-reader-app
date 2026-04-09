import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePersonalization } from '../contexts/PersonalizationContext';
import { AnimState, MoodState, resolveCompanionProfile } from '../config/companionPets';
import { auth } from '../firebase/config';
import { getUserReadingStats } from '../services/readingStatsService';

type Props = {
    visible: boolean;
    bottomOffset?: number;
};

const PET_LINES = [
    'Sigue asi, cada capitulo te hace mas fuerte.',
    'Hoy el evento esta brillante.',
    'Tus monedas crecen capitulo a capitulo.',
    'Recuerda descansar los ojos, senpai.',
    'Que buen ritmo de lectura llevas.',
];

type PetStats = {
    totalRead: number;
    hoursSpent: number;
    favorites: number;
    coinsEarned: number;
};

const buildContextLines = (stats: PetStats | null, mood: MoodState): string[] => {
    if (!stats) return [];
    const lines: string[] = [];
    const { totalRead, hoursSpent, favorites, coinsEarned } = stats;
    const h = Math.floor(hoursSpent);
    if (mood === 'happy') {
        if (totalRead >= 1) lines.push(`${totalRead} manga${totalRead > 1 ? 's' : ''} completados, que crack.`);
        if (h >= 1) lines.push(`${h} hora${h !== 1 ? 's' : ''} de lectura acumuladas, incredible.`);
        if (favorites >= 5) lines.push(`${favorites} favoritos guardados, buen gusto.`);
        if (coinsEarned >= 10) lines.push(`${coinsEarned} monedas ganadas leyendo, sigue asi.`);
    } else if (mood === 'curious') {
        if (totalRead >= 1) lines.push(`${totalRead} titulo${totalRead > 1 ? 's' : ''} en tu historial... cuantos mas vendran?`);
        if (h >= 1) lines.push(`Llevas ${h}h leyendo, ya eres todo un veterano.`);
        if (favorites >= 1) lines.push(`${favorites} favorito${favorites > 1 ? 's' : ''} guardados, cuales son tus generos?`);
    } else if (mood === 'sleepy') {
        if (totalRead >= 1) lines.push(`${totalRead} manga${totalRead > 1 ? 's' : ''} y contando... mereces un descanso.`);
        if (h >= 2) lines.push(`${h} horas de lectura hoy... yo tambien bostezo.`);
    }
    return lines;
};

const SPRITE_SCALE = 0.55;

const toPingPongFrames = (frames: number[]) => {
    if (frames.length <= 2) return frames;
    return [...frames, ...frames.slice(1, -1).reverse()];
};

export default function EventCompanionPet({ visible, bottomOffset = 18 }: Props) {
    const { theme, settings } = usePersonalization();
    const companionProfile = useMemo(() => resolveCompanionProfile(settings.selectedCompanionKey), [settings.selectedCompanionKey]);
    const [lineIndex, setLineIndex] = useState(0);
    const [mood, setMood] = useState<MoodState>('curious');
    const [animState, setAnimState] = useState<AnimState>('idle');
    const [frameIndex, setFrameIndex] = useState(0);
    const [petStats, setPetStats] = useState<PetStats | null>(null);
    const walkX = useRef(new Animated.Value(16)).current;
    const bob = useRef(new Animated.Value(0)).current;
    const hop = useRef(new Animated.Value(0)).current;
    const speechOpacity = useRef(new Animated.Value(0)).current;
    const speechY = useRef(new Animated.Value(4)).current;
    const [facingRight, setFacingRight] = useState(true);
    const [showSpeech, setShowSpeech] = useState(false);
    const isAirborneRef = useRef(false);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;
        getUserReadingStats(user.uid)
            .then((s) => setPetStats({ totalRead: s.totalRead, hoursSpent: s.hoursSpent, favorites: s.favorites, coinsEarned: s.coinsEarned }))
            .catch(() => {});
    }, []);

    const currentLine = useMemo(() => {
        const profileLines = companionProfile.linesByMood[mood];
        const contextLines = buildContextLines(petStats, mood);
        const pool = [...profileLines, ...contextLines].filter((l) => l.length > 0);
        const source = pool.length ? pool : PET_LINES;
        return source[lineIndex % source.length];
    }, [companionProfile, lineIndex, mood, petStats]);
    const currentAnim = companionProfile.anims[animState];
    const playbackFrames = useMemo(
        () => (currentAnim.loopMode === 'pingpong' ? toPingPongFrames(currentAnim.frameIndices) : currentAnim.frameIndices),
        [currentAnim]
    );
    const currentFrame = playbackFrames[frameIndex % playbackFrames.length];

    const spriteStyle = useMemo(() => {
        const source = Image.resolveAssetSource(currentAnim.source);
        const frameWidth = currentAnim.frameWidth ?? source.width / currentAnim.sheetFrames;
        const frameHeight = currentAnim.frameHeight ?? source.height;
        const yOffset = companionProfile.yOffset ?? 0;
        return {
            width: frameWidth * currentAnim.sheetFrames * SPRITE_SCALE,
            height: frameHeight * SPRITE_SCALE,
            transform: [
                { translateX: -currentFrame * frameWidth * SPRITE_SCALE },
                { translateY: yOffset },
            ],
        };
    }, [currentAnim, currentFrame, companionProfile]);

    const spriteViewport = useMemo(() => {
        const source = Image.resolveAssetSource(currentAnim.source);
        const frameWidth = currentAnim.frameWidth ?? source.width / currentAnim.sheetFrames;
        const frameHeight = currentAnim.frameHeight ?? source.height;
        return {
            width: frameWidth * SPRITE_SCALE,
            height: frameHeight * SPRITE_SCALE,
        };
    }, [currentAnim]);

    const revealSpeech = () => {
        setShowSpeech(true);
        speechOpacity.setValue(0);
        speechY.setValue(4);
        Animated.parallel([
            Animated.timing(speechOpacity, {
                toValue: 1,
                duration: 220,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
            Animated.timing(speechY, {
                toValue: 0,
                duration: 220,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start(() => {
            setTimeout(() => {
                Animated.parallel([
                    Animated.timing(speechOpacity, {
                        toValue: 0,
                        duration: 260,
                        easing: Easing.in(Easing.quad),
                        useNativeDriver: true,
                    }),
                    Animated.timing(speechY, {
                        toValue: 3,
                        duration: 260,
                        easing: Easing.in(Easing.quad),
                        useNativeDriver: true,
                    }),
                ]).start(() => setShowSpeech(false));
            }, 2200);
        });
    };

    useEffect(() => {
        const fps = settings.reduceMotion ? currentAnim.fpsReduced : currentAnim.fps;
        const intervalMs = Math.max(90, Math.round(1000 / fps));
        const timer = setInterval(() => {
            setFrameIndex((prev) => (prev + 1) % playbackFrames.length);
        }, intervalMs);

        return () => clearInterval(timer);
    }, [animState, currentAnim, playbackFrames.length, settings.reduceMotion]);

    useEffect(() => {
        setFrameIndex(0);
    }, [animState]);

    useEffect(() => {
        setLineIndex(0);
        setFrameIndex(0);
        setMood('curious');
        setAnimState('idle');
    }, [companionProfile]);

    useEffect(() => {
        if (!visible) return;

        let cancelled = false;
        const moods: MoodState[] = ['curious', 'happy', 'sleepy'];

        const rotateMood = () => {
            if (cancelled) return;
            const next = moods[Math.floor(Math.random() * moods.length)];
            setMood(next);
            const nextMs = settings.reduceMotion
                ? 20000 + Math.round(Math.random() * 8000)
                : 14000 + Math.round(Math.random() * 8000);
            setTimeout(rotateMood, nextMs);
        };

        const firstMs = settings.reduceMotion
            ? 16000 + Math.round(Math.random() * 5000)
            : 11000 + Math.round(Math.random() * 5000);
        const timer = setTimeout(rotateMood, firstMs);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [settings.reduceMotion, visible]);

    useEffect(() => {
        if (!visible) return;

        const screenWidth = Dimensions.get('window').width;
        const minX = 10;
        const maxX = Math.max(10, screenWidth - 96);

        let cancelled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const rand = (min: number, max: number) => min + Math.random() * (max - min);
        const queue = (cb: () => void, delayMs: number) => {
            const timer = setTimeout(cb, delayMs);
            timers.push(timer);
        };

        const queueRestWindow = (minMs: number, maxMs: number) => {
            setAnimState('idle');
            walkX.stopAnimation();
            queue(runPatrol, Math.round(rand(minMs, maxMs)));
        };

        const runPatrol = () => {
            if (cancelled || isAirborneRef.current) return;

            walkX.stopAnimation((currentX) => {
                if (cancelled || isAirborneRef.current) return;

                let targetX = rand(minX, maxX);
                if (Math.abs(targetX - currentX) < 28) {
                    targetX = targetX > currentX ? Math.min(maxX, currentX + 64) : Math.max(minX, currentX - 64);
                }

                const distance = Math.abs(targetX - currentX);
                const moodSpeedFactor = mood === 'sleepy' ? 0.8 : mood === 'happy' ? 1.08 : 1;
                const baseMin = settings.reduceMotion ? 22 : 28;
                const baseMax = settings.reduceMotion ? 30 : 40;
                const pxPerSecond = rand(baseMin, baseMax) * moodSpeedFactor;
                const duration = Math.max(1200, Math.round((distance / pxPerSecond) * 1000));

                setFacingRight(targetX >= currentX);
                setAnimState('walk');

                Animated.timing(walkX, {
                    toValue: targetX,
                    duration,
                    easing: Easing.bezier(0.3, 0.04, 0.36, 1),
                    useNativeDriver: true,
                }).start(({ finished }) => {
                    if (!finished || cancelled || isAirborneRef.current) return;
                    setAnimState('idle');

                    const longRestChance = mood === 'sleepy' ? 0.58 : mood === 'curious' ? 0.28 : 0.35;
                    if (Math.random() < longRestChance) {
                        const restMin = settings.reduceMotion ? 5200 : 3800;
                        const restMax = settings.reduceMotion ? 9800 : 7600;
                        queue(runPatrol, Math.round(rand(restMin, restMax)));
                        return;
                    }

                    const pauseMin = mood === 'sleepy' ? 1800 : 1100;
                    const pauseMax = mood === 'sleepy' ? 3400 : 2200;
                    queue(runPatrol, Math.round(rand(settings.reduceMotion ? pauseMin + 600 : pauseMin, settings.reduceMotion ? pauseMax + 900 : pauseMax)));
                });
            });
        };

        const performHop = (height = 10) => {
            if (cancelled || isAirborneRef.current) return;
            isAirborneRef.current = true;
            walkX.stopAnimation();
            setAnimState('jump');

            Animated.sequence([
                Animated.timing(hop, {
                    toValue: -height,
                    duration: settings.reduceMotion ? 300 : 230,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(hop, {
                    toValue: -2,
                    duration: settings.reduceMotion ? 220 : 140,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                if (cancelled) return;
                setAnimState('fall');
                Animated.timing(hop, {
                    toValue: 0,
                    duration: settings.reduceMotion ? 320 : 240,
                    easing: Easing.in(Easing.cubic),
                    useNativeDriver: true,
                }).start(() => {
                    isAirborneRef.current = false;
                    if (cancelled) return;
                    setAnimState('idle');
                    queue(runPatrol, Math.round(rand(320, 820)));
                });
            });
        };

        const bobLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(bob, {
                    toValue: -1.6,
                    duration: settings.reduceMotion ? 920 : 560,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(bob, {
                    toValue: 0,
                    duration: settings.reduceMotion ? 920 : 560,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );

        queue(runPatrol, 180);
        bobLoop.start();
        revealSpeech();

        const runBehavior = () => {
            if (cancelled) return;
            const behaviorRoll = Math.random();
            const hopChance = mood === 'happy' ? 0.27 : mood === 'sleepy' ? 0.1 : 0.18;
            const lookAroundChance = mood === 'curious' ? 0.23 : 0.16;

            if (behaviorRoll < hopChance && !settings.reduceMotion) {
                performHop(10 + Math.round(Math.random() * 4));
            }

            if (behaviorRoll >= hopChance && behaviorRoll < hopChance + 0.16) {
                queueRestWindow(
                    settings.reduceMotion ? 4800 : 3200,
                    settings.reduceMotion ? 9800 : 6800,
                );
            }

            if (behaviorRoll >= hopChance + 0.16 && behaviorRoll < hopChance + 0.16 + lookAroundChance) {
                setFacingRight((prev) => !prev);
            }

            if (behaviorRoll > 0.58) {
                setLineIndex((prev) => prev + 1);
                revealSpeech();
            }

            queue(runBehavior, Math.round(rand(settings.reduceMotion ? 6200 : 4200, settings.reduceMotion ? 9800 : 7600)));
        };

        queue(runBehavior, 3000);

        return () => {
            cancelled = true;
            isAirborneRef.current = false;
            walkX.stopAnimation();
            bobLoop.stop();
            hop.stopAnimation();
            timers.forEach(clearTimeout);
        };
    }, [bob, hop, mood, settings.reduceMotion, visible, walkX]);

    if (!visible) return null;

    return (
        <Animated.View
            pointerEvents="box-none"
            style={[
                styles.wrapper,
                {
                    bottom: Math.max(0, bottomOffset - 6),
                    transform: [
                        { translateX: walkX },
                        { translateY: animState === 'walk' ? Animated.add(bob, hop) : hop },
                    ],
                },
            ]}
        >
            {showSpeech && (
                <Animated.View
                    style={[
                        styles.speechBubble,
                        {
                            backgroundColor: theme.card,
                            borderColor: theme.border,
                            opacity: speechOpacity,
                            transform: [{ translateY: speechY }],
                        },
                    ]}
                >
                    <Text style={[styles.speechText, { color: theme.text }]}>{currentLine}</Text>
                </Animated.View>
            )}

            <TouchableOpacity
                activeOpacity={0.88}
                style={styles.petTouchable}
                onPress={() => {
                    setLineIndex((prev) => prev + 1);
                    revealSpeech();
                    if (!settings.reduceMotion) {
                        isAirborneRef.current = true;
                        setAnimState('jump');
                        Animated.sequence([
                            Animated.timing(hop, {
                                toValue: -12,
                                duration: 240,
                                easing: Easing.out(Easing.cubic),
                                useNativeDriver: true,
                            }),
                            Animated.timing(hop, {
                                toValue: 0,
                                duration: 300,
                                easing: Easing.in(Easing.cubic),
                                useNativeDriver: true,
                            }),
                        ]).start(() => {
                            isAirborneRef.current = false;
                            setAnimState('idle');
                        });
                    }
                }}
            >
                <View style={[styles.groundShadow, { backgroundColor: theme.border }]} />
                <View style={[styles.petAvatar, !facingRight && styles.petAvatarFlipped]}>
                    <View style={[styles.spriteViewport, spriteViewport]}>
                        <Image source={currentAnim.source} style={spriteStyle} resizeMode="cover" />
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        left: 0,
        zIndex: 1000,
        alignItems: 'flex-start',
    },
    speechBubble: {
        maxWidth: 200,
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 6,
    },
    speechText: {
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Roboto-Regular',
    },
    petTouchable: {
        width: 76,
        height: 76,
        alignItems: 'center',
        justifyContent: 'center',
    },
    groundShadow: {
        position: 'absolute',
        bottom: 4,
        width: 32,
        height: 7,
        borderRadius: 6,
        opacity: 0.38,
    },
    petAvatar: {
        width: 76,
        height: 76,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    petAvatarFlipped: {
        transform: [{ scaleX: -1 }],
    },
    spriteViewport: {
        overflow: 'hidden',
        borderRadius: 6,
    },
});
