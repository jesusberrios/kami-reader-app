import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View,
    TextInput,
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
    Linking,
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
import { useAlertContext } from '../contexts/AlertContext';

const { width, height } = Dimensions.get('window');

type AuthScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Auth'>;

const APP_IDS = {
    ios: '5cd6ecff-6004-4696-b780-172ff5ca8a22',
    android: 'com.yourusername.kamireader'
};

const ALLOWED_DOMAINS = [
    'gmail.com',
    'outlook.com',
    'hotmail.com',
    'yahoo.com',
    'icloud.com',
    'live.com',
    'msn.com'
];

// Componente memoizado para inputs
const AuthInput = React.memo(({
    label,
    value,
    onChangeText,
    placeholder,
    secureTextEntry = false,
    keyboardType = 'default',
    autoCapitalize = 'sentences',
    iconName,
    error,
    onBlur,
    ...props
}: {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    secureTextEntry?: boolean;
    keyboardType?: any;
    autoCapitalize?: any;
    iconName: string;
    error?: string;
    onBlur?: () => void;
}) => {
    const [secure, setSecure] = useState(secureTextEntry);

    return (
        <View style={styles.inputGroup}>
            <Text style={styles.label}>{label}</Text>
            <View style={[
                styles.inputWrapper,
                error && styles.inputWrapperError
            ]}>
                <MaterialCommunityIcons
                    name={iconName as any}
                    size={20}
                    color={error ? '#FF5252' : '#888'}
                    style={styles.inputIcon}
                />
                <TextInput
                    placeholder={placeholder}
                    placeholderTextColor="#888"
                    value={value}
                    onChangeText={onChangeText}
                    onBlur={onBlur}
                    style={styles.input}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                    autoCorrect={false}
                    secureTextEntry={secure}
                    {...props}
                />
                {secureTextEntry && (
                    <TouchableOpacity
                        onPress={() => setSecure(!secure)}
                        style={styles.eyeIcon}
                        accessibilityLabel={secure ? "Mostrar contraseña" : "Ocultar contraseña"}
                    >
                        <MaterialCommunityIcons
                            name={secure ? "eye-off" : "eye"}
                            size={20}
                            color="#888"
                        />
                    </TouchableOpacity>
                )}
            </View>
            {error && (
                <Text style={styles.errorText}>
                    <MaterialCommunityIcons name="alert-circle" size={14} color="#FF5252" /> {error}
                </Text>
            )}
        </View>
    );
});

const AuthScreen = () => {
    const navigation = useNavigation<AuthScreenNavigationProp>();
    const insets = useSafeAreaInsets();
    const { alertError, alertSuccess, alertConfirm, alert } = useAlertContext();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(true);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [termsVisible, setTermsVisible] = useState(false);
    const [termsContent, setTermsContent] = useState('');
    const [resetEmail, setResetEmail] = useState('');
    const [resetVisible, setResetVisible] = useState(false);
    const [updateModalVisible, setUpdateModalVisible] = useState(false);
    const [minVersion, setMinVersion] = useState('');
    const [currentVersion, setCurrentVersion] = useState('');
    const [emailError, setEmailError] = useState('');

    // Memoizar valores derivados
    const canSubmit = useMemo(() => {
        if (loading) return false;
        if (!email || !password) return false;
        if (!isLogin && (!username || !termsAccepted || emailError)) return false;
        return true;
    }, [loading, email, password, isLogin, username, termsAccepted, emailError]);

    // Memoizar función de error
    const translateFirebaseError = useCallback((error: any): string => {
        const errorMap: { [key: string]: string } = {
            'auth/invalid-email': 'El correo electrónico no es válido',
            'auth/user-disabled': 'Esta cuenta ha sido deshabilitada',
            'auth/user-not-found': 'No existe una cuenta con este correo',
            'auth/wrong-password': 'Usuario o contraseña incorrectos',
            'auth/email-already-in-use': 'Este correo ya está registrado',
            'auth/operation-not-allowed': 'Esta operación no está permitida',
            'auth/weak-password': 'La contraseña es demasiado débil (mínimo 6 caracteres)',
            'auth/too-many-requests': 'Demasiados intentos. Por favor espera e intenta más tarde',
            'auth/account-exists-with-different-credential': 'Ya existe una cuenta con este correo usando otro método de autenticación',
            'auth/requires-recent-login': 'Esta operación requiere que inicies sesión nuevamente',
            'auth/provider-already-linked': 'Esta cuenta ya está vinculada con otro proveedor',
            'auth/credential-already-in-use': 'Estas credenciales ya están en uso por otra cuenta',
            'auth/invalid-credential': 'Credenciales inválidas o expiradas',
            'auth/invalid-verification-code': 'Código de verificación inválido',
            'auth/invalid-verification-id': 'ID de verificación inválido',
            'auth/missing-verification-code': 'Falta el código de verificación',
            'auth/missing-verification-id': 'Falta el ID de verificación',
            'auth/network-request-failed': 'Error de conexión. Por favor verifica tu internet',
            'auth/timeout': 'Tiempo de espera agotado. Por favor intenta nuevamente',
            'auth/expired-action-code': 'El enlace ha expirado',
            'auth/invalid-action-code': 'El enlace es inválido o ya fue usado',
            'auth/missing-email': 'Falta el correo electrónico',
        };

        return errorMap[error.code] || error.message || 'Ocurrió un error inesperado';
    }, []);

    // Validación de email memoizada
    const validateEmail = useCallback((email: string): string => {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) return '';

        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!re.test(trimmed)) return 'Formato de correo inválido';

        const domain = trimmed.split('@')[1];
        if (!ALLOWED_DOMAINS.includes(domain)) {
            return `Dominio no permitido. Usa: ${ALLOWED_DOMAINS.join(', ')}`;
        }

        return '';
    }, []);

    // Efectos iniciales
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const [appVersion, termsDoc] = await Promise.all([
                    getAppVersion(),
                    getDoc(doc(db, "documents", "ky3lJBuFrZnZjnt9mHll"))
                ]);

                setCurrentVersion(appVersion);
                if (termsDoc.exists()) {
                    setTermsContent(termsDoc.data()?.content || 'No se pudieron cargar los términos y condiciones.');
                }

                const paramsDoc = await getDoc(doc(db, "parameters", "appSettings"));
                if (paramsDoc.exists()) {
                    const requiredVersion = paramsDoc.data().minAppVersion;
                    setMinVersion(requiredVersion);
                    if (isVersionOutdated(appVersion, requiredVersion)) {
                        setUpdateModalVisible(true);
                    }
                }
            } catch (error) {
                console.error("Error inicializando auth:", error);
            }
        };

        const unsubscribe = AuthService.onAuthStateChanged(async (user) => {
            if (user) {
                await user.reload();
                if (user.emailVerified) {
                    await checkUserProfile(user.uid);
                } else {
                    await AuthService.logout();
                    alertConfirm(
                        'Debes verificar tu correo electrónico antes de acceder. ¿Quieres que reenviemos el correo de verificación?',
                        () => handleResendVerification(user),
                        'Verificación requerida',
                        'Reenviar correo',
                        'Cancelar'
                    );
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        });

        initializeAuth();
        return () => unsubscribe();
    }, [alertConfirm]);

    // Funciones memoizadas
    const isVersionOutdated = useCallback((current: string, required: string): boolean => {
        const currentParts = current.split('.').map(Number);
        const requiredParts = required.split('.').map(Number);

        for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
            const currentPart = currentParts[i] || 0;
            const requiredPart = requiredParts[i] || 0;
            if (currentPart < requiredPart) return true;
            if (currentPart > requiredPart) return false;
        }
        return false;
    }, []);

    const handleResendVerification = useCallback(async (user: User | null | undefined) => {
        if (!user) {
            alertError('No hay usuario autenticado');
            return;
        }

        try {
            await AuthService.sendEmailVerification(user);
            alertSuccess('Se ha enviado un nuevo correo de verificación');
        } catch (error: any) {
            alertError(translateFirebaseError(error));
        }
    }, [alertError, alertSuccess, translateFirebaseError]);

    const checkUserProfile = useCallback(async (userId: string) => {
        try {
            const userDoc = await getDoc(doc(db, "users", userId));
            if (userDoc.exists()) {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Main' }],
                });
            } else {
                await AuthService.logout();
                alertError('Tu perfil de usuario no está completo. Por favor, intenta iniciar sesión de nuevo.');
                setLoading(false);
            }
        } catch (error) {
            console.error("Error verificando perfil:", error);
            alertError('No se pudo verificar tu perfil. Por favor, reinicia la aplicación.');
            await AuthService.logout();
            setLoading(false);
        }
    }, [navigation, alertError]);

    const handleAuth = useCallback(async () => {
        if (!canSubmit) return;

        try {
            setLoading(true);
            if (isLogin) {
                await AuthService.login(email, password);
            } else {
                await handleRegister();
            }
        } catch (error: any) {
            if (error.code === 'auth/email-not-verified') {
                const currentUser = AuthService.getCurrentUser();
                alertConfirm(
                    'Por favor verifica tu correo electrónico antes de iniciar sesión.',
                    () => currentUser && handleResendVerification(currentUser),
                    'Correo no verificado',
                    'Reenviar verificación',
                    'Cancelar'
                );
            } else {
                alertError(translateFirebaseError(error));
            }
            setLoading(false);
        }
    }, [canSubmit, isLogin, email, password, handleResendVerification, alertConfirm, alertError, translateFirebaseError]);

    const handleRegister = useCallback(async () => {
        if (!termsAccepted) {
            alertError('Debes aceptar los términos y condiciones para registrarte.');
            return;
        }

        try {
            const userCredential = await AuthService.register(email, password);
            const user = userCredential.user;

            await Promise.all([
                AuthService.sendEmailVerification(user),
                setDoc(doc(db, "users", user.uid), {
                    username,
                    email,
                    emailVerified: false,
                    avatar: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                    createdAt: new Date(),
                    lastLogin: new Date(),
                    preferences: {
                        theme: 'dark',
                        readingDirection: 'right-to-left',
                        notificationEnabled: true
                    },
                    accountType: 'free',
                })
            ]);

            alert(
                'Verificación requerida',
                'Se ha enviado un correo de verificación a tu dirección de email, este puede encontrarse en SPAM revisar. Por favor verifica tu correo antes de iniciar sesión.',
                [{ text: 'OK', onPress: () => setIsLogin(true) }]
            );
        } catch (error: any) {
            alertError(translateFirebaseError(error));
        } finally {
            setLoading(false);
        }
    }, [email, password, username, termsAccepted, alert, alertError, translateFirebaseError]);

    const handleSendResetPassword = useCallback(async () => {
        if (!resetEmail) {
            alertError('Por favor ingresa tu correo electrónico.');
            return;
        }
        setLoading(true);
        try {
            await AuthService.resetPassword(resetEmail);
            alertSuccess(`Se ha enviado un correo electrónico a ${resetEmail} con instrucciones para restablecer tu contraseña.`);
            setResetVisible(false);
        } catch (error: any) {
            alertError(translateFirebaseError(error));
        } finally {
            setLoading(false);
        }
    }, [resetEmail, alertError, alertSuccess, translateFirebaseError]);

    // Handlers de UI memoizados
    const toggleTermsVisibility = useCallback(() => setTermsVisible(prev => !prev), []);
    const toggleResetVisibility = useCallback(() => setResetVisible(prev => !prev), []);
    const handleAcceptTerms = useCallback(() => {
        setTermsAccepted(true);
        setTermsVisible(false);
    }, []);
    const handleRejectTerms = useCallback(() => {
        setTermsAccepted(false);
        setTermsVisible(false);
    }, []);
    const toggleAuthMode = useCallback(() => setIsLogin(prev => !prev), []);

    const openExternalLink = useCallback((url: string) => {
        Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
    }, []);

    if (loading && !updateModalVisible) {
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
                <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

                <LinearGradient colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.9)']} style={styles.gradient}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -(insets.bottom || 0)}
                    >
                        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
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
                                    <AuthInput
                                        label="Nombre de usuario"
                                        value={username}
                                        onChangeText={setUsername}
                                        placeholder="Ej: otakulover"
                                        iconName="account"
                                        autoCapitalize="none"
                                    />
                                )}

                                <AuthInput
                                    label="Correo electrónico"
                                    value={email}
                                    onChangeText={(text) => {
                                        setEmail(text);
                                        setEmailError(validateEmail(text));
                                    }}
                                    onBlur={() => setEmailError(validateEmail(email))}
                                    placeholder="tucorreo@ejemplo.com"
                                    iconName="email"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    error={emailError}
                                />

                                <AuthInput
                                    label="Contraseña"
                                    value={password}
                                    onChangeText={setPassword}
                                    placeholder="••••••••"
                                    iconName="lock"
                                    secureTextEntry={true}
                                />

                                {!isLogin && (
                                    <>
                                        <View style={styles.termsContainer}>
                                            <TouchableOpacity
                                                style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}
                                                onPress={() => setTermsAccepted(!termsAccepted)}
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
                                    style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
                                    onPress={handleAuth}
                                    disabled={!canSubmit}
                                >
                                    <LinearGradient colors={['#FF6B6B', '#FF4F4F']} style={styles.buttonGradient}>
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

                                <TouchableOpacity onPress={toggleAuthMode} style={styles.secondaryButton}>
                                    <Text style={styles.secondaryButtonText}>
                                        {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
                                    </Text>
                                </TouchableOpacity>

                                {isLogin && (
                                    <>
                                        <TouchableOpacity onPress={toggleResetVisibility} style={styles.forgotPasswordButton}>
                                            <Text style={styles.forgotPasswordText}>¿Olvidaste tu contraseña?</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => handleResendVerification(AuthService.getCurrentUser())}
                                            style={styles.resendVerificationButton}
                                        >
                                            <Text style={styles.resendVerificationText}>¿No recibiste el correo de verificación?</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>

                            <View style={styles.footer}>
                                <Text style={styles.footerText}>
                                    Al continuar, aceptas nuestros
                                    <TouchableOpacity onPress={() => openExternalLink('https://example.com/terms-of-service')}>
                                        <Text style={styles.link}> Términos de servicio</Text>
                                    </TouchableOpacity>
                                    y
                                    <TouchableOpacity onPress={() => openExternalLink('https://example.com/privacy-policy')}>
                                        <Text style={styles.link}> Política de privacidad</Text>
                                    </TouchableOpacity>
                                </Text>
                                <Text style={styles.copyright}>© {new Date().getFullYear()} Kamireader</Text>
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </LinearGradient>

                {/* Modales */}
                <Modal visible={termsVisible} transparent animationType="slide" onRequestClose={toggleTermsVisibility}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContainer}>
                            <Text style={styles.modalTitle}>Términos y Condiciones</Text>
                            <ScrollView style={styles.modalTextContainer}>
                                <Text style={styles.modalText}>{termsContent}</Text>
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

                <Modal visible={resetVisible} transparent animationType="slide" onRequestClose={toggleResetVisibility}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContainer}>
                            <Text style={styles.modalTitle}>Restablecer Contraseña</Text>
                            <Text style={styles.modalText}>Ingresa tu correo electrónico para recibir un enlace para restablecer tu contraseña.</Text>
                            <AuthInput
                                label="Correo electrónico"
                                value={resetEmail}
                                onChangeText={setResetEmail}
                                placeholder="tucorreo@ejemplo.com"
                                iconName="email"
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
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
    buttonDisabled: {
        opacity: 0.6,
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

export default React.memo(AuthScreen);