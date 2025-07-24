import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { StatusBar, View, ActivityIndicator, Text } from 'react-native'; // Import View, ActivityIndicator, Text
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Firebase imports - ajusta según tu configuración
import { auth, db } from './src/firebase/config';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { User } from 'firebase/auth'; // Import User type

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
import ChatScreen from './src/screens/ChatScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import CommentsScreen from './src/screens/ComentsScreen';

// Navigation Types
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Details: { slug: string };
  Reader: { hid: string };
  Payment: undefined;
  Chat: { clientId?: string };
  Profile: undefined;
  Comments: undefined;
  ChatList: undefined;
};

export type DrawerParamList = {
  Home: undefined;
  Profile: undefined;
  Library: undefined;
  Favorites: undefined;
  Premium: undefined; // Added Premium screen to DrawerParamList
};

// Combina ambos tipos para el drawer
export type CombinedDrawerParamList = RootStackParamList & DrawerParamList;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends CombinedDrawerParamList { }
  }
}

const Stack = createStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator<DrawerParamList>();

function MainDrawerNavigator() {
  const [userPlan, setUserPlan] = useState<'free' | 'premium' | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setUserPlan('free');
      return;
    }

    const docRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserPlan(data.accountType || 'free');
      } else {
        setUserPlan('free');
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
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
        name="Profile"
        component={ProfileScreen}
        options={{
          drawerLabel: 'Perfil',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="head" size={size} color={color} />
          ),
        }}
      />
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
    </Drawer.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true); // New state for initial auth loading

  useEffect(() => {
    // This is the primary listener for Firebase authentication state.
    // It runs once when the app starts and whenever the user's auth state changes.
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        // If a user is logged in, verify their profile in Firestore
        // This ensures that even if the auth token is valid, their profile data exists.
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setUser(currentUser); // Set user if profile exists
          } else {
            // If profile doesn't exist, log them out (incomplete registration)
            console.warn("User profile not found in Firestore for UID:", currentUser.uid);
            await auth.signOut(); // Log out the user
            setUser(null); // Clear user state
          }
        } catch (error) {
          console.error("Error verifying user profile at App root:", error);
          await auth.signOut(); // Log out on error
          setUser(null); // Clear user state
        }
      } else {
        setUser(null); // No user is logged in
      }
      setLoadingAuth(false); // Authentication check is complete
    });

    // Clean up the subscription when the component unmounts
    return () => unsubscribe();
  }, []); // Empty dependency array means this effect runs only once on mount

  if (loadingAuth) {
    // Show a full-screen loading indicator while Firebase checks the auth state
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F0F15' }}>
        <ActivityIndicator size="large" color="#FF5252" />
        <Text style={{ color: '#FFF', marginTop: 10, fontSize: 16 }}>Verificando sesión...</Text>
      </View>
    );
  }

  return (
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
        {user ? ( // Conditionally render based on authentication state
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
        {/* These screens are accessible from Main, so they should be part of the Stack */}
        <Stack.Screen name="Details" component={DetailsScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="ChatList" component={ChatListScreen} />
        <Stack.Screen name="Comments" component={CommentsScreen} />
        <Stack.Screen
          name="Reader"
          component={ReaderScreen}
          options={{
            gestureEnabled: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
