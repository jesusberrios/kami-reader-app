import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { StatusBar, View, ActivityIndicator, Text, Platform, AppState } from 'react-native';
import { DrawerActions, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { CardStyleInterpolators, TransitionSpecs } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NavigationBar from 'expo-navigation-bar';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// Firebase imports
import { auth, db } from './src/firebase/config';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';

// Screens
import AuthScreen from './src/screens/AuthScreen';
import CustomDrawerContent from './src/components/customDrawerContent';
import HomeScreen from './src/screens/HomeScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import DetailsScreen from './src/screens/DetailsScreen';
import AnimeDetailsScreen from './src/screens/AnimeDetailsScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PaymentScreen from './src/screens/PaymentScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import CommentsScreen from './src/screens/ComentsScreen';
import InProgressScreen from './src/screens/InProgressScreen';
import AddFriendsScreen from './src/screens/AddFriendsScreen';
import ChatScreen from './src/screens/ChatScreen';
import NewsScreen from './src/screens/NewsScreen';
import NewsDetailScreen from './src/screens/NewsDetailScreen';
import TutorialScreen from './src/screens/TutorialScreen';
import PersonalizationScreen from './src/screens/PersonalizationScreen';
import EventStoreScreen from './src/screens/EventStoreScreen';
import EventCompanionPet from './src/components/eventCompanionPet';
import EventThemeBackdrop from './src/components/EventThemeBackdrop';
import { AlertProvider } from './src/contexts/AlertContext';
import GlobalBottomBar from './src/components/GlobalBottomBar';
import { PersonalizationProvider, usePersonalization } from './src/contexts/PersonalizationContext';
import { applyEventFlagsFromAppSettings, applyLiveConfigFromFirestore, getCompanionStoreItems, EASTER_EVENT_ID, HALLOWEEN_EVENT_ID, XMAS_EVENT_ID, VALENTINES_EVENT_ID, isEventActive } from './src/config/liveEvents';
// Navigation Types - Actualizado para v6+
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Tutorial: { manual?: boolean } | undefined;
  Personalization: undefined;
  EventStore: undefined;
  Details: { slug: string };
  AnimeDetails: { slug: string };
  Reader: { hid: string; resumeFromProgress?: boolean };
  Player: { animeSlug: string; episodeSlug: string; resumeFromProgress?: boolean; startAtMs?: number };
  AddFriends: undefined;
  Payment: undefined;
  Chat: { recipientId?: string; recipientName?: string };
  Profile: { userId?: string };
  Comments: undefined;
  News: undefined;
  NewsDetail: { newsItem: { id: string; title: string; message: string; createdAt?: any } };
};

export type DrawerParamList = {
  Home: undefined;
  Profile: undefined;
  Library: undefined;
  AddFriends: undefined;
  InProgress: undefined;
  Favorites: undefined;
  Premium: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList { }
  }
}

const Stack = createStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator<DrawerParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const getActiveRouteName = (state: any): string | undefined => {
  if (!state?.routes?.length) return undefined;
  const route = state.routes[state.index ?? 0];
  if (route.state) return getActiveRouteName(route.state);
  return route.name;
};

const isDrawerOpenInState = (state: any): boolean => {
  if (!state?.routes?.length) return false;
  const route = state.routes[state.index ?? 0];
  const history = route?.state?.history;
  if (Array.isArray(history) && history.some((entry: any) => entry?.type === 'drawer' && entry?.status === 'open')) {
    return true;
  }
  if (route?.state) return isDrawerOpenInState(route.state);
  return false;
};

function ThemedNavigationShell({
  user,
  needsTutorial,
  currentRouteName,
  settingsActive,
  shouldShowBottomBar,
  socialPendingCount,
  navigateToMainRoute,
  openDrawerFromBottomBar,
  showEventCompanion,
}: {
  user: User | null;
  needsTutorial: boolean;
  currentRouteName?: string;
  settingsActive: boolean;
  shouldShowBottomBar: boolean;
  socialPendingCount: number;
  navigateToMainRoute: (routeName: 'Library' | 'AddFriends' | 'Home' | 'Profile') => void;
  openDrawerFromBottomBar: () => void;
  showEventCompanion: boolean;
}) {
  const { theme, settings } = usePersonalization();
  const { bottom } = useSafeAreaInsets();

  const THEME_TO_EVENT: Record<string, string> = {
    'easter-matsuri': EASTER_EVENT_ID,
    'halloween-night': HALLOWEEN_EVENT_ID,
    'navidad-glow': XMAS_EVENT_ID,
    'san-valentin': VALENTINES_EVENT_ID,
  };
  const backdropEventId: string | null = (() => {
    const eid = THEME_TO_EVENT[settings.appTheme];
    return eid && isEventActive(eid) ? eid : null;
  })();
  const companionBottomOffset = (shouldShowBottomBar ? 98 : 18) + Math.max(0, bottom) + (Platform.OS === 'android' ? -6 : 0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const syncNavBarTheme = async () => {
      try {
        await NavigationBar.setBackgroundColorAsync(theme.backgroundSecondary);
      } catch {
        // silently ignored
      }
    };

    syncNavBarTheme();
  }, [theme.backgroundSecondary]);

  return (
    <>
      <StatusBar
        translucent={false}
        backgroundColor={theme.background}
        barStyle="light-content"
      />
      <View style={{ flex: 1, paddingBottom: shouldShowBottomBar ? 92 : 0, backgroundColor: theme.background }}>
        <Stack.Navigator
          key={!user ? 'guest' : needsTutorial ? 'user-tutorial' : 'user-main'}
          initialRouteName={!user ? 'Auth' : needsTutorial ? 'Tutorial' : 'Main'}
          screenOptions={{
            headerShown: false,
            cardStyle: {
              backgroundColor: theme.background,
            },
            cardOverlayEnabled: true,
            cardShadowEnabled: true,
            gestureEnabled: true,
            gestureDirection: 'horizontal',
            gestureResponseDistance: 50,
            animationEnabled: !settings.reduceMotion,
            cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
            transitionSpec: {
              open: TransitionSpecs.TransitionIOSSpec,
              close: TransitionSpecs.TransitionIOSSpec,
            },
          }}
        >
          {user ? (
            <Stack.Screen
              name="Main"
              component={MainDrawerNavigator}
              options={{
                gestureEnabled: false,
              }}
            />
          ) : (
            <Stack.Screen
              name="Auth"
              component={AuthScreen}
              options={{
                gestureEnabled: false,
              }}
            />
          )}
          {user && (
            <Stack.Screen
              name="Tutorial"
              component={TutorialScreen}
              options={{
                gestureEnabled: false,
              }}
            />
          )}
          <Stack.Screen name="Personalization" component={PersonalizationScreen} />
          <Stack.Screen name="EventStore" component={EventStoreScreen} />
          <Stack.Screen name="Details" component={DetailsScreen} />
          <Stack.Screen name="AnimeDetails" component={AnimeDetailsScreen} />
          <Stack.Screen name="Payment" component={PaymentScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Comments" component={CommentsScreen} />
          <Stack.Screen name="News" component={NewsScreen} />
          <Stack.Screen name="NewsDetail" component={NewsDetailScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="AddFriends" component={AddFriendsScreen} />
          <Stack.Screen
            name="Reader"
            component={ReaderScreen}
            options={{
              gestureEnabled: false,
            }}
          />
          <Stack.Screen name="Player" component={PlayerScreen} />
        </Stack.Navigator>

        <EventThemeBackdrop activeEventId={currentRouteName === 'Reader' ? null : backdropEventId} />

        <GlobalBottomBar
          currentRouteName={currentRouteName}
          visible={shouldShowBottomBar}
          settingsActive={settingsActive}
          socialPendingCount={socialPendingCount}
          onNavigate={navigateToMainRoute}
          onOpenDrawer={openDrawerFromBottomBar}
        />

        <EventCompanionPet
          visible={showEventCompanion && !!settings.selectedCompanionKey && currentRouteName !== 'Reader' && currentRouteName !== 'Chat'}
          bottomOffset={companionBottomOffset}
        />
      </View>
    </>
  );
}

function MainDrawerNavigator() {
  const { theme } = usePersonalization();
  const [userPlan, setUserPlan] = useState<'free' | 'premium' | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setUserPlan('free');
      return;
    }

    const docRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserPlan(data.accountType || 'free');
      } else {
        setUserPlan('free');
      }
    });

    // Escuchar solicitudes de amistad pendientes
    const friendRequestsRef = collection(db, 'friendRequests');
    const qRequests = query(
      friendRequestsRef,
      where('receiverId', '==', user.uid),
      where('status', '==', 'pending')
    );

    const unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
      setPendingRequests(snapshot.size);
    });

    // Escuchar mensajes no leídos
    const userChatsRef = doc(db, 'userChats', user.uid);
    const unsubscribeMessages = onSnapshot(userChatsRef, (docSnap) => {
      if (docSnap.exists()) {
        const chatsData = docSnap.data();
        let totalUnread = 0;

        Object.values(chatsData).forEach((chat: any) => {
          if (chat.unreadCount) {
            totalUnread += chat.unreadCount;
          }
        });

        setUnreadMessages(totalUnread);
      } else {
        setUnreadMessages(0);
      }
    });

    return () => {
      unsubscribeUser();
      unsubscribeRequests();
      unsubscribeMessages();
    };
  }, []);

  return (
    <Drawer.Navigator
      drawerContent={(props: any) => (
        <CustomDrawerContent
          {...props}
          pendingRequests={pendingRequests}
          unreadMessages={unreadMessages}
        />
      )}
      screenOptions={{
        drawerStyle: {
          width: '100%',
          backgroundColor: 'transparent',
        },
        lazy: true,
        drawerType: 'front',
        overlayColor: 'transparent',
        headerShown: false,
        swipeEnabled: false,
        swipeEdgeWidth: 0,
        swipeMinDistance: 999,
        drawerActiveTintColor: theme.accent,
        drawerInactiveTintColor: theme.textMuted,
        drawerActiveBackgroundColor: theme.accentSoft,
        drawerItemStyle: {
          borderRadius: 12,
          marginHorizontal: 10,
          marginVertical: 3,
          paddingHorizontal: 2,
        },
        drawerLabelStyle: {
          fontFamily: 'Roboto-Medium',
          fontSize: 14,
          marginLeft: -6,
        },
      }}
    >
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{
          drawerLabel: 'Inicio',
          drawerItemStyle: { display: 'none' },
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="home" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          drawerLabel: 'Biblioteca',
          drawerItemStyle: { display: 'none' },
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="bookshelf" size={size} color={color} />
          ),
        }}
      />
      {userPlan === 'premium' && (
        <Drawer.Screen
          name="Favorites"
          component={FavoritesScreen}
          options={{
            drawerLabel: 'Favoritos',
            drawerIcon: ({ color, size }: { color: string; size: number }) => (
              <MaterialCommunityIcons name="heart" size={size} color={color} />
            ),
          }}
        />
      )}
      <Drawer.Screen
        name="AddFriends"
        component={AddFriendsScreen}
        options={{
          drawerLabel: 'Social',
          drawerItemStyle: { display: 'none' },
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <View style={{ position: 'relative' }}>
              <MaterialCommunityIcons name="account-group-outline" size={size} color={color} />
              {(pendingRequests > 0 || unreadMessages > 0) && (
                <View style={{
                  position: 'absolute',
                  top: -5,
                  right: -5,
                  backgroundColor: theme.danger,
                  borderRadius: 10,
                  minWidth: 18,
                  height: 18,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 2,
                  borderColor: theme.background,
                }}>
                  <Text style={{
                    color: '#FFF',
                    fontSize: 10,
                    fontWeight: 'bold',
                  }}>
                    {pendingRequests + unreadMessages}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Drawer.Screen
        name="InProgress"
        component={InProgressScreen}
        options={{
          drawerLabel: 'En Curso',
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="book-open-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          drawerLabel: 'Perfil',
          drawerItemStyle: { display: 'none' },
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="head" size={size} color={color} />
          ),
        }}
      />
      {userPlan === 'free' && (
        <Drawer.Screen
          name="Premium"
          component={PaymentScreen}
          options={{
            drawerLabel: 'Premium',
            drawerIcon: ({ color, size }: { color: string; size: number }) => (
              <MaterialCommunityIcons name="crown" size={size} color={color} />
            ),
          }}
        />
      )}
    </Drawer.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingTutorial, setLoadingTutorial] = useState(true);
  const [needsTutorial, setNeedsTutorial] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState<string | undefined>();
  const [socialPendingCount, setSocialPendingCount] = useState(0);
  const [showEventCompanion, setShowEventCompanion] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const lastKnownUserRef = useRef<string | null>(null);

  const registerPushTokenForUser = useCallback(async (userId: string) => {
    const userRef = doc(db, 'users', userId);

    if (!Device.isDevice) {
      await setDoc(userRef, {
        pushDebug: {
          status: 'skipped_non_physical_device',
          platform: Platform.OS,
          updatedAt: serverTimestamp(),
        },
      }, { merge: true });
      return;
    }

    try {
      const permissions = await Notifications.getPermissionsAsync();
      let finalStatus = permissions.status;
      if (finalStatus !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        finalStatus = requested.status;
      }
      if (finalStatus !== 'granted') {
        await setDoc(userRef, {
          pushDebug: {
            status: 'permission_not_granted',
            permission: finalStatus,
            platform: Platform.OS,
            updatedAt: serverTimestamp(),
          },
        }, { merge: true });
        return;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF5252',
        });
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.easConfig?.projectId ||
        '5cd6ecff-6004-4696-b780-172ff5ca8a22';
      if (!projectId) {
        await setDoc(userRef, {
          pushDebug: {
            status: 'missing_project_id',
            platform: Platform.OS,
            updatedAt: serverTimestamp(),
          },
        }, { merge: true });
        return;
      }

      const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      const pushToken = String(tokenResponse?.data || '').trim();
      if (!pushToken) {
        await setDoc(userRef, {
          pushDebug: {
            status: 'empty_push_token',
            projectId,
            platform: Platform.OS,
            updatedAt: serverTimestamp(),
          },
        }, { merge: true });
        return;
      }

      await setDoc(userRef, {
        fcmToken: pushToken,
        pushToken,
        notificationEnabled: true,
        pushDebug: {
          status: 'ok',
          message: null,
          projectId,
          permission: finalStatus,
          platform: Platform.OS,
          updatedAt: serverTimestamp(),
        },
      }, { merge: true });
    } catch (error: any) {
      await setDoc(userRef, {
        pushDebug: {
          status: 'error',
          message: String(error?.message || error || 'unknown_error').slice(0, 500),
          platform: Platform.OS,
          updatedAt: serverTimestamp(),
        },
      }, { merge: true });
    }
  }, []);

  const updatePresence = useCallback(async (userId: string, state: 'online' | 'offline') => {
    try {
      const isOnline = state === 'online';
      const statusRef = doc(db, 'status', userId);
      const userRef = doc(db, 'users', userId);
      const lastSeenValue = isOnline ? null : serverTimestamp();

      await Promise.all([
        setDoc(statusRef, {
          state,
          lastSeen: lastSeenValue,
          updatedAt: serverTimestamp(),
        }, { merge: true }),
        setDoc(userRef, {
          isOnline,
          lastSeen: lastSeenValue,
        }, { merge: true }),
      ]);
    } catch {
      // silently ignored
    }
  }, []);

  const scheduleLocalNotification = useCallback(async (title: string, body: string, data?: Record<string, any>) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          data,
        },
        trigger: null,
      });
    } catch {
      // silently ignored
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const applySystemNavigationByRoute = async (routeName?: string) => {
      const isReader = routeName === 'Reader';
      try {
        if (isReader) {
          await NavigationBar.setPositionAsync('absolute');
          await NavigationBar.setBackgroundColorAsync('#00000000');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
          await NavigationBar.setVisibilityAsync('hidden');
          return;
        }

        await NavigationBar.setPositionAsync('relative');
        await NavigationBar.setBehaviorAsync('inset-touch');
        await NavigationBar.setVisibilityAsync('visible');
      } catch {
        // silently ignored
      }
    };

    applySystemNavigationByRoute(currentRouteName);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        applySystemNavigationByRoute(currentRouteName);
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [currentRouteName]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    const syncPresence = (nextState: string) => {
      const isActive = nextState === 'active';
      updatePresence(uid, isActive ? 'online' : 'offline');
    };

    syncPresence(appStateRef.current);
    const subscription = AppState.addEventListener('change', syncPresence);

    return () => {
      subscription.remove();
      updatePresence(uid, 'offline');
    };
  }, [user?.uid, updatePresence]);

  useEffect(() => {
    if (!user?.uid) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        registerPushTokenForUser(user.uid);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user?.uid, registerPushTokenForUser]);

  useEffect(() => {
    if (!user?.uid) return;

    let initialized = false;
    const previousUnreadByChat = new Map<string, number>();
    const userChatsRef = doc(db, 'userChats', user.uid);

    const unsubscribe = onSnapshot(userChatsRef, (snap) => {
      if (!snap.exists()) return;
      const chatsData = snap.data() as Record<string, any>;

      if (!initialized) {
        Object.entries(chatsData).forEach(([chatKey, chat]) => {
          previousUnreadByChat.set(chatKey, Number(chat?.unreadCount || 0));
        });
        initialized = true;
        return;
      }

      Object.entries(chatsData).forEach(([chatKey, chat]) => {
        const nextUnread = Number(chat?.unreadCount || 0);
        const prevUnread = Number(previousUnreadByChat.get(chatKey) || 0);

        if (nextUnread > prevUnread) {
          const sender = String(chat?.recipientName || 'Nuevo mensaje');
          const preview = String(chat?.lastMessage || 'Tienes un nuevo mensaje.');
          scheduleLocalNotification(sender, preview, { type: 'chat', chatKey });
        }

        previousUnreadByChat.set(chatKey, nextUnread);
      });
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid, scheduleLocalNotification]);

  useEffect(() => {
    const appSettingsRef = doc(db, 'parameters', 'appSettings');
    const unsubscribeFlags = onSnapshot(
      appSettingsRef,
      (snap) => { applyEventFlagsFromAppSettings(snap.exists() ? snap.data() : {}); },
      () => { applyEventFlagsFromAppSettings({}); }
    );
    const liveConfigRef = doc(db, 'parameters', 'liveConfig');
    const unsubscribeConfig = onSnapshot(
      liveConfigRef,
      (snap) => { if (snap.exists()) applyLiveConfigFromFirestore(snap.data()); },
      () => { /* silently ignored — hardcoded defaults remain active */ }
    );
    return () => { unsubscribeFlags(); unsubscribeConfig(); };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setSocialPendingCount(0);
      setShowEventCompanion(false);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    const userChatsRef = doc(db, 'userChats', user.uid);

    let pendingRequests = 0;
    let unreadMessages = 0;

    const recompute = () => {
      setSocialPendingCount(Math.max(0, pendingRequests + unreadMessages));
    };

    const unsubscribeUser = onSnapshot(userRef, (snap) => {
      const data = snap.data();
      pendingRequests = Array.isArray(data?.pendingReceivedRequests) ? data.pendingReceivedRequests.length : 0;
      const purchasedItems = Array.isArray(data?.purchasedItems) ? data.purchasedItems : [];
      const companionIds = getCompanionStoreItems().map((it) => it.id);
      setShowEventCompanion(companionIds.some((id) => purchasedItems.includes(id)));
      recompute();
    });

    const unsubscribeChats = onSnapshot(userChatsRef, (snap) => {
      unreadMessages = 0;
      if (snap.exists()) {
        Object.values(snap.data()).forEach((chat: any) => {
          unreadMessages += Number(chat?.unreadCount || 0);
        });
      }
      recompute();
    });

    return () => {
      unsubscribeUser();
      unsubscribeChats();
    };
  }, [user?.uid]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setUser(currentUser);
            lastKnownUserRef.current = currentUser.uid;
            registerPushTokenForUser(currentUser.uid);
            try {
              const tutorialKey = `tutorialSeen:${currentUser.uid}`;
              const tutorialSeen = await AsyncStorage.getItem(tutorialKey);
              setNeedsTutorial(tutorialSeen !== '1');
            } catch {
              setNeedsTutorial(false);
            }
          } else {
            await auth.signOut();
            setUser(null);
            setNeedsTutorial(false);
          }
        } catch (error) {
          await auth.signOut();
          setUser(null);
          setNeedsTutorial(false);
        }
      } else {
        const lastUid = lastKnownUserRef.current;
        if (lastUid) {
          updatePresence(lastUid, 'offline');
        }
        lastKnownUserRef.current = null;
        setUser(null);
        setNeedsTutorial(false);
      }
      setLoadingAuth(false);
      setLoadingTutorial(false);
    });

    return () => unsubscribe();
  }, []);

  if (loadingAuth || loadingTutorial) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F0F15' }}>
        <ActivityIndicator size="large" color="#FF5252" />
        <Text style={{ color: '#FFF', marginTop: 10, fontSize: 16 }}>Preparando app...</Text>
      </View>
    );
  }

  const handleNavStateChange = () => {
    if (!navigationRef.isReady()) return;
    setCurrentRouteName(getActiveRouteName(navigationRef.getRootState()));
  };

  const navigateToMainRoute = (routeName: 'Library' | 'AddFriends' | 'Home' | 'Profile') => {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('Main' as never, { screen: routeName } as never);
  };

  const openDrawerFromBottomBar = () => {
    if (!navigationRef.isReady()) return;
    const rootState = navigationRef.getRootState();
    const topRoute = rootState.routes[rootState.index ?? 0]?.name;
    if (topRoute !== 'Main') {
      navigationRef.navigate('Main' as never);
      requestAnimationFrame(() => {
        navigationRef.dispatch(DrawerActions.openDrawer());
      });
      return;
    }
    navigationRef.dispatch(DrawerActions.openDrawer());
  };

  const shouldShowBottomBar = !!user
    && currentRouteName !== 'Auth'
    && currentRouteName !== 'Reader'
    && currentRouteName !== 'Tutorial'
    && currentRouteName !== 'Personalization'
    && currentRouteName !== 'Chat'
    && currentRouteName !== 'Comments';
  const settingsActive = navigationRef.isReady() ? isDrawerOpenInState(navigationRef.getRootState()) : false;

  // Oculta el BottomBar si el drawer de ajustes está abierto
  const shouldShowBottomBarFinal = shouldShowBottomBar && !settingsActive;

  return (
    <PersonalizationProvider>
      <AlertProvider>
        <SafeAreaProvider>
          <NavigationContainer ref={navigationRef} onReady={handleNavStateChange} onStateChange={handleNavStateChange}>
            <ThemedNavigationShell
              user={user}
              needsTutorial={needsTutorial}
              currentRouteName={currentRouteName}
              settingsActive={settingsActive}
              shouldShowBottomBar={shouldShowBottomBarFinal}
              socialPendingCount={socialPendingCount}
              navigateToMainRoute={navigateToMainRoute}
              openDrawerFromBottomBar={openDrawerFromBottomBar}
              showEventCompanion={showEventCompanion}
            />
          </NavigationContainer>
        </SafeAreaProvider>
      </AlertProvider>
    </PersonalizationProvider>

  );
}