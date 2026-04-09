import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { usePersonalization } from '../contexts/PersonalizationContext';
import {
    EASTER_EVENT_ID,
    HALLOWEEN_EVENT_ID,
    XMAS_EVENT_ID,
    VALENTINES_EVENT_ID,
} from '../config/liveEvents';

const { width: W, height: H } = Dimensions.get('window');

// ─── Random helpers ───────────────────────────────────────────────────────────
const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ─── Palettes per event ───────────────────────────────────────────────────────
const EGG_COLORS   = ['#FFD6E9', '#FFF0A8', '#CDEEFE', '#FFDDBF', '#D4F8BE', '#FFE4FF', '#C8F7D0'];
const BAT_COLORS   = ['#6600AA', '#FF6600', '#9B30FF', '#CC4400', '#7711CC'];
const FLAKE_COLORS = ['#FFFFFF', '#E8F4FD', '#FFD700', '#F0FAFF', '#FFF8DC'];
const HEART_COLORS = ['#FF7EAE', '#FF4488', '#FFB6D3', '#FF6699', '#FF91C2'];

// ─── FallingEgg ───────────────────────────────────────────────────────────────
function FallingEgg({ stagger }: { stagger: number }) {
    const y        = useRef(new Animated.Value(-50)).current;
    const sway     = useRef(new Animated.Value(0)).current;
    const leftRef  = useRef(rnd(0.03, 0.90));
    const sizeRef  = useRef(Math.round(rnd(13, 22)));
    const colorRef = useRef(pick(EGG_COLORS));
    const [, bump] = useState(0);

    useEffect(() => {
        let alive = true;
        const swayAmp = rnd(6, 14);
        const swayDur = rnd(900, 1600);
        const swayLoop = Animated.loop(Animated.sequence([
            Animated.timing(sway, { toValue:  swayAmp, duration: swayDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(sway, { toValue: -swayAmp, duration: swayDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        swayLoop.start();

        const fall = () => {
            if (!alive) return;
            leftRef.current  = rnd(0.03, 0.90);
            sizeRef.current  = Math.round(rnd(13, 22));
            colorRef.current = pick(EGG_COLORS);
            y.setValue(-sizeRef.current * 1.5);
            bump(n => n + 1);
            Animated.timing(y, { toValue: H + 20, duration: rnd(4500, 7500), easing: Easing.linear, useNativeDriver: true })
                .start(({ finished }) => { if (finished && alive) fall(); });
        };
        const t = setTimeout(fall, stagger);
        return () => { alive = false; clearTimeout(t); swayLoop.stop(); };
    }, []);

    const s = sizeRef.current;
    return (
        <Animated.View style={{ position: 'absolute', top: 0, left: W * leftRef.current, width: s, height: s * 1.3, borderRadius: s * 0.7, backgroundColor: colorRef.current, opacity: 0.55, transform: [{ translateY: y }, { translateX: sway }], alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: '70%', height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)' }} />
        </Animated.View>
    );
}

// ─── FallingBat ───────────────────────────────────────────────────────────────
function FallingBat({ stagger }: { stagger: number }) {
    const y        = useRef(new Animated.Value(-30)).current;
    const sway     = useRef(new Animated.Value(0)).current;
    const rot      = useRef(new Animated.Value(0)).current;
    const leftRef  = useRef(rnd(0.03, 0.90));
    const sizeRef  = useRef(Math.round(rnd(10, 18)));
    const colorRef = useRef(pick(BAT_COLORS));
    const [, bump] = useState(0);

    useEffect(() => {
        let alive = true;
        const swayAmp = rnd(10, 18);
        const swayDur = rnd(700, 1100);
        const swayLoop = Animated.loop(Animated.sequence([
            Animated.timing(sway, { toValue:  swayAmp, duration: swayDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(sway, { toValue: -swayAmp, duration: swayDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        swayLoop.start();
        const rotLoop = Animated.loop(Animated.sequence([
            Animated.timing(rot, { toValue:  1, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(rot, { toValue: -1, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        rotLoop.start();

        const fall = () => {
            if (!alive) return;
            leftRef.current  = rnd(0.03, 0.90);
            sizeRef.current  = Math.round(rnd(10, 18));
            colorRef.current = pick(BAT_COLORS);
            y.setValue(-sizeRef.current * 2);
            bump(n => n + 1);
            Animated.timing(y, { toValue: H + 20, duration: rnd(4000, 7000), easing: Easing.linear, useNativeDriver: true })
                .start(({ finished }) => { if (finished && alive) fall(); });
        };
        const t = setTimeout(fall, stagger);
        return () => { alive = false; clearTimeout(t); swayLoop.stop(); rotLoop.stop(); };
    }, []);

    const size   = sizeRef.current;
    const color  = colorRef.current;
    const rotate = rot.interpolate({ inputRange: [-1, 1], outputRange: ['-20deg', '20deg'] });
    return (
        <Animated.View style={{ position: 'absolute', top: 0, left: W * leftRef.current, transform: [{ translateY: y }, { translateX: sway }, { rotate }] }}>
            <View style={{ width: size, height: size, backgroundColor: color, opacity: 0.6, transform: [{ rotate: '45deg' }], borderRadius: 2 }} />
            <View style={{ position: 'absolute', top: size * 0.1, left: -size * 0.8, width: size * 0.7, height: size * 0.4, backgroundColor: color, opacity: 0.4, borderRadius: size * 0.3, transform: [{ rotate: '-20deg' }] }} />
            <View style={{ position: 'absolute', top: size * 0.1, left:  size * 1.0, width: size * 0.7, height: size * 0.4, backgroundColor: color, opacity: 0.4, borderRadius: size * 0.3, transform: [{ rotate:  '20deg' }] }} />
        </Animated.View>
    );
}

// ─── FallingSnowflake ─────────────────────────────────────────────────────────
function FallingSnowflake({ stagger }: { stagger: number }) {
    const y        = useRef(new Animated.Value(-30)).current;
    const sway     = useRef(new Animated.Value(0)).current;
    const spin     = useRef(new Animated.Value(0)).current;
    const leftRef  = useRef(rnd(0.03, 0.92));
    const sizeRef  = useRef(Math.round(rnd(8, 14)));
    const colorRef = useRef(pick(FLAKE_COLORS));
    const [, bump] = useState(0);

    useEffect(() => {
        let alive = true;
        const swayAmp = rnd(6, 12);
        const swayDur = rnd(1400, 2200);
        const swayLoop = Animated.loop(Animated.sequence([
            Animated.timing(sway, { toValue:  swayAmp, duration: swayDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(sway, { toValue: -swayAmp, duration: swayDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        swayLoop.start();
        const spinLoop = Animated.loop(
            Animated.timing(spin, { toValue: 1, duration: rnd(2500, 4000), easing: Easing.linear, useNativeDriver: true })
        );
        spinLoop.start();

        const fall = () => {
            if (!alive) return;
            leftRef.current  = rnd(0.03, 0.92);
            sizeRef.current  = Math.round(rnd(8, 14));
            colorRef.current = pick(FLAKE_COLORS);
            y.setValue(-sizeRef.current * 2);
            bump(n => n + 1);
            Animated.timing(y, { toValue: H + 20, duration: rnd(5000, 8000), easing: Easing.linear, useNativeDriver: true })
                .start(({ finished }) => { if (finished && alive) fall(); });
        };
        const t = setTimeout(fall, stagger);
        return () => { alive = false; clearTimeout(t); swayLoop.stop(); spinLoop.stop(); };
    }, []);

    const size   = sizeRef.current;
    const color  = colorRef.current;
    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    return (
        <Animated.View style={{ position: 'absolute', top: 0, left: W * leftRef.current, transform: [{ translateY: y }, { translateX: sway }, { rotate }], alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: size, height: size * 0.22, backgroundColor: color, opacity: 0.7, borderRadius: size * 0.1 }} />
            <View style={{ position: 'absolute', width: size * 0.22, height: size, backgroundColor: color, opacity: 0.7, borderRadius: size * 0.1 }} />
            <View style={{ position: 'absolute', width: size * 0.85, height: size * 0.22, backgroundColor: color, opacity: 0.5, borderRadius: size * 0.1, transform: [{ rotate:  '45deg' }] }} />
            <View style={{ position: 'absolute', width: size * 0.85, height: size * 0.22, backgroundColor: color, opacity: 0.5, borderRadius: size * 0.1, transform: [{ rotate: '-45deg' }] }} />
        </Animated.View>
    );
}

// ─── FloatingHeart ────────────────────────────────────────────────────────────
function FloatingHeart({ stagger }: { stagger: number }) {
    const y        = useRef(new Animated.Value(H * 0.5)).current;
    const opacity  = useRef(new Animated.Value(0)).current;
    const sway     = useRef(new Animated.Value(0)).current;
    const leftRef  = useRef(rnd(0.05, 0.88));
    const sizeRef  = useRef(Math.round(rnd(10, 18)));
    const colorRef = useRef(pick(HEART_COLORS));
    const [, bump] = useState(0);

    useEffect(() => {
        let alive = true;
        const swayAmp = rnd(8, 16);
        const swayDur = rnd(1000, 1600);
        const swayLoop = Animated.loop(Animated.sequence([
            Animated.timing(sway, { toValue:  swayAmp, duration: swayDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(sway, { toValue: -swayAmp, duration: swayDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        swayLoop.start();

        const rise = () => {
            if (!alive) return;
            leftRef.current  = rnd(0.05, 0.88);
            sizeRef.current  = Math.round(rnd(10, 18));
            colorRef.current = pick(HEART_COLORS);
            const dur = rnd(4500, 7000);
            y.setValue(H * 0.5);
            opacity.setValue(0);
            bump(n => n + 1);
            Animated.parallel([
                Animated.timing(y, { toValue: -sizeRef.current * 2, duration: dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.sequence([
                    Animated.timing(opacity, { toValue: 0.65, duration: dur * 0.15, useNativeDriver: true }),
                    Animated.timing(opacity, { toValue: 0.65, duration: dur * 0.60, useNativeDriver: true }),
                    Animated.timing(opacity, { toValue: 0,    duration: dur * 0.25, useNativeDriver: true }),
                ]),
            ]).start(({ finished }) => { if (finished && alive) rise(); });
        };
        const t = setTimeout(rise, stagger);
        return () => { alive = false; clearTimeout(t); swayLoop.stop(); };
    }, []);

    const size  = sizeRef.current;
    const color = colorRef.current;
    return (
        <Animated.View style={{ position: 'absolute', left: W * leftRef.current, width: size, height: size, opacity, transform: [{ translateY: y }, { translateX: sway }] }}>
            <View style={{ position: 'absolute', bottom: 0, left: size * 0.15, width: size * 0.7,  height: size * 0.7,  backgroundColor: color, transform: [{ rotate: '45deg' }], borderRadius: 3 }} />
            <View style={{ position: 'absolute', top: 0, left: 0,  width: size * 0.58, height: size * 0.58, borderRadius: size * 0.29, backgroundColor: color }} />
            <View style={{ position: 'absolute', top: 0, right: 0, width: size * 0.58, height: size * 0.58, borderRadius: size * 0.29, backgroundColor: color }} />
        </Animated.View>
    );
}

// ─── Ambient glow + band hook ─────────────────────────────────────────────────
function useAmbient(active: boolean, reduceMotion: boolean) {
    const glow  = useRef(new Animated.Value(0)).current;
    const drift = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!active || reduceMotion) return;
        const glowLoop = Animated.loop(Animated.sequence([
            Animated.timing(glow,  { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(glow,  { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        const driftLoop = Animated.loop(Animated.sequence([
            Animated.timing(drift, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(drift, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        glowLoop.start();
        driftLoop.start();
        return () => { glowLoop.stop(); driftLoop.stop(); };
    }, [active, reduceMotion]);

    const sparkleOpacity = useMemo(() => glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.38] }), [glow]);
    const bandShift      = useMemo(() => drift.interpolate({ inputRange: [0, 1], outputRange: [-12, 12] }), [drift]);
    return { sparkleOpacity, bandShift, bandShiftNeg: Animated.multiply(bandShift, -1) };
}

// ─── Stagger tables ───────────────────────────────────────────────────────────
const STAGGER_6 = [0, 450, 950, 1450, 1900, 2800];
const STAGGER_7 = [0, 450, 950, 1450, 1900, 2450, 3000];

// ─── Main component ───────────────────────────────────────────────────────────
type Props = { activeEventId: string | null };

export default function EventThemeBackdrop({ activeEventId }: Props) {
    const { settings } = usePersonalization();
    const reduce = settings.reduceMotion;
    const { sparkleOpacity, bandShift, bandShiftNeg } = useAmbient(!!activeEventId, reduce);

    if (!activeEventId) return null;

    // ─── Easter ───────────────────────────────────────────────────────────────
    if (activeEventId === EASTER_EVENT_ID) {
        return (
            <View pointerEvents="none" style={styles.container}>
                <Animated.View style={[styles.topGlow, { opacity: sparkleOpacity, backgroundColor: '#FFF1AF' }]} />
                <Animated.View style={[styles.band, { transform: [{ translateX: bandShift }],    top: 64,  left: -40,  width: 220, height: 36, backgroundColor: 'rgba(198,235,255,0.20)' }]} />
                <Animated.View style={[styles.band, { transform: [{ translateX: bandShiftNeg }], top: 112, right: -30, width: 180, height: 30, backgroundColor: 'rgba(255,210,156,0.18)' }]} />
                {!reduce && STAGGER_6.map((s, i) => <FallingEgg key={i} stagger={s} />)}
                <View style={styles.grassLine} />
                <View style={[styles.bottomMist, { backgroundColor: 'rgba(200,240,200,0.25)' }]} />
            </View>
        );
    }

    // ─── Halloween ────────────────────────────────────────────────────────────
    if (activeEventId === HALLOWEEN_EVENT_ID) {
        return (
            <View pointerEvents="none" style={styles.container}>
                <Animated.View style={[styles.topGlow, { opacity: sparkleOpacity, backgroundColor: '#FF6600', top: -100, left: -30, width: 240, height: 240 }]} />
                <Animated.View style={[styles.band, { transform: [{ translateX: bandShift }],    top: 80,  left: -40,  width: 220, height: 34, backgroundColor: 'rgba(138,43,226,0.18)' }]} />
                <Animated.View style={[styles.band, { transform: [{ translateX: bandShiftNeg }], top: 138, right: -20, width: 180, height: 28, backgroundColor: 'rgba(255,100,0,0.15)' }]} />
                {!reduce && STAGGER_6.map((s, i) => <FallingBat key={i} stagger={s} />)}
                <View style={[styles.bottomMist, { backgroundColor: 'rgba(100,0,150,0.25)' }]} />
            </View>
        );
    }

    // ─── Navidad ──────────────────────────────────────────────────────────────
    if (activeEventId === XMAS_EVENT_ID) {
        return (
            <View pointerEvents="none" style={styles.container}>
                <Animated.View style={[styles.topGlow, { opacity: sparkleOpacity, backgroundColor: '#FFD700', top: -100, left: -50, width: 260, height: 260 }]} />
                <Animated.View style={[styles.band, { transform: [{ translateX: bandShift }],    top: 60,  left: -40,  width: 220, height: 34, backgroundColor: 'rgba(210,40,40,0.15)' }]} />
                <Animated.View style={[styles.band, { transform: [{ translateX: bandShiftNeg }], top: 116, right: -20, width: 180, height: 28, backgroundColor: 'rgba(40,160,70,0.18)' }]} />
                {!reduce && STAGGER_7.map((s, i) => <FallingSnowflake key={i} stagger={s} />)}
                <View style={[styles.bottomMist, { backgroundColor: 'rgba(40,160,60,0.22)' }]} />
            </View>
        );
    }

    // ─── San Valentín ─────────────────────────────────────────────────────────
    if (activeEventId === VALENTINES_EVENT_ID) {
        return (
            <View pointerEvents="none" style={styles.container}>
                <Animated.View style={[styles.topGlow, { opacity: sparkleOpacity, backgroundColor: '#FF69B4', top: -110, left: -35, width: 260, height: 260 }]} />
                <Animated.View style={[styles.topGlow, { opacity: sparkleOpacity, backgroundColor: '#FF2060', top: 80,   right: -60, width: 180, height: 180 }]} />
                <Animated.View style={[styles.band, { transform: [{ translateX: bandShift }],    top: 70,  left: -40,  width: 220, height: 34, backgroundColor: 'rgba(255,80,120,0.20)' }]} />
                <Animated.View style={[styles.band, { transform: [{ translateX: bandShiftNeg }], top: 128, right: -20, width: 180, height: 28, backgroundColor: 'rgba(255,60,80,0.17)' }]} />
                {!reduce && STAGGER_6.map((s, i) => <FloatingHeart key={i} stagger={s} />)}
                <View style={[styles.grassLine, { backgroundColor: 'rgba(255,80,120,0.42)' }]} />
                <View style={[styles.bottomMist, { backgroundColor: 'rgba(255,80,120,0.22)' }]} />
            </View>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 3,
    },
    topGlow: {
        position: 'absolute',
        top: -120,
        left: -40,
        width: 280,
        height: 280,
        borderRadius: 160,
        opacity: 0.5,
    },
    band: {
        position: 'absolute',
        borderRadius: 18,
    },
    grassLine: {
        position: 'absolute',
        bottom: 78,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: 'rgba(160,222,134,0.55)',
    },
    bottomMist: {
        position: 'absolute',
        bottom: -40,
        left: 12,
        width: W * 0.78,
        height: 120,
        borderRadius: 80,
        opacity: 0.3,
    },
});
