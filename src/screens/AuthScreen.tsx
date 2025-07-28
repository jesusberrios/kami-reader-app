import React, { useEffect, useState } from 'react';
import {
    View,
    TextInput,
    Alert,
    StyleSheet,
    ActivityIndicator,
    ImageBackground,
    Text,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    Dimensions,
    ScrollView,
    Modal,
    SafeAreaView,
    Linking, // Import Linking for external URLs
} from 'react-native';
import { useNavigation } from '@react-navigation/native/';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import AuthService from '../services/auth.service';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import UpdateRequiredModal from '../components/updateRequiredModal';
import { getAppVersion } from '../utils/versionUtils';
import { User } from 'firebase/auth';

const { width, height } = Dimensions.get('window');

type AuthScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Auth'>;

// A simple placeholder avatar. In a real app, you might use a more sophisticated
// service or generate a unique avatar based on the username.
const generatePlaceholderAvatar = (username: string): string => {
    // This is a minimal transparent GIF. For a visible placeholder,
    // you'd typically use a small, pre-made image or generate a simple SVG.
    // Example: `https://placehold.co/100x100/333333/FFFFFF?text=${username.charAt(0).toUpperCase()}`
    return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
};
const APP_IDS = {
    ios: '5cd6ecff-6004-4696-b780-172ff5ca8a22',
    android: 'com.yourusername.kamireader'
};
const AuthScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(true); // Set to true initially to show loading while checking auth state
    const [secureEntry, setSecureEntry] = useState(true);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [termsVisible, setTermsVisible] = useState(false);
    const [termsContent, setTermsContent] = useState('');
    const [resetEmail, setResetEmail] = useState(''); // New state for reset password email
    const [resetVisible, setResetVisible] = useState(false); // New state for reset password modal visibility
    const navigation = useNavigation<AuthScreenNavigationProp>();
    const insets = useSafeAreaInsets();
    const allowedDomains = [
        'gmail.com',
        'outlook.com',
        'hotmail.com',
        'yahoo.com',
        'icloud.com',
        'live.com',
        'msn.com'
    ];
    const [updateModalVisible, setUpdateModalVisible] = useState(false);
    const [minVersion, setMinVersion] = useState('');
    const [currentVersion, setCurrentVersion] = useState('');
    const [emailError, setEmailError] = useState('');
    // Función para traducir los errores de Firebase
    const translateFirebaseError = (error: any): string => {
        switch (error.code) {
            // Errores de autenticación
            case 'auth/invalid-email':
                return 'El correo electrónico no es válido';
            case 'auth/user-disabled':
                return 'Esta cuenta ha sido deshabilitada';
            case 'auth/user-not-found':
                return 'No existe una cuenta con este correo';
            case 'auth/wrong-password':
                return 'Usuario o contraseña incorrectos';
            case 'auth/email-already-in-use':
                return 'Este correo ya está registrado';
            case 'auth/operation-not-allowed':
                return 'Esta operación no está permitida';
            case 'auth/weak-password':
                return 'La contraseña es demasiado débil (mínimo 6 caracteres)';
            case 'auth/too-many-requests':
                return 'Demasiados intentos. Por favor espera e intenta más tarde';
            case 'auth/account-exists-with-different-credential':
                return 'Ya existe una cuenta con este correo usando otro método de autenticación';
            case 'auth/requires-recent-login':
                return 'Esta operación requiere que inicies sesión nuevamente';
            case 'auth/provider-already-linked':
                return 'Esta cuenta ya está vinculada con otro proveedor';
            case 'auth/credential-already-in-use':
                return 'Estas credenciales ya están en uso por otra cuenta';
            case 'auth/invalid-credential':
                return 'Credenciales inválidas o expiradas';
            case 'auth/invalid-verification-code':
                return 'Código de verificación inválido';
            case 'auth/invalid-verification-id':
                return 'ID de verificación inválido';
            case 'auth/missing-verification-code':
                return 'Falta el código de verificación';
            case 'auth/missing-verification-id':
                return 'Falta el ID de verificación';
            case 'auth/network-request-failed':
                return 'Error de conexión. Por favor verifica tu internet';
            case 'auth/timeout':
                return 'Tiempo de espera agotado. Por favor intenta nuevamente';
            case 'auth/expired-action-code':
                return 'El enlace ha expirado';
            case 'auth/invalid-action-code':
                return 'El enlace es inválido o ya fue usado';

            // Errores de verificación de email
            case 'auth/missing-email':
                return 'Falta el correo electrónico';

            // Errores genéricos
            default:
                return error.message || 'Ocurrió un error inesperado';
        }
    };
    useEffect(() => {
        const checkAppVersion = async () => {
            try {
                // Obtener la versión actual de la app
                const appVersion = getAppVersion(); // Asegúrate de importar getAppVersion
                setCurrentVersion(appVersion);

                // Obtener la versión mínima requerida de Firestore
                const paramsDoc = await getDoc(doc(db, "parameters", "appSettings"));
                if (paramsDoc.exists()) {
                    const requiredVersion = paramsDoc.data().minAppVersion;
                    setMinVersion(requiredVersion);

                    // Comparar versiones
                    if (isVersionOutdated(appVersion, requiredVersion)) {
                        setUpdateModalVisible(true);
                    }
                }
            } catch (error) {
                console.error("Error al verificar la versión de la app:", error);
            }
        };
        const unsubscribe = AuthService.onAuthStateChanged(async (user) => {
            if (user) {
                // Verificar si el correo está verificado
                await user.reload(); // Actualiza el estado de verificación
                if (user.emailVerified) {
                    await checkUserProfile(user.uid);
                } else {
                    // Forzar cierre de sesión si no está verificado
                    await AuthService.logout();
                    Alert.alert(
                        'Verificación requerida',
                        'Debes verificar tu correo electrónico antes de acceder. ¿Quieres que reenviemos el correo de verificación?',
                        [
                            {
                                text: 'Cancelar',
                                style: 'cancel'
                            },
                            {
                                text: 'Reenviar correo',
                                onPress: () => handleResendVerification(user)
                            }
                        ]
                    );
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        });
        // Effect to fetch terms and conditions from Firestore
        const fetchTerms = async () => {
            try {
                const termsDoc = await getDoc(doc(db, "documents", "ky3lJBuFrZnZjnt9mHll")); // Corrected doc ID+
                console.log(termsDoc.exists(), termsDoc.data()?.content);

                if (termsDoc.exists() && termsDoc.data()?.content) {
                    setTermsContent(termsDoc.data().content);
                } else {
                    setTermsContent('No se pudieron cargar los términos y condiciones.');
                }
            } catch (error) {
                console.error("Error fetching terms and conditions:", error);
                setTermsContent('Error al cargar los términos y condiciones.');
            }
        };

        fetchTerms();
        checkAppVersion();
        return () => unsubscribe(); // Cleanup auth listener when component unmounts
    }, []);
    const isVersionOutdated = (current: string, required: string): boolean => {
        const currentParts = current.split('.').map(Number);
        const requiredParts = required.split('.').map(Number);

        for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
            const currentPart = currentParts[i] || 0;
            const requiredPart = requiredParts[i] || 0;

            if (currentPart < requiredPart) return true;
            if (currentPart > requiredPart) return false;
        }

        return false; // Las versiones son iguales
    };

    const validateEmail = (email: string): string => {
        const trimmed = email.trim().toLowerCase();

        if (!trimmed) return ''; // No mostrar error si está vacío

        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!re.test(trimmed)) return 'Formato de correo inválido';

        const domain = trimmed.split('@')[1];
        if (!allowedDomains.includes(domain)) {
            return `Dominio no permitido. Usa: ${allowedDomains.join(', ')}`;
        }

        return ''; // No hay error
    };
    const handleResendVerification = async (user: User | null | undefined) => {
        if (!user) {
            Alert.alert('Error', 'No hay usuario autenticado');
            return;
        }

        try {
            await AuthService.sendEmailVerification(user);
            Alert.alert('Correo reenviado', 'Se ha enviado un nuevo correo de verificación');
        } catch (error: any) {
            Alert.alert('Error', translateFirebaseError(error));
        }
    };
    // Function to check if user profile exists in Firestore and navigate
    const checkUserProfile = async (userId: string) => {
        try {
            const userDoc = await getDoc(doc(db, "users", userId));
            if (userDoc.exists()) {
                // If profile exists, navigate to Main screen and reset navigation stack
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Main' }],
                });
            } else {
                // If user profile is not found in Firestore (e.g., incomplete registration),
                // log them out and show an alert.
                console.warn("User profile not found in Firestore for UID:", userId);
                await AuthService.logout();
                Alert.alert('Error', 'Tu perfil de usuario no está completo. Por favor, intenta iniciar sesión de nuevo.');
                setLoading(false); // Stop loading and show auth screen
            }
        } catch (error) {
            console.error("Error verifying user profile:", error);
            Alert.alert('Error', 'No se pudo verificar tu perfil. Por favor, reinicia la aplicación.');
            await AuthService.logout(); // Log out in case of verification error
            setLoading(false); // Stop loading and show auth screen
        }
    };

    // Luego modifica las funciones que muestran errores para usar esta traducción:

    const handleLogin = async () => {
        try {
            setLoading(true);
            await AuthService.login(email, password);
        } catch (error: any) {
            if (error.code === 'auth/email-not-verified') {
                const currentUser = AuthService.getCurrentUser();
                Alert.alert(
                    'Correo no verificado',
                    'Por favor verifica tu correo electrónico antes de iniciar sesión.',
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                            text: 'Reenviar verificación',
                            onPress: () => {
                                if (currentUser) {
                                    handleResendVerification(currentUser);
                                }
                            }
                        }
                    ]
                );
            } else {
                Alert.alert('Error de autenticación', translateFirebaseError(error));
            }
            setLoading(false);
        }
    };

    const handleRegister = async () => {
        if (!termsAccepted) {
            Alert.alert('Términos y condiciones', 'Debes aceptar los términos y condiciones para registrarte.');
            return;
        }

        if (emailError) {
            Alert.alert('Correo inválido', emailError);
            return;
        }

        try {
            setLoading(true);
            const userCredential = await AuthService.register(email, password);
            const user = userCredential.user;

            await AuthService.sendEmailVerification(user);

            const avatarBase64 = generatePlaceholderAvatar(username);

            await setDoc(doc(db, "users", user.uid), {
                username,
                email,
                emailVerified: false,
                avatar: avatarBase64,
                createdAt: new Date(),
                lastLogin: new Date(),
                preferences: {
                    theme: 'dark',
                    readingDirection: 'right-to-left',
                    notificationEnabled: true
                },
                accountType: 'free',
            });

            Alert.alert(
                'Verificación requerida',
                'Se ha enviado un correo de verificación a tu dirección de email. Por favor verifica tu correo antes de iniciar sesión.',
                [
                    {
                        text: 'OK',
                        onPress: () => setIsLogin(true)
                    }
                ]
            );
        } catch (error: any) {
            Alert.alert('Error en el registro', translateFirebaseError(error));
        } finally {
            setLoading(false);
        }
    };

    // Main authentication handler (login or register)
    const handleAuth = async () => {
        if (!email || !password) {
            Alert.alert('Campos requeridos', 'Por favor ingresa tu correo y contraseña');
            return;
        }

        if (!isLogin && !username) {
            Alert.alert('Nombre de usuario requerido', 'Por favor ingresa un nombre de usuario');
            return;
        }

        try {
            if (isLogin) {
                await handleLogin();
            } else {
                await handleRegister();
            }
        } catch (error: any) {
            // This catch block might be redundant if handleLogin/handleRegister already catch
            // but it's good for a final fallback.
            Alert.alert('Error', error.message || 'Ocurrió un problema al procesar tu solicitud');
            setLoading(false); // Ensure loading is stopped on any unexpected error
        }
    };

    // Toggle visibility of terms and conditions modal
    const toggleTermsVisibility = () => {
        setTermsVisible(!termsVisible);
    };

    // Handle accepting terms and conditions
    const handleAcceptTerms = () => {
        setTermsAccepted(true);
        setTermsVisible(false);
    };

    // Handle rejecting terms and conditions
    const handleRejectTerms = () => {
        setTermsAccepted(false);
        setTermsVisible(false);
    };

    // Toggle visibility of reset password modal
    const toggleResetVisibility = () => {
        setResetVisible(!resetVisible);
    };

    const handleSendResetPassword = async () => {
        if (!resetEmail) {
            Alert.alert('Correo requerido', 'Por favor ingresa tu correo electrónico.');
            return;
        }
        setLoading(true);
        try {
            await AuthService.resetPassword(resetEmail);
            Alert.alert('Correo enviado', 'Se ha enviado un correo electrónico a ' + resetEmail + ' con instrucciones para restablecer tu contraseña.');
            setResetVisible(false);
        } catch (error: any) {
            Alert.alert('Error al restablecer la contraseña', translateFirebaseError(error));
        } finally {
            setLoading(false);
        }
    };

    // Function to open external links (Terms of Service, Privacy Policy)
    const openExternalLink = (url: string) => {
        Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
    };

    // Show full screen loading indicator if authentication state is being checked
    if (loading) {
        return (
            <View style={styles.fullScreenLoading}>
                <ActivityIndicator size="large" color="#FF5252" />
                <Text style={styles.loadingText}>Verificando sesión...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <ImageBackground
                source={require('../../assets/auth-bg.png')}
                style={styles.background}
                resizeMode="cover"
                blurRadius={2}
            >
                <StatusBar
                    translucent
                    backgroundColor="transparent"
                    barStyle="light-content"
                />

                <LinearGradient
                    colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.9)']}
                    style={styles.gradient}
                >
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
                        // Adjust keyboardVerticalOffset to prevent content from being hidden by keyboard
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -(insets.bottom || 0)}
                    >
                        <ScrollView
                            contentContainerStyle={styles.scrollContainer}
                            keyboardShouldPersistTaps="handled"
                        >
                            <View style={styles.logoContainer}>
                                <MaterialCommunityIcons name="book-open-variant" size={60} color="#FF5252" />
                                <Text style={styles.logoText}>KAMIREADER</Text>
                                <Text style={styles.tagline}>Tu biblioteca de manga global</Text>
                            </View>

                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>
                                    {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
                                </Text>

                                {!isLogin && (
                                    <View style={styles.inputGroup}>
                                        <Text style={styles.label}>Nombre de usuario</Text>
                                        <View style={styles.inputWrapper}>
                                            <MaterialCommunityIcons name="account" size={20} color="#888" style={styles.inputIcon} />
                                            <TextInput
                                                placeholder="Ej: otakulover"
                                                placeholderTextColor="#888"
                                                value={username}
                                                onChangeText={setUsername}
                                                style={styles.input}
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                textContentType="username" // Added for autofill
                                            />
                                        </View>
                                    </View>
                                )}

                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Correo electrónico</Text>
                                    <View style={[
                                        styles.inputWrapper,
                                        emailError && styles.inputWrapperError // Aplica estilo de error si hay mensaje
                                    ]}>
                                        <MaterialCommunityIcons
                                            name="email"
                                            size={20}
                                            color={emailError ? '#FF5252' : '#888'}
                                            style={styles.inputIcon}
                                        />
                                        <TextInput
                                            placeholder="tucorreo@ejemplo.com"
                                            placeholderTextColor="#888"
                                            value={email}
                                            onChangeText={(text) => {
                                                setEmail(text);
                                                setEmailError(validateEmail(text)); // Valida en tiempo real
                                            }}
                                            onBlur={() => {
                                                // Validación adicional al salir del campo
                                                setEmailError(validateEmail(email));
                                            }}
                                            style={styles.input}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            textContentType="emailAddress"
                                        />
                                    </View>
                                    {emailError ? (
                                        <Text style={styles.errorText}>
                                            <MaterialCommunityIcons name="alert-circle" size={14} color="#FF5252" /> {emailError}
                                        </Text>
                                    ) : null}
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Contraseña</Text>
                                    <View style={styles.inputWrapper}>
                                        <MaterialCommunityIcons name="lock" size={20} color="#888" style={styles.inputIcon} />
                                        <TextInput
                                            placeholder="••••••••"
                                            placeholderTextColor="#888"
                                            value={password}
                                            onChangeText={setPassword}
                                            secureTextEntry={secureEntry}
                                            style={styles.input}
                                            textContentType={secureEntry ? "password" : "none"} // Added for autofill
                                        />
                                        <TouchableOpacity
                                            onPress={() => setSecureEntry(!secureEntry)}
                                            style={styles.eyeIcon}
                                            accessibilityLabel={secureEntry ? "Mostrar contraseña" : "Ocultar contraseña"}
                                            accessibilityRole="button"
                                        >
                                            <MaterialCommunityIcons
                                                name={secureEntry ? "eye-off" : "eye"}
                                                size={20}
                                                color="#888"
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {!isLogin && (
                                    <>
                                        <View style={styles.termsContainer}>
                                            <TouchableOpacity
                                                style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}
                                                onPress={() => setTermsAccepted(!termsAccepted)}
                                                accessibilityLabel={termsAccepted ? "Términos y condiciones aceptados" : "Aceptar términos y condiciones"}
                                                accessibilityRole="checkbox"
                                                accessibilityState={{ checked: termsAccepted }}
                                            >
                                                {termsAccepted && <MaterialCommunityIcons name="check" size={16} color="white" />}
                                            </TouchableOpacity>
                                            <Text style={styles.termsLabel}>Acepto los términos y condiciones</Text>
                                        </View>
                                        <View style={styles.termsLinkContainer}>
                                            <TouchableOpacity onPress={toggleTermsVisibility}>
                                                <Text style={styles.termsLink}>Leer términos y condiciones</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                )}

                                <TouchableOpacity
                                    style={styles.primaryButton}
                                    onPress={handleAuth}
                                    activeOpacity={0.8}
                                    disabled={loading || (!isLogin && (!termsAccepted || !!emailError || !username))}
                                    accessibilityLabel={isLogin ? 'Iniciar Sesión' : 'Registrarme'}
                                    accessibilityRole="button"
                                >
                                    <LinearGradient
                                        colors={['#FF6B6B', '#FF4F4F']}
                                        style={styles.buttonGradient}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                    >
                                        {loading ? (
                                            <ActivityIndicator size="small" color="white" />
                                        ) : (
                                            <>
                                                <Text style={styles.primaryButtonText}>
                                                    {isLogin ? 'INICIAR SESIÓN' : 'REGISTRARME'}
                                                </Text>
                                                <MaterialCommunityIcons
                                                    name={isLogin ? "login" : "account-plus"}
                                                    size={20}
                                                    color="white"
                                                    style={styles.buttonIcon}
                                                />
                                            </>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setIsLogin(!isLogin)}
                                    style={styles.secondaryButton}
                                    disabled={loading}
                                    accessibilityLabel={isLogin ? 'Cambiar a registro' : 'Cambiar a inicio de sesión'}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.secondaryButtonText}>
                                        {isLogin
                                            ? '¿No tienes cuenta? Regístrate'
                                            : '¿Ya tienes cuenta? Inicia sesión'}
                                    </Text>
                                </TouchableOpacity>

                                {isLogin && (
                                    <TouchableOpacity
                                        onPress={toggleResetVisibility}
                                        style={styles.forgotPasswordButton}
                                        disabled={loading}
                                        accessibilityLabel="Olvidaste tu contraseña"
                                        accessibilityRole="button"
                                    >
                                        <Text style={styles.forgotPasswordText}>
                                            ¿Olvidaste tu contraseña?
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                {/* Mostrar solo en login: reenviar verificación */}
                                {isLogin && (
                                    <TouchableOpacity
                                        onPress={() => handleResendVerification(AuthService.getCurrentUser())}
                                        style={styles.resendVerificationButton}
                                        disabled={loading}
                                    >
                                        <Text style={styles.resendVerificationText}>
                                            ¿No recibiste el correo de verificación?
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View style={styles.footer}>
                                <Text style={styles.footerText}>
                                    Al continuar, aceptas nuestros
                                    <TouchableOpacity onPress={() => openExternalLink('https://example.com/terms-of-service')} accessibilityLabel="Términos de servicio">
                                        <Text style={styles.link}> Términos de servicio</Text>
                                    </TouchableOpacity>
                                    y
                                    <TouchableOpacity onPress={() => openExternalLink('https://example.com/privacy-policy')} accessibilityLabel="Política de privacidad">
                                        <Text style={styles.link}> Política de privacidad</Text>
                                    </TouchableOpacity>
                                </Text>
                                <Text style={styles.copyright}>
                                    © {new Date().getFullYear()} Kamireader - Todos los derechos reservados
                                </Text>
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </LinearGradient>

                {/* Terms and Conditions Modal */}
                <Modal
                    animationType="slide"
                    transparent={true}
                    visible={termsVisible}
                    onRequestClose={toggleTermsVisibility}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContainer}>
                            <Text style={styles.modalTitle}>Términos y Condiciones</Text>
                            <ScrollView style={styles.modalTextContainer}>
                                <Text style={styles.modalText}>
                                    {termsContent.split('\\n').join('\n')}
                                </Text>
                            </ScrollView>
                            <View style={styles.modalButtons}>
                                <TouchableOpacity style={styles.modalButton} onPress={handleRejectTerms}>
                                    <Text style={styles.modalButtonText}>Rechazar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalButton, styles.acceptButton]} onPress={handleAcceptTerms}>
                                    <Text style={styles.modalButtonText}>Aceptar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Reset Password Modal */}
                <Modal
                    animationType="slide"
                    transparent={true}
                    visible={resetVisible}
                    onRequestClose={toggleResetVisibility}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContainer}>
                            <Text style={styles.modalTitle}>Restablecer Contraseña</Text>
                            <Text style={styles.modalText}>
                                Ingresa tu correo electrónico para recibir un enlace para restablecer tu contraseña.
                            </Text>
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Correo electrónico</Text>
                                <View style={styles.inputWrapper}>
                                    <MaterialCommunityIcons name="email" size={20} color="#888" style={styles.inputIcon} />
                                    <TextInput
                                        placeholder="tucorreo@ejemplo.com"
                                        placeholderTextColor="#888"
                                        value={resetEmail}
                                        onChangeText={setResetEmail}
                                        style={styles.input}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        textContentType="emailAddress" // Added for autofill
                                    />
                                </View>
                            </View>
                            <View style={styles.modalButtons}>
                                <TouchableOpacity style={styles.modalButton} onPress={toggleResetVisibility}>
                                    <Text style={styles.modalButtonText}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalButton, styles.acceptButton]} onPress={handleSendResetPassword}>
                                    <Text style={styles.modalButtonText}>Enviar correo</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </ImageBackground>
            {/* Update Required Modal */}
            <UpdateRequiredModal
                visible={updateModalVisible}
                currentVersion={currentVersion}
                minVersion={minVersion}
                iosAppId={APP_IDS.ios}
                androidPackageName={APP_IDS.android}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#000', // Ensure background is black for smooth transition
    },
    background: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    gradient: {
        flex: 1,
    },
    container: {
        flex: 1,
        // No fixed height or width here, let flex handle it
    },
    scrollContainer: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 30,
        paddingBottom: 30, // Adjusted padding for better keyboard avoidance
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 40,
        marginTop: height * 0.05, // Responsive top margin
    },
    logoText: {
        fontFamily: 'Roboto-Bold',
        fontSize: 36,
        color: 'white',
        marginTop: 10,
        letterSpacing: 1.5,
    },
    tagline: {
        fontFamily: 'Roboto-Regular',
        fontSize: 16,
        color: '#AAA',
        marginTop: 8,
        textAlign: 'center',
    },
    card: {
        backgroundColor: 'rgba(30, 30, 40, 0.85)',
        borderRadius: 16,
        padding: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        width: '100%', // Ensure card takes full width with padding
        maxWidth: 400, // Max width for larger screens
        alignSelf: 'center', // Center the card
    },
    cardTitle: {
        fontFamily: 'Roboto-Bold',
        fontSize: 24,
        color: 'white',
        marginBottom: 30,
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: 25,
    },
    label: {
        fontFamily: 'Roboto-Medium',
        color: '#DDD',
        marginBottom: 10,
        fontSize: 15,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    inputIcon: {
        padding: 15,
    },
    input: {
        flex: 1,
        paddingVertical: 15,
        paddingRight: 15,
        color: 'white',
        fontFamily: 'Roboto-Regular',
        fontSize: 17,
    },
    eyeIcon: {
        padding: 15,
    },
    primaryButton: {
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 10,
        marginBottom: 15,
    },
    buttonGradient: {
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    primaryButtonText: {
        fontFamily: 'Roboto-Bold',
        color: 'white',
        fontSize: 16,
        letterSpacing: 0.5,
    },
    buttonIcon: {
        marginLeft: 10,
    },
    secondaryButton: {
        padding: 12,
        alignItems: 'center',
    },
    secondaryButtonText: {
        fontFamily: 'Roboto-Regular',
        color: '#AAA',
        fontSize: 14,
    },
    forgotPasswordButton: {
        alignItems: 'center',
        marginTop: 15,
    },
    forgotPasswordText: {
        fontFamily: 'Roboto-Regular',
        color: '#888',
        fontSize: 13,
        textDecorationLine: 'underline',
    },
    loadingText: {
        fontFamily: 'Roboto-Regular',
        color: '#AAA',
        marginTop: 12,
        fontSize: 14,
    },
    fullScreenLoading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0F0F15',
    },
    footer: {
        marginTop: 30,
        alignItems: 'center',
    },
    footerText: {
        fontFamily: 'Roboto-Regular',
        color: '#777',
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 5,
        flexDirection: 'row', // Allows children to be laid out in a row
        flexWrap: 'wrap', // Allows text to wrap
        justifyContent: 'center',
    },
    copyright: {
        fontFamily: 'Roboto-Regular',
        color: '#555',
        fontSize: 11,
    },
    termsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    termsLink: {
        color: '#FF5252',
        fontFamily: 'Roboto-Regular',
        fontSize: 14,
        textDecorationLine: 'underline',
        marginLeft: 5, // Adjusted margin for better spacing with the checkbox label
    },
    checkbox: {
        width: 20,
        height: 20,
        borderWidth: 1,
        borderColor: '#888',
        borderRadius: 4,
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#FF5252',
        borderColor: '#FF5252',
    },
    termsLabel: {
        color: '#DDD',
        fontFamily: 'Roboto-Regular',
        fontSize: 14,
        flexShrink: 1, // Allows text to shrink if needed
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)', // Darker overlay for better contrast
    },
    modalContainer: {
        backgroundColor: '#1E1E2A',
        borderRadius: 10,
        padding: 20,
        width: '90%', // Increased width for better readability on smaller screens
        maxWidth: 500, // Max width for larger screens
        maxHeight: '85%', // Increased max height
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8,
    },
    modalTitle: {
        fontSize: 22, // Slightly larger title
        fontFamily: 'Roboto-Bold',
        color: 'white',
        marginBottom: 15,
        textAlign: 'center',
    },
    modalTextContainer: {
        flexGrow: 1,
        paddingRight: 5, // Add padding to prevent text from touching scrollbar
    },
    modalText: {
        fontSize: 14,
        fontFamily: 'Roboto-Regular',
        color: '#DDD',
        lineHeight: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around', // Distribute buttons evenly
        marginTop: 20,
    },
    inputWrapperError: {
        borderColor: '#FF5252',
    },
    errorText: {
        color: '#FF5252',
        fontSize: 12,
        marginTop: 5,
        fontFamily: 'Roboto-Regular',
        flexDirection: 'row',
        alignItems: 'center',
    },
    modalButton: {
        paddingVertical: 12, // Larger touch area
        paddingHorizontal: 20,
        borderRadius: 8, // More rounded buttons
        backgroundColor: '#333', // Default button color
        alignItems: 'center',
        flex: 1, // Allow buttons to take equal space
        marginHorizontal: 5, // Spacing between buttons
    },
    modalButtonText: {
        color: 'white',
        fontFamily: 'Roboto-Medium',
        fontSize: 16,
    },
    link: {
        color: '#3498db',
        textDecorationLine: 'underline',
        fontSize: 12, // Ensure font size matches footerText
    },
    acceptButton: {
        backgroundColor: '#FF5252',
    },
    termsLinkContainer: {
        marginBottom: 15,
        alignItems: 'flex-start', // Align to start for single link
    },
    resendVerificationButton: {
        alignItems: 'center',
        padding: 8,
    },
    resendVerificationText: {
        fontFamily: 'Roboto-Regular',
        color: '#FF5252', // Color diferente para destacar
        fontSize: 13,
        textDecorationLine: 'underline',
    },
});

export default AuthScreen;