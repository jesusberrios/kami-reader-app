import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, Alert, TouchableOpacity, StatusBar, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as RNIap from 'react-native-iap';
import type {
    Product as RNIapProduct,
    PurchaseError as RNIapPurchaseError,
    Purchase,
} from 'react-native-iap';

// Import Firebase components
import { auth, db } from '../firebase/config'; // Import auth and db
import { doc, updateDoc } from 'firebase/firestore'; // Import updateDoc

// Get screen dimensions for responsive design
const { width, height } = Dimensions.get('window');

// Define types for store products
interface Product {
    id: string;
    title: string;
    description: string;
    price: string; // This will be updated by RNIap's localizedPrice
    durationMonths: number; // Added duration in months
}

// Example product data (replace with your actual store IDs)
const productIds: string[] = [
    Platform.OS === 'ios' ? 'your_ios_monthly_sub_id' : 'your_android_monthly_sub_id',
    Platform.OS === 'ios' ? 'your_ios_yearly_sub_id' : 'your_android_yearly_sub_id',
    Platform.OS === 'ios' ? 'your_ios_gift_sub_id' : 'your_android_gift_sub_id',
];

const products: Product[] = [
    {
        id: productIds[0],
        title: 'Suscripción Premium (Mensual)',
        description: 'Acceso a contenido premium, sin anuncios, y descargas ilimitadas. Se renueva mensualmente.',
        price: 'Cargando...', // Placeholder until RNIap fetches price
        durationMonths: 1, // 1 month
    },
    {
        id: productIds[1],
        title: 'Suscripción Premium (Anual)',
        description: 'Acceso a contenido premium, sin anuncios, y descargas ilimitadas. Se renueva anualmente (¡Mejor valor!).',
        price: 'Cargando...', // Placeholder until RNIap fetches price
        durationMonths: 12, // 12 months
    },
    {
        id: productIds[2],
        title: 'Regalar Suscripción Premium (1 mes)',
        description: 'Regala 1 mes de suscripción Premium a un amigo.',
        price: 'Cargando...', // Placeholder until RNIap fetches price
        durationMonths: 1, // 1 month
    },
];

const PaymentScreen = () => {
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'processing' | 'success' | 'failure'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [availableProducts, setAvailableProducts] = useState<RNIapProduct[]>([]);
    const [productsLoading, setProductsLoading] = useState(true);
    const purchaseUpdateListenerRef = React.useRef<any>(null);
    const purchaseErrorListenerRef = React.useRef<any>(null);


    // Initialize connection with the app store when the component mounts
    useEffect(() => {
        let purchaseUpdateListener: any;
        let purchaseErrorListener: any;

        const initIap = async () => {
            try {
                setProductsLoading(true); // Start loading products
                const connected = await RNIap.initConnection();
                if (connected) {
                    // Get products from the store
                    const fetchedProducts = await RNIap.getProducts({ skus: productIds });
                    setAvailableProducts(fetchedProducts);
                }
            } catch (error: any) {
                console.error('Error initializing IAP:', error);
                setErrorMessage(`Error al inicializar la tienda: ${error.message}`);
                setPurchaseStatus('failure');
            } finally {
                setProductsLoading(false); // End loading products
            }
        };

        initIap();

        // Set up purchase listeners
        purchaseUpdateListener = RNIap.purchaseUpdatedListener(
            async (purchase: Purchase) => { // Made async to handle Firestore update
                if (purchase.transactionId) {
                    setPurchaseStatus('success');

                    // --- Update user's premium status and subscription end date in Firestore ---
                    const currentUser = auth.currentUser;
                    if (currentUser) {
                        const userDocRef = doc(db, 'users', currentUser.uid);
                        const purchasedProduct = products.find(p => p.id === purchase.productId);

                        if (purchasedProduct) {
                            const durationMs = purchasedProduct.durationMonths * 30 * 24 * 60 * 60 * 1000; // Approx. months to milliseconds
                            const subscriptionEndDate = Date.now() + durationMs;

                            try {
                                await updateDoc(userDocRef, {
                                    accountType: 'premium',
                                    subscriptionEndDate: subscriptionEndDate,
                                });
                            } catch (firestoreError) {
                                console.error('Error updating Firestore after purchase:', firestoreError);
                                Alert.alert('Error', 'No se pudo actualizar tu estado Premium en la base de datos.');
                            }
                        } else {
                            console.warn('Purchased product not found in local products list:', purchase.productId);
                        }
                    } else {
                        console.warn('No authenticated user found after successful purchase.');
                    }
                    // --- End Firestore Update ---

                    RNIap.finishTransaction({ purchase })
                        .then(() => console.log('Transaction finished'))
                        .catch(err => console.error('Error finishing transaction', err));

                    Alert.alert(
                        '¡Compra Exitosa!',
                        `Has adquirido ${availableProducts.find(p => p.productId === purchase.productId)?.title || 'un producto'}. Disfruta de tu acceso Premium.`,
                        [{ text: 'OK', onPress: () => setPurchaseStatus('idle') }]
                    );
                }
            }
        );

        purchaseErrorListener = RNIap.purchaseErrorListener(
            (error: RNIapPurchaseError) => {
                console.error('Purchase error:', error);
                setErrorMessage(`Error en la compra: ${error.message || 'Ocurrió un error inesperado.'}`);
                setPurchaseStatus('failure');
                Alert.alert(
                    'Compra Fallida',
                    `Hubo un problema al procesar tu pago: ${error.message || 'Error desconocido'}`,
                    [{ text: 'OK', onPress: () => setPurchaseStatus('idle') }]
                );
            }
        );

        // Assign listeners to refs for cleanup
        purchaseUpdateListenerRef.current = purchaseUpdateListener;
        purchaseErrorListenerRef.current = purchaseErrorListener;

        return () => {
            // Clean up listeners and connection
            if (purchaseUpdateListenerRef.current) {
                purchaseUpdateListenerRef.current.remove();
            }
            if (purchaseErrorListenerRef.current) {
                purchaseErrorListenerRef.current.remove();
            }
            RNIap.endConnection();
        };
    }, []); // Empty dependency array to run only once

    // Function to handle purchase
    const handlePurchase = async () => {
        if (!selectedProduct) {
            setErrorMessage('Por favor, selecciona un producto para comprar.');
            setPurchaseStatus('failure');
            return;
        }

        setPurchaseStatus('processing');
        setErrorMessage(null);

        try {
            // Initiate the purchase process with RNIap library
            await RNIap.requestPurchase({ sku: selectedProduct.id });
            // The purchase listener will handle the rest of the process

        } catch (error: any) {
            // Handle errors during the purchase *request* (e.g. invalid product ID, user cancelled)
            console.error('Error initiating purchase:', error);
            setPurchaseStatus('failure');
            if (error.code !== 'E_USER_CANCELLED') { // Check for user cancellation specifically
                setErrorMessage(`Error al iniciar la compra: ${error.message || 'Ocurrió un error inesperado.'}`);
                Alert.alert(
                    'Compra Fallida',
                    `Hubo un problema al iniciar tu pago: ${error.message || 'Error desconocido'}`,
                    [{ text: 'OK', onPress: () => setPurchaseStatus('idle') }]
                );
            } else {
                setPurchaseStatus('idle'); // Reset status if user cancelled
                setErrorMessage(null); // Clear error message for user cancellation
            }
        }
    };

    // Platform-specific font styles
    const titleFont = Platform.OS === 'ios' ? 'HelveticaNeue-Bold' : 'Roboto-Bold';
    const bodyFont = Platform.OS === 'ios' ? 'HelveticaNeue' : 'Roboto';

    // Function to get product price from RNIap
    const getProductPrice = (productId: string) => {
        const product = availableProducts.find(p => p.productId === productId);
        return product ? product.localizedPrice : 'Cargando...';
    };

    return (
        <LinearGradient colors={['#1a1a24', '#2c2c38']} style={styles.container}>
            <StatusBar
                translucent
                backgroundColor="transparent"
                barStyle="light-content"
            />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollViewContent}>
                    <View style={styles.header}>
                        <Text style={[styles.title, { fontFamily: titleFont }]}>
                            Hazte Premium
                        </Text>
                        <Text style={[styles.subtitle, { fontFamily: bodyFont }]}>
                            Desbloquea la experiencia completa. Sin anuncios, acceso ilimitado.
                        </Text>
                    </View>

                    <View style={styles.productsContainer}>
                        {productsLoading ? (
                            <View style={styles.loadingProductsContainer}>
                                <ActivityIndicator size="large" color="#FFD700" />
                                <Text style={styles.loadingProductsText}>Cargando productos...</Text>
                            </View>
                        ) : availableProducts.length === 0 ? (
                            <View style={styles.noProductsContainer}>
                                <Icon name="sentiment-dissatisfied" size={40} color="#B0BEC5" />
                                <Text style={styles.noProductsText}>No se encontraron productos. Por favor, verifica tu configuración de la tienda (IDs de producto, estado de publicación, etc.).</Text>
                            </View>
                        ) : (
                            products.map((product) => {
                                const price = getProductPrice(product.id);
                                const isProductAvailable = availableProducts.some(p => p.productId === product.id);
                                return (
                                    <TouchableOpacity
                                        key={product.id}
                                        style={[
                                            styles.productCard,
                                            selectedProduct?.id === product.id ? styles.selectedProductCard : null,
                                            !isProductAvailable && styles.unavailableProductCard
                                        ]}
                                        onPress={() => isProductAvailable && setSelectedProduct(product)}
                                        activeOpacity={isProductAvailable ? 0.8 : 1}
                                        disabled={!isProductAvailable}
                                    >
                                        <View style={styles.productContent}>
                                            <Text style={[styles.productTitle, { fontFamily: titleFont }]}>
                                                {product.title}
                                            </Text>
                                            <Text style={[styles.productDescription, { fontFamily: bodyFont }]}>
                                                {product.description}
                                            </Text>
                                            <Text style={[styles.productPrice, { fontFamily: titleFont }]}>
                                                {price}
                                            </Text>
                                            {!isProductAvailable && (
                                                <View style={styles.unavailableOverlay}>
                                                    <Text style={styles.unavailableText}>No Disponible</Text>
                                                </View>
                                            )}
                                            {selectedProduct?.id === product.id && isProductAvailable && (
                                                <View style={styles.selectedIndicator}>
                                                    <Icon name="check-circle" size={20} color="#1a1a24" />
                                                    <Text style={[styles.selectedText, { fontFamily: bodyFont }]}>Seleccionado</Text>
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </View>

                    <View style={styles.paymentInfo}>
                        <Icon name="security" size={24} color="#4CD964" style={styles.paymentIcon} />
                        <Text style={[styles.paymentText, { fontFamily: bodyFont }]}>
                            Pago seguro. Tu información está encriptada.
                        </Text>
                    </View>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            onPress={handlePurchase}
                            disabled={purchaseStatus === 'processing' || !selectedProduct || productsLoading || availableProducts.length === 0}
                            style={[
                                styles.buyButton,
                                (purchaseStatus === 'processing' || !selectedProduct || productsLoading || availableProducts.length === 0) ? styles.disabledButton : null,
                            ]}
                            activeOpacity={0.8}
                        >
                            {purchaseStatus === 'processing' ? (
                                <View style={styles.processingContent}>
                                    <ActivityIndicator size="small" color="#fff" />
                                    <Text style={[styles.buyButtonText, { fontFamily: bodyFont, marginLeft: 10 }]}>Procesando...</Text>
                                </View>
                            ) : (
                                <Text style={[styles.buyButtonText, { fontFamily: bodyFont }]}>Comprar Premium</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {purchaseStatus === 'failure' && errorMessage && (
                        <View style={styles.errorContainer}>
                            <Icon name="error-outline" size={24} color="#f87171" style={styles.errorIcon} />
                            <Text style={[styles.errorText, { fontFamily: bodyFont }]}>{errorMessage}</Text>
                        </View>
                    )}
                    {purchaseStatus === 'success' && (
                        <View style={styles.successContainer}>
                            <Icon name="check-circle-outline" size={24} color="#4CD964" style={styles.successIcon} />
                            <Text style={[styles.successText, { fontFamily: bodyFont }]}>¡Compra completada con éxito!</Text>
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    scrollViewContent: {
        flexGrow: 1,
        paddingBottom: 30,
    },
    header: {
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 20 : 30,
        paddingBottom: 20,
        paddingHorizontal: 20,
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 10,
        textShadowColor: 'rgba(0, 0, 0, 0.4)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
    },
    subtitle: {
        fontSize: 16,
        color: '#ddd',
        textAlign: 'center',
        lineHeight: 24,
        paddingHorizontal: 10,
        textShadowColor: 'rgba(0, 0, 0, 0.3)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
    },
    productsContainer: {
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    productCard: {
        backgroundColor: 'rgba(44, 44, 56, 0.7)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
    },
    selectedProductCard: {
        backgroundColor: 'rgba(255, 82, 82, 0.25)',
        borderColor: '#FF5252',
        shadowColor: '#FF5252',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    productContent: {
        // No specific styles needed here, children will layout
    },
    productTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 8,
    },
    productDescription: {
        fontSize: 14,
        color: '#ccc',
        lineHeight: 20,
        marginBottom: 12,
    },
    productPrice: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FFD700',
        marginTop: 10,
    },
    selectedIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#4CD964',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        alignSelf: 'flex-end',
        marginTop: 10,
    },
    selectedText: {
        color: '#1a1a24',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 5,
    },
    paymentInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        paddingHorizontal: 20,
        marginHorizontal: 20,
        marginBottom: 20,
        backgroundColor: 'rgba(76, 217, 100, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(76, 217, 100, 0.3)',
    },
    paymentIcon: {
        marginRight: 10,
    },
    paymentText: {
        fontSize: 14,
        color: '#eee',
        flexShrink: 1,
    },
    buttonContainer: {
        paddingHorizontal: 20,
        marginBottom: 30,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(248, 113, 113, 0.15)',
        borderRadius: 12,
        marginHorizontal: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#f87171',
    },
    errorIcon: {
        marginRight: 10,
    },
    errorText: {
        color: '#f87171',
        fontSize: 16,
        flexShrink: 1,
    },
    successContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(76, 217, 100, 0.15)',
        borderRadius: 12,
        marginHorizontal: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#4CD964',
    },
    successIcon: {
        marginRight: 10,
    },
    successText: {
        color: '#4CD964',
        fontSize: 16,
        flexShrink: 1,
    },
    buyButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 100,
        backgroundColor: '#FF5252',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buyButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    disabledButton: {
        backgroundColor: '#9ca3af',
        opacity: 0.7,
        shadowOpacity: 0,
        elevation: 0,
    },
    processingContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingProductsContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 50,
    },
    loadingProductsText: {
        marginTop: 15,
        fontSize: 16,
        color: '#FFD700',
        fontFamily: 'Roboto',
    },
    noProductsContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 50,
        backgroundColor: 'rgba(248, 113, 113, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#f87171',
        marginHorizontal: 20,
    },
    noProductsText: {
        marginTop: 15,
        fontSize: 16,
        color: '#f87171',
        textAlign: 'center',
        paddingHorizontal: 15,
        fontFamily: 'Roboto',
    },
    unavailableProductCard: {
        opacity: 0.5,
        backgroundColor: 'rgba(44, 44, 56, 0.3)',
        borderColor: 'rgba(255, 255, 255, 0.03)',
    },
    unavailableOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16,
    },
    unavailableText: {
        color: '#FF5252',
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
    },
});

export default PaymentScreen;