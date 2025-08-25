import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { StatusBar, View, ActivityIndicator, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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
import { AlertProvider } from './src/contexts/AlertContext';
// Navigation Types - Actualizado para v6+
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Details: { slug: string };
  Reader: { hid: string };
  AddFriends: undefined;
  Payment: undefined;
  Chat: { recipientId?: string; recipientName?: string };
  Profile: { userId?: string };
  Comments: undefined;
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
          width: 280,
          backgroundColor: '#121218',
        },
        drawerType: 'slide',
        overlayColor: 'rgba(0, 0, 0, 0.5)',
        headerShown: false,
        swipeEdgeWidth: 30,
        swipeMinDistance: 50,
        drawerActiveTintColor: '#FF6E6E',
        drawerInactiveTintColor: '#C5C5D6',
        drawerActiveBackgroundColor: 'rgba(255, 110, 110, 0.12)',
        drawerItemStyle: {
          borderRadius: 8,
          marginHorizontal: 8,
          marginVertical: 2,
        },
        drawerLabelStyle: {
          fontFamily: 'Roboto-Medium',
          fontSize: 14,
          marginLeft: -8,
        },
      }}
    >
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{
          drawerLabel: 'Inicio',
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

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setUser(currentUser);
          } else {
            console.warn("User profile not found in Firestore for UID:", currentUser.uid);
            await auth.signOut();
            setUser(null);
          }
        } catch (error) {
          console.error("Error verifying user profile at App root:", error);
          await auth.signOut();
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  if (loadingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F0F15' }}>
        <ActivityIndicator size="large" color="#FF5252" />
        <Text style={{ color: '#FFF', marginTop: 10, fontSize: 16 }}>Verificando sesión...</Text>
      </View>
    );
  }

  return (
    <AlertProvider>
      <NavigationContainer>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyle: {
              backgroundColor: '#1E1E28',
            },
            cardOverlayEnabled: true,
            cardShadowEnabled: true,
            gestureEnabled: true,
            gestureDirection: 'horizontal',
            gestureResponseDistance: 50,
            cardStyleInterpolator: ({ current, layouts }) => ({
              cardStyle: {
                transform: [
                  {
                    translateX: current.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [layouts.screen.width, 0],
                    }),
                  },
                ],
              },
              overlayStyle: {
                opacity: current.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.5],
                }),
              },
            }),
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
          {/* Screens accesibles desde Main */}
          <Stack.Screen name="Details" component={DetailsScreen} />
          <Stack.Screen name="Payment" component={PaymentScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Comments" component={CommentsScreen} />
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
      </NavigationContainer>
    </AlertProvider>

  );
}