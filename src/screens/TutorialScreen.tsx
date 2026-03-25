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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase/config';
import { useNavigation } from '@react-navigation/native';

const { width: screenWidth } = Dimensions.get('window');

type TutorialStep = {
    title: string;
    description: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

const TUTORIAL_STEPS: TutorialStep[] = [
    {
        title: 'Bienvenido a Kami Reader',
        description: 'Explora mangas, abre capítulos al instante y guarda tu avance.',
        icon: 'book-open-page-variant-outline',
    },
    {
        title: 'Lectura inteligente',
        description: 'Cambia capítulos con gestos. En Perfil puedes elegir modo horizontal o vertical.',
        icon: 'gesture-swipe',
    },
    {
        title: 'Biblioteca y progreso',
        description: 'Administra favoritos, sigue mangas en curso y retoma donde lo dejaste.',
        icon: 'bookshelf',
    },
    {
        title: 'Social y comentarios',
        description: 'Agrega amigos, conversa y participa en la comunidad.',
        icon: 'account-group-outline',
    },
    {
        title: 'Tu cuenta',
        description: 'Edita perfil, consulta estadísticas y activa funciones premium cuando quieras.',
        icon: 'account-cog-outline',
    },
];

const TutorialScreen = () => {
    const navigation = useNavigation<any>();
    const scrollRef = useRef<ScrollView>(null);
    const [currentIndex, setCurrentIndex] = useState(0);

    const isLast = useMemo(() => currentIndex === TUTORIAL_STEPS.length - 1, [currentIndex]);

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
        navigation.navigate('Home');
    };

    return (
        <LinearGradient
            colors={['#0E0F1C', '#17182A', '#0F1220']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Tutorial</Text>
                <TouchableOpacity onPress={finishTutorial} hitSlop={10}>
                    <Text style={styles.skipText}>Saltar</Text>
                </TouchableOpacity>
            </View>

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
                        <View style={styles.iconWrapper}>
                            <MaterialCommunityIcons name={step.icon} size={68} color="#FF6E6E" />
                        </View>
                        <Text style={styles.title}>{step.title}</Text>
                        <Text style={styles.description}>{step.description}</Text>
                    </View>
                ))}
            </ScrollView>

            <View style={styles.footer}>
                <View style={styles.dotsRow}>
                    {TUTORIAL_STEPS.map((_, index) => (
                        <View
                            key={index}
                            style={[styles.dot, index === currentIndex && styles.dotActive]}
                        />
                    ))}
                </View>

                {isLast ? (
                    <TouchableOpacity style={styles.primaryButton} onPress={finishTutorial} activeOpacity={0.85}>
                        <Text style={styles.primaryButtonText}>Comenzar</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={styles.primaryButton} onPress={handleNext} activeOpacity={0.85}>
                        <Text style={styles.primaryButtonText}>Siguiente</Text>
                    </TouchableOpacity>
                )}
            </View>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingTop: 58,
        paddingHorizontal: 20,
        paddingBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '700',
    },
    skipText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
    },
    slide: {
        width: screenWidth,
        paddingHorizontal: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconWrapper: {
        width: 132,
        height: 132,
        borderRadius: 66,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 110, 110, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 110, 110, 0.35)',
        marginBottom: 26,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 14,
    },
    description: {
        color: 'rgba(255,255,255,0.78)',
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 320,
    },
    footer: {
        paddingHorizontal: 20,
        paddingBottom: 34,
    },
    dotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 20,
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
    primaryButton: {
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
});

export default TutorialScreen;
