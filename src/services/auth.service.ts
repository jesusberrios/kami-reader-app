import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    onAuthStateChanged,
    sendPasswordResetEmail,
    User,
    UserCredential,
} from 'firebase/auth';
import { auth } from '../firebase/config';

export default class AuthService {
    static async login(email: string, password: string): Promise<UserCredential> {
        return await signInWithEmailAndPassword(auth, email, password);
    }

    static async register(email: string, password: string): Promise<UserCredential> {
        return await createUserWithEmailAndPassword(auth, email, password);
    }

    static async logout(): Promise<void> {
        await signOut(auth);
    }

    static async resetPassword(email: string): Promise<void> {
        await sendPasswordResetEmail(auth, email);
    }

    static getCurrentUser(): User | null {
        return auth.currentUser;
    }
    static sendEmailVerification = async (user: User) => {
        await sendEmailVerification(user);
    };

    static onAuthStateChanged(callback: (user: User | null) => void): () => void {
        return onAuthStateChanged(auth, callback);
    }
}
