import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
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
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { RootStackParamList, DrawerParamList } from '../navigation/types';
import { db } from '../firebase/config';
import { doc, getDoc, updateDoc, collection, getDocs, query, where, arrayUnion } from 'firebase/firestore';
import AuthService from '../services/auth.service';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlertContext } from '../contexts/AlertContext'; // Importar el contexto de alertas

type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Profile'> &
    DrawerNavigationProp<DrawerParamList, 'Profile'>;

type ProfileScreenRouteProp = RouteProp<RootStackParamList, 'Profile'>;

interface UserProfile {
    uid: string;
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
    isFriend?: boolean;
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
    const route = useRoute<ProfileScreenRouteProp>();
    const insets = useSafeAreaInsets();

    // Obtener las funciones de alerta del contexto
    const { alertError, alertSuccess } = useAlertContext();

    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [scaleValue] = useState(new Animated.Value(1));
    const [fadeAnim] = useState(new Animated.Value(0));

    const currentUser = AuthService.getCurrentUser();
    const isOwnProfile = !route.params?.userId || route.params.userId === currentUser?.uid;
    const targetUserId = route.params?.userId || currentUser?.uid;

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
        }, [targetUserId])
    );

    const fetchUserProfile = async () => {
        if (!targetUserId) return;

        try {
            setLoading(true);
            const userDocRef = doc(db, 'users', targetUserId);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const data = userDocSnap.data();
                const totalReadingTimeMs = data.totalReadingTime || 0;
                const hoursSpent = totalReadingTimeMs / (1000 * 60 * 60);

                // Fetch favorites count
                const favoritesSnapshot = await getDocs(collection(db, 'users', targetUserId, 'favorites'));
                const favoritesCount = favoritesSnapshot.size;

                // Fetch read manga count
                const readComicsSnapshot = await getDocs(collection(db, 'users', targetUserId, 'readComics'));
                const totalRead = readComicsSnapshot.size;

                // Check if this user is a friend (only for non-own profiles)
                let isFriend = false;
                if (!isOwnProfile && currentUser) {
                    const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
                    if (currentUserDoc.exists()) {
                        const currentUserData = currentUserDoc.data();
                        isFriend = currentUserData.friends?.includes(targetUserId) || false;
                    }
                }

                setUserProfile({
                    uid: targetUserId,
                    username: data.username || data.email?.split('@')[0] || 'Usuario',
                    email: data.email || '',
                    avatar: data.avatar || '',
                    accountType: data.accountType || 'free',
                    readingStats: {
                        totalRead,
                        hoursSpent,
                        favorites: favoritesCount
                    },
                    totalReadingTimeMs,
                    isFriend
                });

                if (isOwnProfile) {
                    setNewUsername(data.username || data.email?.split('@')[0] || 'Usuario');
                }
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            alertError('No se pudo cargar el perfil');
        } finally {
            setLoading(false);
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
        if (!newUsername.trim() || !currentUser) {
            alertError('El nombre no puede estar vacío');
            return;
        }

        try {
            await updateDoc(doc(db, 'users', currentUser.uid), { username: newUsername });
            setUserProfile(prev => prev ? { ...prev, username: newUsername } : null);
            setIsEditingUsername(false);
            alertSuccess('Nombre actualizado correctamente');
        } catch (error) {
            console.error('Error updating username:', error);
            alertError('No se pudo actualizar el nombre');
        }
    };

    const handleChooseAvatar = async () => {
        if (!isOwnProfile) return;

        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            alertError('Necesitamos acceso a tus fotos para cambiar el avatar');
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
        if (!currentUser || !isOwnProfile) return;

        setUploadingAvatar(true);
        try {
            await updateDoc(doc(db, 'users', currentUser.uid), { avatar: base64Image });
            setUserProfile(prev => prev ? { ...prev, avatar: base64Image } : null);
            alertSuccess('Avatar actualizado correctamente');
        } catch (error) {
            console.error('Error updating avatar:', error);
            alertError('No se pudo actualizar el avatar');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleAddFriend = async () => {
        if (!currentUser || !userProfile) return;

        try {
            const currentUserRef = doc(db, 'users', currentUser.uid);
            const targetUserRef = doc(db, 'users', userProfile.uid);

            await updateDoc(currentUserRef, {
                pendingSentRequests: arrayUnion(userProfile.uid)
            });

            await updateDoc(targetUserRef, {
                pendingReceivedRequests: arrayUnion(currentUser.uid)
            });

            alertSuccess('Solicitud de amistad enviada correctamente');
        } catch (error) {
            console.error('Error sending friend request:', error);
            alertError('No se pudo enviar la solicitud de amistad');
        }
    };

    const handleSendMessage = () => {
        if (!userProfile) return;

        navigation.navigate('Chat', {
            recipientId: userProfile.uid,
            recipientName: userProfile.username
        });
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
                                        isOwnProfile ? navigation.toggleDrawer() : navigation.goBack();
                                    }}
                                    style={styles.menuButton}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons
                                        name={isOwnProfile ? "menu" : "arrow-back"}
                                        size={28}
                                        color="#FF6E6E"
                                    />
                                </TouchableOpacity>
                            </Animated.View>
                            <Text style={styles.title}>
                                {isOwnProfile ? 'Mi Perfil' : 'Perfil'}
                            </Text>
                            <View style={{ width: 28 }} />
                        </View>

                        {/* Profile Card */}
                        <View style={styles.profileCard}>
                            <TouchableOpacity
                                onPress={isOwnProfile ? handleChooseAvatar : undefined}
                                style={styles.avatarContainer}
                                disabled={uploadingAvatar || !isOwnProfile}
                            >
                                {userProfile.avatar ? (
                                    <Image source={{ uri: userProfile.avatar }} style={styles.avatar} />
                                ) : (
                                    <Ionicons name="person-circle" size={120} color="#444" />
                                )}
                                {uploadingAvatar && (
                                    <View style={styles.uploadOverlay}>
                                        <ActivityIndicator color="#FFF" />
                                    </View>
                                )}
                                {isOwnProfile && !uploadingAvatar && (
                                    <View style={styles.cameraIconContainer}>
                                        <View style={styles.cameraIconBackground}>
                                            <Ionicons name="camera" size={16} color="#FFF" />
                                        </View>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <View style={styles.userInfo}>
                                <View style={styles.usernameRow}>
                                    {isOwnProfile && isEditingUsername ? (
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
                                    {isOwnProfile && (
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
                                    )}
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

                                    {!isOwnProfile && userProfile.isFriend && (
                                        <View style={[styles.accountBadge, { backgroundColor: '#4CAF50', marginLeft: 8 }]}>
                                            <Text style={styles.badgeText}>AMIGO</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Action Buttons for other profiles */}
                                {!isOwnProfile && (
                                    <View style={styles.profileActions}>
                                        {userProfile.isFriend ? (
                                            <TouchableOpacity
                                                style={styles.actionButton}
                                                onPress={handleSendMessage}
                                            >
                                                <Ionicons name="chatbubble-ellipses" size={20} color="#FFF" />
                                                <Text style={styles.actionButtonText}>Mensaje</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <TouchableOpacity
                                                style={[styles.actionButton, styles.addFriendButton]}
                                                onPress={handleAddFriend}
                                            >
                                                <Ionicons name="person-add" size={20} color="#FFF" />
                                                <Text style={styles.actionButtonText}>Agregar</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Stats Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Estadísticas</Text>
                            {userProfile.accountType === 'premium' || isOwnProfile ? (
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
                            ) : (
                                <View style={styles.lockedSection}>
                                    <MaterialCommunityIcons name="lock" size={40} color="#B0BEC5" />
                                    <Text style={styles.lockedText}>
                                        {isOwnProfile
                                            ? 'Estadísticas avanzadas disponibles solo para usuarios Premium.'
                                            : 'Las estadísticas avanzadas son privadas.'
                                        }
                                    </Text>
                                    {isOwnProfile && (
                                        <TouchableOpacity
                                            style={styles.lockedButton}
                                            onPress={() => navigation.navigate('Payment' as any)}
                                        >
                                            <Text style={styles.lockedButtonText}>Actualizar a Premium</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* Achievements Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Logros</Text>
                            {userProfile.accountType === 'premium' || isOwnProfile ? (
                                achievements.length > 0 ? (
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
                                    <Text style={styles.emptyText}>Proximamente disponible...</Text>
                                )
                            ) : (
                                <View style={styles.lockedSection}>
                                    <MaterialCommunityIcons name="lock" size={40} color="#B0BEC5" />
                                    <Text style={styles.lockedText}>
                                        {isOwnProfile
                                            ? 'Desbloquea logros exclusivos al convertirte en Premium.'
                                            : 'Los logros son privados.'
                                        }
                                    </Text>
                                    {isOwnProfile && (
                                        <TouchableOpacity
                                            style={styles.lockedButton}
                                            onPress={() => navigation.navigate('Payment' as any)}
                                        >
                                            <Text style={styles.lockedButtonText}>Actualizar a Premium</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* Upgrade Prompt for Free Users (only for own profile) */}
                        {isOwnProfile && userProfile.accountType === 'free' && (
                            <TouchableOpacity
                                style={styles.upgradeCard}
                                onPress={() => navigation.navigate('Payment' as any)}
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
        borderRadius: 60,
    },
    uploadOverlay: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 60,
    },
    cameraIconContainer: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#FF6E6E',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#1E1E2D',
    },
    cameraIconBackground: {
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
        fontFamily: 'Roboto-Bold',
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
        fontFamily: 'Roboto-Bold',
    },
    editButton: {
        padding: 5,
    },
    email: {
        fontSize: 14,
        color: '#AAA',
        marginBottom: 15,
        fontFamily: 'Roboto-Regular',
    },
    badgeContainer: {
        flexDirection: 'row',
        marginTop: 10,
    },
    accountBadge: {
        paddingHorizontal: 15,
        paddingVertical: 5,
        borderRadius: 15,
        alignItems: 'center',
    },
    badgeText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 12,
        textTransform: 'uppercase',
        fontFamily: 'Roboto-Bold',
    },
    profileActions: {
        flexDirection: 'row',
        marginTop: 15,
        gap: 10,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FF6E6E',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 5,
    },
    addFriendButton: {
        backgroundColor: '#4CAF50',
    },
    actionButtonText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Roboto-Medium',
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
        fontFamily: 'Roboto-Bold',
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
        fontFamily: 'Roboto-Bold',
    },
    statLabel: {
        fontSize: 12,
        color: '#AAA',
        textTransform: 'uppercase',
        fontFamily: 'Roboto-Regular',
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
        position: 'relative',
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
        fontFamily: 'Roboto-Bold',
    },
    achievementDesc: {
        fontSize: 12,
        color: '#AAA',
        marginBottom: 5,
        fontFamily: 'Roboto-Regular',
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
        fontFamily: 'Roboto-Regular',
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
        fontFamily: 'Roboto-Bold',
    },
    upgradeText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
        fontFamily: 'Roboto-Regular',
    },
    lockedSection: {
        backgroundColor: 'rgba(30, 30, 45, 0.6)',
        borderRadius: 15,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 150,
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
        fontFamily: 'Roboto-Regular',
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
        fontFamily: 'Roboto-Bold',
    },
});

export default ProfileScreen;