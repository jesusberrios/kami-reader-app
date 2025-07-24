import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Config
const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: "habits-44ab9.firebaseapp.com",
    projectId: "habits-44ab9",
    storageBucket: "habits-44ab9.appspot.com",
    messagingSenderId: "352507635034",
    appId: "1:352507635034:android:a528fab9e538c966577f63"
};

// Init
const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
});

const db = getFirestore(app); // ← esto es lo correcto para React Native

export { auth, db };
