import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    Dimensions,
    Animated,
    ActivityIndicator
} from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { doc, onSnapshot, collection, query, where, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { signOut } from 'firebase/auth';
import { MaterialCommunityIcons, Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useAlertContext } from '../contexts/AlertContext'; // Importar el contexto de alertas

type UserData = {
    username?: string;
    email?: string;
    avatar?: string;
    accountType?: 'free' | 'premium';
    totalReadingTime?: number;
    subscriptionEndDate?: number;
};

interface CustomDrawerContentProps {
    pendingRequests?: number;
    unreadMessages?: number;
    [key: string]: any;
}

const UserPlanBadge = ({ accountType }: { accountType: 'free' | 'premium' }) => {
    return (
        <LinearGradient
            colors={accountType === 'premium' ? ['#FFD700', '#FFA500'] : ['#6E6E80', '#4A4A5A']}
            style={styles.badgeContainer}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <Feather
                name={accountType === 'premium' ? "award" : "user"}
                size={12}
                color={accountType === 'premium' ? '#333' : '#FFF'}
            />
            <Text style={[
                styles.badgeText,
                { color: accountType === 'premium' ? '#333' : '#FFF' }
            ]}>
                {accountType === 'premium' ? 'Premium' : 'Free'}
            </Text>
        </LinearGradient>
    );
};

const CustomDrawerContent = (props: CustomDrawerContentProps) => {
    const { pendingRequests = 0, unreadMessages = 0 } = props;
    const [userData, setUserData] = useState<UserData | null>(null);
    const [favoritesCount, setFavoritesCount] = useState<number>(0);
    const [mangasReadCount, setMangasReadCount] = useState<number>(0);
    const [totalReadingTimeMs, setTotalReadingTimeMs] = useState<number>(0);
    const [scaleValue] = useState(new Animated.Value(1));
    const [drawerLoading, setDrawerLoading] = useState(true);
    const [totalPending, setTotalPending] = useState(0);
    const navigation = useNavigation();
    const adUnitId = __DEV__ ? TestIds.BANNER : 'ca-app-pub-6584977537844104/1888694522';

    // Obtener las funciones de alerta del contexto
    const { alertError, alertConfirm } = useAlertContext();

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

    useEffect(() => {
        setTotalPending(pendingRequests + unreadMessages);
    }, [pendingRequests, unreadMessages]);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) {
            setUserData(null);
            setFavoritesCount(0);
            setMangasReadCount(0);
            setTotalReadingTimeMs(0);
            setDrawerLoading(false);
            return;
        }

        const userDocRef = doc(db, "users", user.uid);
        const favoritesCollectionRef = collection(db, 'users', user.uid, 'favorites');
        const readComicsCollectionRef = collection(db, 'users', user.uid, 'readComics');
        const readComicsQuery = query(readComicsCollectionRef, where("isFullMangaRead", "==", true));

        let userUnsubscribe: () => void;
        let favoritesUnsubscribe: () => void;
        let readComicsUnsubscribe: () => void;

        let userLoaded = false;
        let favoritesLoaded = false;
        let readComicsLoaded = false;

        const checkIfAllLoaded = () => {
            if (userLoaded && favoritesLoaded && readComicsLoaded) {
                setDrawerLoading(false);
            }
        };

        userUnsubscribe = onSnapshot(userDocRef, async (docSnap) => {
            if (docSnap.exists()) {
                const fetchedUserData = docSnap.data() as UserData;
                setUserData(fetchedUserData);
                setTotalReadingTimeMs(fetchedUserData.totalReadingTime || 0);

                if (fetchedUserData.accountType === 'premium' && fetchedUserData.subscriptionEndDate) {
                    if (Date.now() > fetchedUserData.subscriptionEndDate) {
                        try {
                            await updateDoc(userDocRef, { accountType: 'free' });
                        } catch (error) {
                            console.error("Error reverting subscription to free:", error);
                        }
                    }
                } else if (fetchedUserData.accountType === 'premium' && !fetchedUserData.subscriptionEndDate) {
                    try {
                        await updateDoc(userDocRef, { accountType: 'free' });
                    } catch (error) {
                        console.error("Error reverting premium user without end date:", error);
                    }
                }
            } else {
                setUserData(null);
                setTotalReadingTimeMs(0);
            }
            userLoaded = true;
            checkIfAllLoaded();
        }, (error) => {
            console.error("Error fetching user data in drawer:", error);
            setUserData(null);
            setTotalReadingTimeMs(0);
            userLoaded = true;
            checkIfAllLoaded();
        });

        favoritesUnsubscribe = onSnapshot(favoritesCollectionRef, (querySnapshot) => {
            setFavoritesCount(querySnapshot.size);
            favoritesLoaded = true;
            checkIfAllLoaded();
        }, (error) => {
            console.error("Error fetching favorites count in drawer:", error);
            setFavoritesCount(0);
            favoritesLoaded = true;
            checkIfAllLoaded();
        });

        readComicsUnsubscribe = onSnapshot(readComicsQuery, (querySnapshot) => {
            setMangasReadCount(querySnapshot.size);
            readComicsLoaded = true;
            checkIfAllLoaded();
        }, (error) => {
            console.error("Error fetching mangas read count in drawer:", error);
            setMangasReadCount(0);
            readComicsLoaded = true;
            checkIfAllLoaded();
        });

        return () => {
            userUnsubscribe();
            favoritesUnsubscribe();
            readComicsUnsubscribe();
        };
    }, []);

    const handleSignOut = async () => {
        Animated.spring(scaleValue, {
            toValue: 0.95,
            useNativeDriver: true,
        }).start(() => {
            Animated.spring(scaleValue, {
                toValue: 1,
                useNativeDriver: true,
            }).start();
        });

        alertConfirm(
            '¿Estás seguro que deseas salir?',
            async () => {
                try {
                    await signOut(auth);
                    navigation.navigate('Auth' as never);
                } catch (error) {
                    alertError('No se pudo cerrar la sesión');
                }
            },
            'Cerrar sesión',
            'Salir',
            'Cancelar'
        );
    };

    const isPremiumUser = userData?.accountType === 'premium';
    const drawerWidth = Dimensions.get('window').width * 0.65;

    // Función para renderizar íconos personalizados con badges
    const renderDrawerIcon = (routeName: string, color: string, size: number) => {
        let iconName: string;

        switch (routeName) {
            case 'Home':
                iconName = 'home';
                break;
            case 'Library':
                iconName = 'bookshelf';
                break;
            case 'Favorites':
                iconName = 'heart';
                break;
            case 'AddFriends':
                iconName = 'account-group-outline';
                break;
            case 'InProgress':
                iconName = 'book-open-outline';
                break;
            case 'Profile':
                iconName = 'head';
                break;
            case 'Premium':
                iconName = 'crown';
                break;
            default:
                iconName = 'circle';
        }

        // Mostrar badge solo en la sección de Amigos si hay pendientes
        const showBadge = routeName === 'AddFriends' && totalPending > 0;

        return (
            <View style={{ position: 'relative' }}>
                <MaterialCommunityIcons
                    name={iconName as any}
                    size={size}
                    color={color}
                />
                {showBadge && (
                    <View style={styles.drawerBadge}>
                        <Text style={styles.drawerBadgeText}>
                            {totalPending > 99 ? '99+' : totalPending}
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    if (drawerLoading) {
        return (
            <LinearGradient
                colors={['#0F0F1A', '#1E1E2D']}
                style={styles.loadingContainer}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <ActivityIndicator size="large" color="#FF6E6E" />
                <Text style={styles.loadingText}>Cargando menú...</Text>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient
            colors={['#0F0F1A', '#1E1E2D']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <DrawerContentScrollView
                {...props}
                contentContainerStyle={styles.drawerContainer}
                showsVerticalScrollIndicator={false}
            >
                {/* User Profile Section */}
                <View style={styles.userHeader}>
                    <View style={styles.avatarContainer}>
                        <Image
                            source={userData?.avatar ? { uri: userData.avatar } : require('../../assets/icon.png')}
                            style={styles.avatar}
                        />
                        <View style={[
                            styles.onlineStatus,
                            { backgroundColor: isPremiumUser ? '#4CD964' : '#A0A0B0' }
                        ]} />
                    </View>

                    <View style={styles.userInfo}>
                        <View style={styles.userNameContainer}>
                            <Text style={styles.userName} numberOfLines={1}>
                                {userData?.username || 'Invitado'}
                            </Text>
                            {userData?.accountType && <UserPlanBadge accountType={userData.accountType} />}
                        </View>
                        <Text style={styles.userEmail} numberOfLines={1}>
                            {userData?.email || 'usuario@example.com'}
                        </Text>
                    </View>
                </View>

                {/* Stats Section */}
                <View style={styles.statsContainer}>
                    <LinearGradient
                        colors={['rgba(30, 30, 45, 0.8)', 'rgba(20, 20, 35, 0.9)']}
                        style={styles.statsBackground}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        {isPremiumUser ? (
                            <>
                                <View style={styles.statItem}>
                                    <Ionicons name="book" size={22} color="#FF6E6E" />
                                    <Text style={styles.statValue}>{mangasReadCount}</Text>
                                    <Text style={styles.statLabel}>Leídos</Text>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <Ionicons name="time" size={22} color="#FF6E6E" />
                                    <Text style={styles.statValue}>{formatReadingTime(totalReadingTimeMs)}</Text>
                                    <Text style={styles.statLabel}>Tiempo</Text>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <Ionicons name="heart" size={22} color="#FF6E6E" />
                                    <Text style={styles.statValue}>{favoritesCount}</Text>
                                    <Text style={styles.statLabel}>Favoritos</Text>
                                </View>
                            </>
                        ) : (
                            <TouchableOpacity
                                style={styles.lockedStatsOverlay}
                                onPress={() => navigation.navigate('Payment' as never)}
                                activeOpacity={0.8}
                            >
                                <MaterialCommunityIcons
                                    name="crown"
                                    size={32}
                                    color="#FFD700"
                                    style={styles.crownIcon}
                                />
                                <Text style={styles.lockedStatsText}>Desbloquea estadísticas completas</Text>
                                <Text style={styles.lockedStatsSubText}>Conviértete en Premium</Text>
                            </TouchableOpacity>
                        )}
                    </LinearGradient>
                </View>

                {/* Navigation Items */}
                <View style={styles.navigationContainer}>
                    <DrawerItemList
                        state={props.state}
                        navigation={props.navigation}
                        descriptors={props.descriptors}
                    />
                </View>
            </DrawerContentScrollView>

            {/* Footer */}
            <View style={styles.footerContainer}>
                {!isPremiumUser && (
                    <View style={[styles.adBanner, { width: drawerWidth }]}>
                        <BannerAd
                            unitId={adUnitId}
                            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
                        />
                    </View>
                )}

                <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
                    <TouchableOpacity
                        style={styles.signOutButton}
                        onPress={handleSignOut}
                        activeOpacity={0.7}
                    >
                        <LinearGradient
                            colors={['rgba(255, 110, 110, 0.2)', 'rgba(255, 80, 80, 0.3)']}
                            style={styles.signOutGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <MaterialCommunityIcons name="logout" size={20} color="#FF6E6E" />
                            <Text style={styles.signOutText}>Cerrar sesión</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>

                <View style={styles.versionContainer}>
                    <Text style={styles.footerText}>Kamireader v1.0.7</Text>
                    <Text style={styles.footerText}>© {new Date().getFullYear()} KAMI Studios</Text>
                </View>
            </View>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    drawerContainer: {
        paddingTop: 10,
        paddingBottom: 20,
    },
    userHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 25,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 15,
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 2,
        borderColor: '#FF6E6E',
    },
    onlineStatus: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: '#0F0F1A',
    },
    userInfo: {
        flex: 1,
    },
    userNameContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    userName: {
        fontFamily: 'Roboto-Medium',
        color: '#FFFFFF',
        fontSize: 18,
        marginRight: 10,
        flexShrink: 1,
    },
    userEmail: {
        fontFamily: 'Roboto-Regular',
        color: '#A0A0B0',
        fontSize: 13,
    },
    badgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 3,
    },
    badgeText: {
        fontFamily: 'Roboto-Bold',
        fontSize: 11,
        marginLeft: 5,
        textTransform: 'uppercase',
    },
    statsContainer: {
        paddingHorizontal: 15,
        marginVertical: 15,
    },
    statsBackground: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 15,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 110, 110, 0.2)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statDivider: {
        width: 1,
        height: '60%',
        backgroundColor: 'rgba(255, 110, 110, 0.2)',
        alignSelf: 'center',
    },
    statValue: {
        fontFamily: 'Roboto-Bold',
        color: '#FFFFFF',
        fontSize: 18,
        marginVertical: 5,
    },
    statLabel: {
        fontFamily: 'Roboto-Medium',
        color: '#B0B0C0',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    lockedStatsOverlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 15,
    },
    crownIcon: {
        marginBottom: 10,
        shadowColor: '#FFD700',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
    },
    lockedStatsText: {
        fontFamily: 'Roboto-Bold',
        color: '#FFD700',
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 5,
    },
    lockedStatsSubText: {
        fontFamily: 'Roboto-Regular',
        color: '#A0A0B0',
        fontSize: 12,
        textAlign: 'center',
    },
    navigationContainer: {
        marginTop: 5,
    },
    drawerItem: {
        borderRadius: 10,
        marginHorizontal: 10,
        marginVertical: 3,
        overflow: 'hidden',
    },
    drawerLabel: {
        fontFamily: 'Roboto-Medium',
        fontSize: 15,
        marginLeft: -10,
    },
    footerContainer: {
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
    },
    adBanner: {
        alignItems: 'center',
        marginBottom: 15,
        borderRadius: 10,
        overflow: 'hidden',
    },
    signOutButton: {
        marginBottom: 15,
    },
    signOutGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 10,
        justifyContent: 'center',
    },
    signOutText: {
        fontFamily: 'Roboto-Medium',
        color: '#FF6E6E',
        fontSize: 15,
        marginLeft: 10,
    },
    versionContainer: {
        alignItems: 'center',
    },
    footerText: {
        fontFamily: 'Roboto-Regular',
        color: '#5A5A6E',
        fontSize: 11,
        marginTop: 3,
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
        fontFamily: 'Roboto-Medium',
    },
    drawerBadge: {
        position: 'absolute',
        top: -5,
        right: -5,
        backgroundColor: '#FF5252',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#0F0F1A',
    },
    drawerBadgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
});

export default CustomDrawerContent;