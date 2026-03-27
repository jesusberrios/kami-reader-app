import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { StatusBar, View, ActivityIndicator, Text, Platform } from 'react-native';
import { DrawerActions, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { CardStyleInterpolators, TransitionSpecs } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NavigationBar from 'expo-navigation-bar';

// Firebase imports
import { auth, db } from './src/firebase/config';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { User } from 'firebase/auth';

// Screens
import AuthScreen from './src/screens/AuthScreen';
import CustomDrawerContent from './src/components/customDrawerContent';
import HomeScreen from './src/screens/HomeScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import DetailsScreen from './src/screens/DetailsScreen';
import ReaderScreen from './src/screens/ReaderScreen';
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
import { AlertProvider } from './src/contexts/AlertContext';
import GlobalBottomBar from './src/components/GlobalBottomBar';
import { PersonalizationProvider, usePersonalization } from './src/contexts/PersonalizationContext';
// Navigation Types - Actualizado para v6+
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Tutorial: { manual?: boolean } | undefined;
  Personalization: undefined;
  Details: { slug: string };
  Reader: { hid: string };
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
  navigateToMainRoute,
  openDrawerFromBottomBar,
}: {
  user: User | null;
  needsTutorial: boolean;
  currentRouteName?: string;
  settingsActive: boolean;
  shouldShowBottomBar: boolean;
  navigateToMainRoute: (routeName: 'Library' | 'AddFriends' | 'Home' | 'Profile') => void;
  openDrawerFromBottomBar: () => void;
}) {
  const { theme } = usePersonalization();

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
            animationEnabled: true,
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
          <Stack.Screen name="Details" component={DetailsScreen} />
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
        </Stack.Navigator>

        <GlobalBottomBar
          currentRouteName={currentRouteName}
          visible={shouldShowBottomBar}
          settingsActive={settingsActive}
          onNavigate={navigateToMainRoute}
          onOpenDrawer={openDrawerFromBottomBar}
        />
      </View>
    </>
  );
}

function MainDrawerNavigator() {
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
      drawerContent={(props) => (
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
        drawerType: 'front',
        overlayColor: 'transparent',
        headerShown: false,
        swipeEnabled: false,
        swipeEdgeWidth: 0,
        swipeMinDistance: 999,
        drawerActiveTintColor: '#FF6E6E',
        drawerInactiveTintColor: '#C5C5D6',
        drawerActiveBackgroundColor: 'rgba(255, 110, 110, 0.18)',
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
          drawerIcon: ({ color, size }) => (
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
          drawerIcon: ({ color, size }) => (
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
            drawerIcon: ({ color, size }) => (
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
          drawerIcon: ({ color, size }) => (
            <View style={{ position: 'relative' }}>
              <MaterialCommunityIcons name="account-group-outline" size={size} color={color} />
              {(pendingRequests > 0 || unreadMessages > 0) && (
                <View style={{
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
                  borderColor: '#121218',
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
          drawerIcon: ({ color, size }) => (
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
          drawerIcon: ({ color, size }) => (
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
            drawerIcon: ({ color, size }) => (
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

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const configureSystemNavigation = async () => {
      try {
        await NavigationBar.setPositionAsync('absolute');
        await NavigationBar.setBackgroundColorAsync('#00000000');
        await NavigationBar.setBehaviorAsync('overlay-swipe');
        await NavigationBar.setVisibilityAsync('hidden');
      } catch {
        // silently ignored
      }
    };

    configureSystemNavigation();
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setUser(currentUser);
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

  const shouldShowBottomBar = !!user && currentRouteName !== 'Auth' && currentRouteName !== 'Reader' && currentRouteName !== 'Tutorial' && currentRouteName !== 'Personalization';
  const settingsActive = navigationRef.isReady() ? isDrawerOpenInState(navigationRef.getRootState()) : false;

  // Oculta el BottomBar si el drawer de ajustes está abierto
  const shouldShowBottomBarFinal = shouldShowBottomBar && !settingsActive;

  return (
    <AlertProvider>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef} onReady={handleNavStateChange} onStateChange={handleNavStateChange}>
          <PersonalizationProvider>
            <ThemedNavigationShell
              user={user}
              needsTutorial={needsTutorial}
              currentRouteName={currentRouteName}
              settingsActive={settingsActive}
              shouldShowBottomBar={shouldShowBottomBarFinal}
              navigateToMainRoute={navigateToMainRoute}
              openDrawerFromBottomBar={openDrawerFromBottomBar}
            />
          </PersonalizationProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </AlertProvider>

  );
}