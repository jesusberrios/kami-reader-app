import React, { useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Animated,
    Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase/config';
import { useNavigation, useRoute } from '@react-navigation/native';
import { usePersonalization } from '../contexts/PersonalizationContext';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type TutorialStep = {
    tag: string;
    title: string;
    subtitle: string;
    description: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    highlights: string[];
    whereToUse: string;
};

const TUTORIAL_STEPS: TutorialStep[] = [
    {
        tag: 'Inicio rapido',
        title: 'Bienvenido a Kami Reader',
        subtitle: 'Manga y anime en una sola app',
        description: 'Explora estrenos, entra al capitulo o episodio en segundos y conserva tu avance automaticamente.',
        icon: 'book-open-page-variant-outline',
        highlights: ['Busqueda rapida', 'Ultimos lanzamientos', 'Progreso guardado'],
        whereToUse: 'Home y Biblioteca',
    },
    {
        tag: 'En vivo',
        title: 'Tu actividad se actualiza al instante',
        subtitle: 'Sin recargar pantallas',
        description: 'Home, Favoritos y En curso reflejan cambios en tiempo real para manga y anime.',
        icon: 'lightning-bolt-outline',
        highlights: ['En curso en tiempo real', 'Favoritos combinados', 'Sincronizacion inmediata'],
        whereToUse: 'Home, Favoritos y En curso',
    },
    {
        tag: 'Reader',
        title: 'Lectura inteligente',
        subtitle: 'Controla el ritmo como prefieras',
        description: 'Cambia de capitulo con gestos o avance automatico. Elige modo horizontal o vertical desde Personalizacion.',
        icon: 'gesture-swipe',
        highlights: ['Cambio de capitulo por gesto', 'Modo vertical con avance al final', 'HUD ocultable para lectura limpia'],
        whereToUse: 'Reader + Personalizacion',
    },
    {
        tag: 'Player',
        title: 'Reproductor robusto',
        subtitle: 'Cambio automatico de servidor',
        description: 'El player prioriza enlaces nativos y cambia de servidor cuando detecta errores para evitar bloqueos.',
        icon: 'play-circle-outline',
        highlights: ['Fallback automatico', 'Mejor estabilidad', 'Compatibilidad por servidor'],
        whereToUse: 'Detalles de anime y Player',
    },
    {
        tag: 'Cuenta',
        title: 'Perfil, estadisticas y logros',
        subtitle: 'Progreso completo de manga y anime',
        description: 'Tu perfil muestra series completadas, tiempo total y favoritos combinados para medir tu avance real.',
        icon: 'account-cog-outline',
        highlights: ['Favoritos manga + anime', 'Logros actualizados', 'Perfil editable'],
        whereToUse: 'Perfil y Home',
    },
];

const TutorialScreen = () => {
    const { theme } = usePersonalization();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const scrollRef = useRef<ScrollView>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const stepAnim = useRef(new Animated.Value(0)).current;
    const blob1Anim = useRef(new Animated.Value(0)).current;
    const blob2Anim = useRef(new Animated.Value(0)).current;
    const blob3Anim = useRef(new Animated.Value(0)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;

    const isLast = useMemo(() => currentIndex === TUTORIAL_STEPS.length - 1, [currentIndex]);
    const isSmallScreen = useMemo(() => screenHeight < 760, []);
    const currentStep = TUTORIAL_STEPS[currentIndex];
    const progressTrackWidth = useMemo(() => Math.min(220, screenWidth - 110), []);
    const progressThumbWidth = useMemo(
        () => Math.max(28, progressTrackWidth / TUTORIAL_STEPS.length),
        [progressTrackWidth]
    );

    React.useEffect(() => {
        stepAnim.setValue(0);
        Animated.timing(stepAnim, {
            toValue: 1,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [currentIndex, stepAnim]);

    React.useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: currentIndex,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [currentIndex, progressAnim]);

    React.useEffect(() => {
        const makeLoop = (value: Animated.Value, duration: number, delay: number) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(value, {
                        toValue: 1,
                        duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(value, {
                        toValue: 0,
                        duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            );
        };

        const loop1 = makeLoop(blob1Anim, 5200, 0);
        const loop2 = makeLoop(blob2Anim, 6100, 400);
        const loop3 = makeLoop(blob3Anim, 7000, 900);
        loop1.start();
        loop2.start();
        loop3.start();

        return () => {
            loop1.stop();
            loop2.stop();
            loop3.stop();
        };
    }, [blob1Anim, blob2Anim, blob3Anim]);

    const stepTranslateY = stepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [16, 0],
    });
    const stepOpacity = stepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.45, 1],
    });
    const stepScale = stepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.985, 1],
    });

    const blob1TranslateY = blob1Anim.interpolate({
        inputRange: [0, 1],
        outputRange: [-8, 10],
    });
    const blob1Opacity = blob1Anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.14, 0.28],
    });
    const blob2TranslateX = blob2Anim.interpolate({
        inputRange: [0, 1],
        outputRange: [-10, 12],
    });
    const blob2Opacity = blob2Anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.11, 0.24],
    });
    const blob3Scale = blob3Anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.92, 1.05],
    });
    const blob3Opacity = blob3Anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.09, 0.2],
    });
    const progressTranslateX = progressAnim.interpolate({
        inputRange: [0, TUTORIAL_STEPS.length - 1],
        outputRange: [0, progressTrackWidth - progressThumbWidth],
    });

    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const x = event.nativeEvent.contentOffset.x;
        const index = Math.round(x / screenWidth);
        if (index !== currentIndex) {
            setCurrentIndex(index);
        }
    };

    const goToStep = (index: number) => {
        scrollRef.current?.scrollTo({ x: index * screenWidth, animated: true });
        setCurrentIndex(index);
    };

    const handleNext = () => {
        if (isLast) return;
        goToStep(Math.min(currentIndex + 1, TUTORIAL_STEPS.length - 1));
    };

    const finishTutorial = async () => {
        const user = auth.currentUser;
        if (user) {
            const tutorialKey = `tutorialSeen:${user.uid}`;
            await AsyncStorage.setItem(tutorialKey, '1');
        }
        if (route.params?.manual && navigation.canGoBack()) {
            navigation.goBack();
            return;
        }

        navigation.reset({
            index: 0,
            routes: [{ name: 'Main' }],
        });
    };

    return (
        <LinearGradient
            colors={[theme.background, theme.backgroundSecondary, theme.background]}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <View pointerEvents="none" style={styles.bgLayer}>
                <Animated.View
                    style={[
                        styles.bgBlob,
                        styles.bgBlobOne,
                        {
                            backgroundColor: theme.accent,
                            opacity: blob1Opacity,
                            transform: [{ translateY: blob1TranslateY }],
                        },
                    ]}
                />
                <Animated.View
                    style={[
                        styles.bgBlob,
                        styles.bgBlobTwo,
                        {
                            backgroundColor: theme.warning,
                            opacity: blob2Opacity,
                            transform: [{ translateX: blob2TranslateX }],
                        },
                    ]}
                />
                <Animated.View
                    style={[
                        styles.bgBlob,
                        styles.bgBlobThree,
                        {
                            backgroundColor: theme.accentSoft,
                            opacity: blob3Opacity,
                            transform: [{ scale: blob3Scale }],
                        },
                    ]}
                />
            </View>

            <View style={[styles.header, { paddingTop: Math.max(8, insets.top * 0.2) }]}>
                <View>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>Tutorial interactivo</Text>
                    <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>Paso {currentIndex + 1} de {TUTORIAL_STEPS.length}</Text>
                </View>
                <TouchableOpacity onPress={finishTutorial} hitSlop={10}>
                    <Text style={[styles.skipText, { color: theme.textMuted }]}>Saltar</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.carouselContainer}>
            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onScroll}
                bounces={false}
            >
                {TUTORIAL_STEPS.map((step) => (
                    <View key={step.title} style={styles.slide}>
                        <ScrollView
                            style={styles.slideScroll}
                            contentContainerStyle={styles.slideScrollContent}
                            showsVerticalScrollIndicator={false}
                            bounces={false}
                            nestedScrollEnabled
                        >
                            <Animated.View
                                style={[
                                    styles.stepAnimatedWrap,
                                    {
                                        opacity: stepOpacity,
                                        transform: [{ translateY: stepTranslateY }, { scale: stepScale }],
                                    },
                                ]}
                            >
                                <View style={[styles.glassCard, { backgroundColor: theme.surface + 'CC', borderColor: theme.border }]}> 
                                    <View style={[styles.tagPill, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}> 
                                        <Text style={[styles.tagText, { color: theme.accent }]}>{step.tag}</Text>
                                    </View>

                                    <View style={[styles.iconWrapper, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}> 
                                        <MaterialCommunityIcons name={step.icon} size={isSmallScreen ? 50 : 60} color={theme.accent} />
                                    </View>

                                    <Text style={[styles.title, { color: theme.text }, isSmallScreen && styles.titleSmall]}>{step.title}</Text>
                                    <Text style={[styles.subtitle, { color: theme.textMuted }, isSmallScreen && styles.subtitleSmall]}>{step.subtitle}</Text>
                                    <Text style={[styles.description, { color: theme.textMuted }, isSmallScreen && styles.descriptionSmall]}>{step.description}</Text>

                                    <View style={styles.highlightsRow}>
                                        {step.highlights.map((item) => (
                                            <View key={item} style={[styles.highlightChip, { borderColor: theme.border, backgroundColor: theme.surface + 'AA' }]}> 
                                                <Text style={[styles.highlightText, { color: theme.text }]}>{item}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                <View style={[styles.useCaseCard, { backgroundColor: theme.surface + 'B3', borderColor: theme.border }]}> 
                                    <Text style={[styles.useCaseTitle, { color: theme.accent }]}>Para que sirve</Text>
                                    <Text style={[styles.useCaseValue, { color: theme.text }]}>{step.whereToUse}</Text>
                                </View>
                            </Animated.View>
                        </ScrollView>
                    </View>
                ))}
            </ScrollView>
            </View>

            <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 6) }]}>
                <View style={styles.progressRow}>
                    <Text style={[styles.progressText, { color: theme.textMuted }]}>Progreso</Text>
                    <Text style={[styles.progressText, { color: theme.textMuted }]}>{currentIndex + 1}/{TUTORIAL_STEPS.length}</Text>
                </View>
                <View style={[styles.progressTrack, { width: progressTrackWidth, backgroundColor: theme.surface + 'D9' }]}>
                    <Animated.View
                        style={[
                            styles.progressThumb,
                            {
                                width: progressThumbWidth,
                                backgroundColor: theme.accent,
                                transform: [{ translateX: progressTranslateX }],
                            },
                        ]}
                    />
                </View>

                <View style={styles.dotsRow}>
                    {TUTORIAL_STEPS.map((_, index) => (
                        <View
                            key={index}
                            style={[styles.dot, { backgroundColor: theme.surface }, index === currentIndex && styles.dotActive, index === currentIndex && { backgroundColor: theme.accent }]}
                        />
                    ))}
                </View>

                <View style={styles.actionsRow}>
                    <TouchableOpacity
                        style={[
                            styles.secondaryButton,
                            { borderColor: theme.border, backgroundColor: theme.surface + 'B3' },
                            currentIndex === 0 && styles.disabledButton,
                        ]}
                        onPress={() => goToStep(Math.max(0, currentIndex - 1))}
                        activeOpacity={0.85}
                        disabled={currentIndex === 0}
                    >
                        <Text style={[styles.secondaryButtonText, { color: currentIndex === 0 ? theme.textMuted : theme.text }]}>Anterior</Text>
                    </TouchableOpacity>

                    {isLast ? (
                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={finishTutorial} activeOpacity={0.85}>
                            <Text style={[styles.primaryButtonText, { color: theme.text }]}>Comenzar</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={handleNext} activeOpacity={0.85}>
                            <Text style={[styles.primaryButtonText, { color: theme.text }]}>Siguiente</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={[styles.quickHint, { backgroundColor: theme.surface + '99', borderColor: theme.border }]}> 
                    <MaterialCommunityIcons name="gesture-swipe-horizontal" size={18} color={theme.textMuted} />
                    <Text style={[styles.quickHintText, { color: theme.textMuted }]}>Desliza para avanzar o retroceder entre funciones</Text>
                </View>
                {currentStep?.tag === 'Reader' && (
                    <View style={[styles.quickHint, { backgroundColor: theme.accentSoft + '80', borderColor: theme.accent }]}> 
                        <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={theme.accent} />
                        <Text style={[styles.quickHintText, { color: theme.text }]}>Tip: usa modo vertical para lectura continua y horizontal para control manual</Text>
                    </View>
                )}
            </View>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    bgLayer: {
        ...StyleSheet.absoluteFillObject,
    },
    bgBlob: {
        position: 'absolute',
        borderRadius: 999,
    },
    bgBlobOne: {
        width: 240,
        height: 240,
        top: -70,
        right: -55,
    },
    bgBlobTwo: {
        width: 210,
        height: 210,
        bottom: 110,
        left: -70,
    },
    bgBlobThree: {
        width: 170,
        height: 170,
        top: '34%',
        right: '16%',
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 6,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    carouselContainer: {
        flex: 1,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '700',
    },
    headerSubtitle: {
        fontSize: 13,
        marginTop: 2,
        fontWeight: '500',
    },
    skipText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
    },
    slide: {
        width: screenWidth,
        paddingHorizontal: 22,
        justifyContent: 'flex-start',
        alignItems: 'center',
    },
    slideScroll: {
        width: '100%',
    },
    slideScrollContent: {
        paddingTop: 4,
        paddingBottom: 6,
        alignItems: 'center',
    },
    stepAnimatedWrap: {
        width: '100%',
        alignItems: 'center',
    },
    glassCard: {
        width: '100%',
        borderRadius: 22,
        borderWidth: 1,
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 18,
        alignItems: 'center',
    },
    tagPill: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginBottom: 12,
    },
    tagText: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    iconWrapper: {
        width: 112,
        height: 112,
        borderRadius: 56,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 110, 110, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 110, 110, 0.35)',
        marginBottom: 18,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 26,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 10,
    },
    description: {
        color: 'rgba(255,255,255,0.78)',
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
        maxWidth: 340,
    },
    titleSmall: {
        fontSize: 23,
    },
    subtitleSmall: {
        fontSize: 14,
    },
    descriptionSmall: {
        fontSize: 14,
        lineHeight: 20,
    },
    highlightsRow: {
        width: '100%',
        marginTop: 14,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
    },
    highlightChip: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    highlightText: {
        fontSize: 12,
        fontWeight: '600',
    },
    useCaseCard: {
        width: '100%',
        marginTop: 12,
        borderWidth: 1,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    useCaseTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    useCaseValue: {
        fontSize: 14,
        fontWeight: '600',
    },
    footer: {
        paddingHorizontal: 20,
        paddingBottom: 18,
        paddingTop: 6,
        alignItems: 'center',
    },
    progressRow: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressText: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    progressTrack: {
        height: 8,
        borderRadius: 999,
        marginBottom: 10,
        overflow: 'hidden',
    },
    progressThumb: {
        height: '100%',
        borderRadius: 999,
    },
    dotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 14,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
    dotActive: {
        width: 20,
        backgroundColor: '#FF6E6E',
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
    },
    secondaryButton: {
        flex: 1,
        borderWidth: 1,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    disabledButton: {
        opacity: 0.45,
    },
    secondaryButtonText: {
        fontSize: 15,
        fontWeight: '700',
    },
    primaryButton: {
        flex: 1,
        backgroundColor: '#FF6E6E',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    quickHint: {
        marginTop: 10,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 9,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '100%',
    },
    quickHintText: {
        flex: 1,
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 18,
    },
});

export default TutorialScreen;
