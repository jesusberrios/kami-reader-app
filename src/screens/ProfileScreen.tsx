import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    TextInput,
    ScrollView,
    Platform,
    StatusBar,
    Dimensions,
    SafeAreaView,
    Animated,
    Easing
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { RootStackParamList, DrawerParamList } from '../navigation/types';
import { db } from '../firebase/config';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import AuthService from '../services/auth.service';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Profile'> &
    DrawerNavigationProp<DrawerParamList, 'Profile'>;

interface UserProfile {
    username: string;
    email: string;
    avatar: string;
    accountType: 'free' | 'premium';
    readingStats: {
        totalRead: number;
        hoursSpent: number;
        favorites: number;
    };
    totalReadingTimeMs?: number;
}

interface Achievement {
    id: string;
    name: string;
    icon: string;
    description: string;
    isPremium: boolean;
    progress?: number;
    target?: number;
}

const ProfileScreen = () => {
    const navigation = useNavigation<ProfileScreenNavigationProp>();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [scaleValue] = useState(new Animated.Value(1));
    const [fadeAnim] = useState(new Animated.Value(0));
    const insets = useSafeAreaInsets();

    // Animación de entrada
    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, []);

    const formatReadingTime = (milliseconds: number): string => {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return '0m';
        }
    };

    const animateButtonPress = () => {
        Animated.sequence([
            Animated.timing(scaleValue, {
                toValue: 0.95,
                duration: 100,
                easing: Easing.ease,
                useNativeDriver: true,
            }),
            Animated.timing(scaleValue, {
                toValue: 1,
                duration: 200,
                easing: Easing.elastic(1),
                useNativeDriver: true,
            })
        ]).start();
    };

    useFocusEffect(
        useCallback(() => {
            const fetchData = async () => {
                await fetchUserProfile();
                await fetchAchievements();
            };
            fetchData();
        }, [])
    );

    const fetchUserProfile = async () => {
        const currentUser = AuthService.getCurrentUser();
        if (currentUser) {
            try {
                setLoading(true);
                const userDocRef = doc(db, 'users', currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const data = userDocSnap.data();
                    const totalReadingTimeMs = data.totalReadingTime || 0;
                    const hoursSpent = totalReadingTimeMs / (1000 * 60 * 60);

                    // Fetch favorites count
                    const favoritesSnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'favorites'));
                    const favoritesCount = favoritesSnapshot.size;

                    // Fetch read manga count
                    const readComicsSnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'readComics'));
                    const totalRead = readComicsSnapshot.size;

                    setUserProfile({
                        username: data.username || currentUser.email?.split('@')[0] || 'Usuario',
                        email: data.email || currentUser.email || '',
                        avatar: data.avatar || '',
                        accountType: data.accountType || 'free',
                        readingStats: {
                            totalRead,
                            hoursSpent,
                            favorites: favoritesCount
                        },
                        totalReadingTimeMs
                    });
                    setNewUsername(data.username || currentUser.email?.split('@')[0] || 'Usuario');
                }
            } catch (error) {
                console.error('Error fetching profile:', error);
                Alert.alert('Error', 'No se pudo cargar el perfil');
            } finally {
                setLoading(false);
            }
        }
    };

    const fetchAchievements = async () => {
        try {
            const achievementsColRef = collection(db, 'achievements');
            const snapshot = await getDocs(achievementsColRef);
            const achievementsData: Achievement[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Achievement));
            setAchievements(achievementsData);
        } catch (error) {
            console.error('Error fetching achievements:', error);
        }
    };

    const handleUpdateUsername = async () => {
        if (!newUsername.trim()) {
            Alert.alert('Error', 'El nombre no puede estar vacío');
            return;
        }

        const currentUser = AuthService.getCurrentUser();
        if (currentUser) {
            try {
                await updateDoc(doc(db, 'users', currentUser.uid), { username: newUsername });
                setUserProfile(prev => prev ? { ...prev, username: newUsername } : null);
                setIsEditingUsername(false);
            } catch (error) {
                console.error('Error updating username:', error);
                Alert.alert('Error', 'No se pudo actualizar el nombre');
            }
        }
    };

    const handleChooseAvatar = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso requerido', 'Necesitamos acceso a tus fotos');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
            base64: true,
        });

        if (!result.canceled && result.assets) {
            await uploadAvatar(`data:image/jpeg;base64,${result.assets[0].base64}`);
        }
    };

    const uploadAvatar = async (base64Image: string) => {
        const currentUser = AuthService.getCurrentUser();
        if (!currentUser) return;

        setUploadingAvatar(true);
        try {
            await updateDoc(doc(db, 'users', currentUser.uid), { avatar: base64Image });
            setUserProfile(prev => prev ? { ...prev, avatar: base64Image } : null);
        } catch (error) {
            console.error('Error updating avatar:', error);
            Alert.alert('Error', 'No se pudo actualizar el avatar');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const isAchievementUnlocked = (achievement: Achievement): boolean => {
        if (!userProfile) return false;

        switch (achievement.id) {
            case 'first-read':
                return userProfile.readingStats.totalRead > 0;
            case 'avid-reader':
                return userProfile.readingStats.totalRead >= 5;
            case 'bookworm':
                return userProfile.readingStats.totalRead >= 20;
            case 'marathon':
                return userProfile.readingStats.hoursSpent >= 10;
            case 'collector':
                return userProfile.readingStats.favorites >= 10;
            default:
                return false;
        }
    };

    const getAchievementProgress = (achievement: Achievement): number => {
        if (!userProfile) return 0;

        switch (achievement.id) {
            case 'first-read':
                return Math.min(userProfile.readingStats.totalRead, 1);
            case 'avid-reader':
                return Math.min(userProfile.readingStats.totalRead / 5, 1);
            case 'bookworm':
                return Math.min(userProfile.readingStats.totalRead / 20, 1);
            case 'marathon':
                return Math.min(userProfile.readingStats.hoursSpent / 10, 1);
            case 'collector':
                return Math.min(userProfile.readingStats.favorites / 10, 1);
            default:
                return 0;
        }
    };

    if (loading || !userProfile) {
        return (
            <LinearGradient colors={['#0F0F1A', '#1E1E28']} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FF6E6E" />
                <Text style={styles.loadingText}>Cargando perfil...</Text>
            </LinearGradient>
        );
    }

    return (
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
            <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
            <LinearGradient colors={['#0F0F1A', '#1E1E28']} style={styles.gradient}>
                <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]} >
                    <ScrollView contentContainerStyle={styles.scrollContainer}>
                        {/* Header */}
                        <View style={styles.header}>
                            <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
                                <TouchableOpacity
                                    onPress={() => {
                                        animateButtonPress();
                                        navigation.toggleDrawer();
                                    }}
                                    style={styles.menuButton}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="menu" size={28} color="#FF6E6E" />
                                </TouchableOpacity>
                            </Animated.View>
                            <Text style={styles.title}>Mi Perfil</Text>
                            <View style={{ width: 28 }} /> {/* Spacer for alignment */}
                        </View>

                        {/* Profile Card */}
                        <View style={styles.profileCard}>
                            <TouchableOpacity
                                onPress={handleChooseAvatar}
                                style={styles.avatarContainer}
                                disabled={uploadingAvatar}
                            >
                                {userProfile.avatar ? (
                                    <Image source={{ uri: userProfile.avatar }} style={styles.avatar} />
                                ) : (
                                    <Ionicons name="person-circle" size={120} color="#444" />
                                )}
                                {uploadingAvatar ? (
                                    <View style={styles.uploadOverlay}>
                                        <ActivityIndicator color="#FFF" />
                                    </View>
                                ) : (
                                    <View style={styles.editIcon}>
                                        <Ionicons name="camera" size={20} color="#FFF" />
                                    </View>
                                )}
                            </TouchableOpacity>

                            <View style={styles.userInfo}>
                                <View style={styles.usernameRow}>
                                    {isEditingUsername ? (
                                        <TextInput
                                            style={styles.usernameInput}
                                            value={newUsername}
                                            onChangeText={setNewUsername}
                                            autoFocus
                                            onSubmitEditing={handleUpdateUsername}
                                            onBlur={handleUpdateUsername}
                                        />
                                    ) : (
                                        <Text style={styles.username}>{userProfile.username}</Text>
                                    )}
                                    <TouchableOpacity
                                        onPress={() => isEditingUsername ? handleUpdateUsername() : setIsEditingUsername(true)}
                                        style={styles.editButton}
                                    >
                                        <Ionicons
                                            name={isEditingUsername ? "checkmark" : "pencil"}
                                            size={18}
                                            color="#FF6E6E"
                                        />
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.email}>{userProfile.email}</Text>

                                <View style={styles.badgeContainer}>
                                    <LinearGradient
                                        colors={userProfile.accountType === 'premium' ?
                                            ['#FFD700', '#FFA500'] :
                                            ['#6B8AFD', '#3A5FCD']}
                                        style={styles.accountBadge}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    >
                                        <Text style={styles.badgeText}>
                                            {userProfile.accountType === 'premium' ? 'PREMIUM' : 'GRATIS'}
                                        </Text>
                                    </LinearGradient>
                                </View>
                            </View>
                        </View>

                        {/* Stats Section - Conditionally rendered */}
                        {userProfile.accountType === 'premium' ? (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Estadísticas</Text>
                                <View style={styles.statsGrid}>
                                    <View style={styles.statCard}>
                                        <Ionicons name="book" size={24} color="#FF6E6E" />
                                        <Text style={styles.statValue}>{userProfile.readingStats.totalRead}</Text>
                                        <Text style={styles.statLabel}>Lecturas</Text>
                                    </View>
                                    <View style={styles.statCard}>
                                        <Ionicons name="time" size={24} color="#FF6E6E" />
                                        <Text style={styles.statValue}>
                                            {formatReadingTime(userProfile.totalReadingTimeMs || 0)}
                                        </Text>
                                        <Text style={styles.statLabel}>Tiempo</Text>
                                    </View>
                                    <View style={styles.statCard}>
                                        <Ionicons name="heart" size={24} color="#FF6E6E" />
                                        <Text style={styles.statValue}>{userProfile.readingStats.favorites}</Text>
                                        <Text style={styles.statLabel}>Favoritos</Text>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            // Optional: Display a message or a locked state for free users
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Estadísticas</Text>
                                <View style={styles.lockedSection}>
                                    <MaterialCommunityIcons name="lock" size={40} color="#B0BEC5" />
                                    <Text style={styles.lockedText}>Estadísticas avanzadas disponibles solo para usuarios Premium.</Text>
                                    <TouchableOpacity
                                        style={styles.lockedButton}
                                        onPress={() => navigation.navigate('Payment' as never)}
                                    >
                                        <Text style={styles.lockedButtonText}>Actualizar a Premium</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* Achievements Section - Conditionally rendered */}
                        {userProfile.accountType === 'premium' ? (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Logros</Text>
                                {achievements.length > 0 ? (
                                    achievements.map(achievement => {
                                        const unlocked = isAchievementUnlocked(achievement);
                                        const progress = getAchievementProgress(achievement);

                                        return (
                                            <View key={achievement.id} style={styles.achievementCard}>
                                                <View style={styles.achievementIcon}>
                                                    <Ionicons
                                                        name={achievement.icon as any}
                                                        size={28}
                                                        color={unlocked ? "#FFD700" : "#555"}
                                                    />
                                                    {unlocked && (
                                                        <View style={styles.unlockedBadge}>
                                                            <Ionicons name="checkmark" size={12} color="#FFF" />
                                                        </View>
                                                    )}
                                                </View>
                                                <View style={styles.achievementInfo}>
                                                    <Text style={[
                                                        styles.achievementName,
                                                        unlocked && { color: '#FFD700' }
                                                    ]}>
                                                        {achievement.name}
                                                    </Text>
                                                    <Text style={styles.achievementDesc}>
                                                        {achievement.description}
                                                    </Text>
                                                    {!unlocked && (
                                                        <View style={styles.progressBar}>
                                                            <View
                                                                style={[
                                                                    styles.progressFill,
                                                                    { width: `${progress * 100}%` }
                                                                ]}
                                                            />
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                        );
                                    })
                                ) : (
                                    <Text style={styles.emptyText}>Proximamente disponible......</Text>
                                )}
                            </View>
                        ) : (
                            // Optional: Display a message or a locked state for free users
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Logros</Text>
                                <View style={styles.lockedSection}>
                                    <MaterialCommunityIcons name="lock" size={40} color="#B0BEC5" />
                                    <Text style={styles.lockedText}>Desbloquea logros exclusivos al convertirte en Premium.</Text>
                                    <TouchableOpacity
                                        style={styles.lockedButton}
                                        onPress={() => navigation.navigate('Payment' as never)}
                                    >
                                        <Text style={styles.lockedButtonText}>Actualizar a Premium</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}


                        {/* Upgrade Prompt for Free Users */}
                        {userProfile.accountType === 'free' && (
                            <TouchableOpacity
                                style={styles.upgradeCard}
                                onPress={() => navigation.navigate('Payment' as never)}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={['#FF6E6E', '#D23C3C']}
                                    style={styles.upgradeGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                >
                                    <Ionicons name="rocket" size={32} color="#FFF" />
                                    <Text style={styles.upgradeTitle}>Conviértete en Premium</Text>
                                    <Text style={styles.upgradeText}>
                                        Desbloquea estadísticas avanzadas y más beneficios
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </SafeAreaView>
            </LinearGradient>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    gradient: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    scrollContainer: {
        padding: 20,
        paddingBottom: 40,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#FFF',
        marginTop: 10,
        fontSize: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
    },
    menuButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 110, 110, 0.1)',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFF',
        fontFamily: 'Roboto-Bold',
    },
    profileCard: {
        backgroundColor: 'rgba(30, 30, 45, 0.6)',
        borderRadius: 20,
        padding: 25,
        alignItems: 'center',
        marginBottom: 25,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    avatarContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(40, 40, 60, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        overflow: 'hidden',
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    uploadOverlay: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    editIcon: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        backgroundColor: '#FF6E6E',
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userInfo: {
        width: '100%',
        alignItems: 'center',
    },
    usernameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    username: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FFF',
        marginRight: 10,
    },
    usernameInput: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#FF6E6E',
        paddingVertical: 2,
        minWidth: 150,
        textAlign: 'center',
    },
    editButton: {
        padding: 5,
    },
    email: {
        fontSize: 14,
        color: '#AAA',
        marginBottom: 15,
    },
    badgeContainer: {
        marginTop: 10,
    },
    accountBadge: {
        paddingHorizontal: 15,
        paddingVertical: 5,
        borderRadius: 15,
        flexDirection: 'row',
        alignItems: 'center',
    },
    badgeText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 12,
        textTransform: 'uppercase',
    },
    section: {
        marginBottom: 25,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 15,
        marginLeft: 5,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    statCard: {
        backgroundColor: 'rgba(30, 30, 45, 0.6)',
        borderRadius: 15,
        padding: 20,
        width: '30%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    statValue: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FF6E6E',
        marginVertical: 5,
    },
    statLabel: {
        fontSize: 12,
        color: '#AAA',
        textTransform: 'uppercase',
    },
    achievementCard: {
        backgroundColor: 'rgba(30, 30, 45, 0.6)',
        borderRadius: 15,
        padding: 15,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    achievementIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(40, 40, 60, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    unlockedBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#4CD964',
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#1E1E2D',
    },
    achievementInfo: {
        flex: 1,
    },
    achievementName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 3,
    },
    achievementDesc: {
        fontSize: 12,
        color: '#AAA',
        marginBottom: 5,
    },
    progressBar: {
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        marginTop: 5,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#FF6E6E',
    },
    emptyText: {
        color: '#AAA',
        textAlign: 'center',
        marginTop: 10,
    },
    upgradeCard: {
        borderRadius: 20,
        overflow: 'hidden',
        marginTop: 10,
    },
    upgradeGradient: {
        padding: 25,
        alignItems: 'center',
    },
    upgradeTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFF',
        marginTop: 10,
        marginBottom: 5,
    },
    upgradeText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
    },
    lockedSection: {
        backgroundColor: 'rgba(30, 30, 45, 0.6)',
        borderRadius: 15,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 150, // Ensure it takes up some space
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    lockedText: {
        color: '#B0BEC5',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 10,
        marginBottom: 15,
        lineHeight: 20,
    },
    lockedButton: {
        backgroundColor: '#FF6E6E',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
    },
    lockedButtonText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
});

export default ProfileScreen;