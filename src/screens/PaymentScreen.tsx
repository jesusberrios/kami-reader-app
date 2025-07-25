import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, Alert, TouchableOpacity, StatusBar, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as RNIap from 'react-native-iap';
import type {
    Product as RNIapProduct,
    Subscription as RNIapSubscription, // Import Subscription explicitly
    PurchaseError as RNIapPurchaseError,
    Purchase,
    SubscriptionAndroid, // Import SubscriptionAndroid for specific type checking
} from 'react-native-iap';

// Import Firebase components
import { auth, db } from '../firebase/config';
import { doc, updateDoc } from 'firebase/firestore';

// Get screen dimensions for responsive design
const { width } = Dimensions.get('window');

// Define types for store products (your local representation)
interface Product {
    id: string;
    title: string;
    description: string;
    price: string; // This will be updated by RNIap's localizedPrice / formattedPrice
    durationMonths: number; // Added duration in months
    type: 'subscription' | 'consumable' | 'nonConsumable'; // Explicitly define type
}

// Define your product IDs - ENSURE THESE MATCH EXACTLY WITH GOOGLE PLAY CONSOLE (FOR ANDROID) AND APP STORE CONNECT (FOR iOS)
// !! IMPORTANT: Replace with your actual product IDs !!
const productIds: string[] = [
    Platform.OS === 'ios' ? 'your_ios_monthly_sub_id' : 'your_android_monthly_sub_id',
    Platform.OS === 'ios' ? 'your_ios_yearly_sub_id' : 'your_android_yearly_sub_id',
    // Add your gift product ID here if applicable, e.g., Platform.OS === 'ios' ? 'your_ios_gift_sub_id' : 'your_android_gift_sub_id',
];

const products: Product[] = [
    {
        id: productIds[0],
        title: 'Suscripción Premium (Mensual)',
        description: 'Acceso a contenido premium, sin anuncios, y descargas ilimitadas. Se renueva mensualmente.',
        price: 'Cargando...', // Placeholder until RNIap fetches price
        durationMonths: 1, // 1 month
        type: 'subscription',
    },
    {
        id: productIds[1],
        title: 'Suscripción Premium (Anual)',
        description: 'Acceso a contenido premium, sin anuncios, y descargas ilimitadas. Se renueva anualmente (¡Mejor valor!).',
        price: 'Cargando...', // Placeholder until RNIap fetches price
        durationMonths: 12, // 12 months
        type: 'subscription',
    },
    // Add your gift product here if applicable
    // {
    //    id: productIds[2], // Adjust index if you add more
    //    title: 'Regalar Suscripción Premium (1 mes)',
    //    description: 'Regala 1 mes de suscripción Premium a un amigo.',
    //    price: 'Cargando...',
    //    durationMonths: 1,
    //    type: 'nonConsumable', // Or 'consumable' if it can be bought multiple times per user
    // },
];

const PaymentScreen = () => {
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'processing' | 'success' | 'failure'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    // Correct type: availableProducts should store RNIapSubscription[]
    const [availableProducts, setAvailableProducts] = useState<RNIapSubscription[]>([]);
    const [productsLoading, setProductsLoading] = useState(true);

    // Use useRef to store listeners for proper cleanup
    const purchaseUpdateListenerRef = useRef<any>(null);
    const purchaseErrorListenerRef = useRef<any>(null);

    // Initialize connection with the app store and fetch products
    useEffect(() => {
        const initIap = async () => {
            try {
                setProductsLoading(true);
                const connected = await RNIap.initConnection();
                console.log(connected ? 'RNIap: Conexión a la tienda exitosa.' : 'RNIap: No se pudo conectar a la tienda.');

                if (connected) {
                    // Fetch subscriptions using the SKUs
                    const fetchedSubscriptions: RNIapSubscription[] = await RNIap.getSubscriptions({ skus: productIds });

                    // Now, fetchedSubscriptions is correctly typed as RNIapSubscription[]
                    setAvailableProducts(fetchedSubscriptions);

                    console.log('RNIap: Suscripciones disponibles (fetched):', fetchedSubscriptions.map(p => ({
                        id: p.productId,
                        title: p.title,
                        price: getProductPrice(p.productId), // Usa la función de precio para mostrarlo
                        // For Android, show subscriptionOfferDetails for debugging
                        subscriptionOfferDetails: Platform.OS === 'android' ? (p as SubscriptionAndroid).subscriptionOfferDetails : undefined
                    })));

                    // Check for any pending purchases
                    const purchases = await RNIap.getAvailablePurchases();
                    if (purchases.length > 0) {
                        console.log('RNIap: Compras pendientes encontradas:', purchases);
                        // The `purchaseUpdatedListener` should already handle this automatically.
                        // You might want to process the most recent pending purchase here if not already handled.
                    }
                }
            } catch (error: any) {
                console.error('RNIap Error al inicializar IAP:', error);
                setErrorMessage(`Error al inicializar la tienda: ${error.message}. Por favor, inténtalo de nuevo.`);
                setPurchaseStatus('failure');
            } finally {
                setProductsLoading(false);
            }
        };

        initIap();

        // Set up purchase listeners
        purchaseUpdateListenerRef.current = RNIap.purchaseUpdatedListener(
            async (purchase: Purchase) => {
                console.log('RNIap: Compra actualizada recibida:', purchase);
                if (purchase.transactionId) {
                    setPurchaseStatus('success');

                    // --- Update user's premium status and subscription end date in Firestore ---
                    const currentUser = auth.currentUser;
                    if (currentUser) {
                        const userDocRef = doc(db, 'users', currentUser.uid);
                        const purchasedProductLocal = products.find(p => p.id === purchase.productId);

                        if (purchasedProductLocal) {
                            // Calculate subscription end date based on durationMonths
                            const now = Date.now();
                            const subscriptionEndDate = new Date(now);
                            subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + purchasedProductLocal.durationMonths);

                            try {
                                await updateDoc(userDocRef, {
                                    accountType: 'premium',
                                    subscriptionEndDate: subscriptionEndDate.getTime(), // Store as timestamp
                                    lastPurchasedProductId: purchase.productId, // Store which product was bought
                                });
                                console.log('Firestore: Usuario actualizado a Premium y fecha de fin de suscripción.');
                            } catch (firestoreError) {
                                console.error('Firestore Error al actualizar después de la compra:', firestoreError);
                                Alert.alert('Error de Base de Datos', 'Tu compra fue exitosa, pero no se pudo actualizar tu estado Premium en la base de datos. Por favor, contacta a soporte.');
                            }
                        } else {
                            console.warn('RNIap: Producto comprado no encontrado en la lista local:', purchase.productId);
                            Alert.alert('Compra Exitosa', 'Hemos registrado tu compra, pero no pudimos identificar el producto. Contacta a soporte si no ves los beneficios.');
                        }
                    } else {
                        console.warn('RNIap: No se encontró un usuario autenticado después de una compra exitosa.');
                        Alert.alert('¡Compra Exitosa!', 'Tu compra fue procesada, pero no pudimos vincularla a tu cuenta. Asegúrate de iniciar sesión y contacta a soporte si necesitas ayuda.');
                    }
                    // --- End Firestore Update ---

                    try {
                        // For subscriptions, set isConsumable to false
                        await RNIap.finishTransaction({ purchase, isConsumable: false });
                        console.log('RNIap: Transacción finalizada con éxito.');
                    } catch (finishError) {
                        console.error('RNIap Error al finalizar la transacción:', finishError);
                        Alert.alert('Error de Transacción', 'La compra fue exitosa pero hubo un problema al finalizarla en la tienda. Recibirás tu beneficio pronto.');
                    }

                    Alert.alert(
                        '¡Compra Exitosa!',
                        `Has adquirido ${availableProducts.find(p => p.productId === purchase.productId)?.title || 'un producto'}. ¡Disfruta de tu acceso Premium!`,
                        [{ text: 'OK', onPress: () => setPurchaseStatus('idle') }]
                    );
                } else {
                    console.log('RNIap: Compra recibida sin transactionId, puede ser una compra pendiente o cancelada:', purchase);
                    setErrorMessage('Tu compra está pendiente o no se pudo completar. Consulta el estado de tu pago.');
                    setPurchaseStatus('failure');
                }
            }
        );

        purchaseErrorListenerRef.current = RNIap.purchaseErrorListener(
            (error: RNIapPurchaseError) => {
                console.error('RNIap Error de compra:', error);
                setPurchaseStatus('failure');
                let userMessage = 'Ocurrió un error inesperado al procesar tu pago.';

                switch (error.code) {
                    case 'E_USER_CANCELLED':
                        userMessage = 'Has cancelado la compra.';
                        setPurchaseStatus('idle'); // Reset status if user cancelled
                        setErrorMessage(null); // Clear error message for user cancellation
                        break;
                    case 'E_ITEM_UNAVAILABLE':
                        userMessage = 'El producto no está disponible. Por favor, intenta más tarde o contacta a soporte.';
                        break;
                    case 'E_DEVELOPER_ERROR':
                        userMessage = 'Error de configuración en la aplicación o en la tienda. Intenta nuevamente.';
                        break;
                    case 'E_UNKNOWN':
                        userMessage = 'Error desconocido. Revisa tu conexión a internet o intenta de nuevo.';
                        break;
                    default:
                        userMessage = `Hubo un problema con tu pago: ${error.message || 'Error desconocido'}.`;
                }

                if (error.code !== 'E_USER_CANCELLED') { // Only show alert for actual errors, not user cancellation
                    Alert.alert(
                        'Compra Fallida',
                        userMessage,
                        [{ text: 'OK', onPress: () => setPurchaseStatus('idle') }]
                    );
                    setErrorMessage(userMessage);
                }
            }
        );

        return () => {
            // Clean up listeners and connection when component unmounts
            if (purchaseUpdateListenerRef.current) {
                purchaseUpdateListenerRef.current.remove();
            }
            if (purchaseErrorListenerRef.current) {
                purchaseErrorListenerRef.current.remove();
            }
            RNIap.endConnection();
            console.log('RNIap: Conexión con la tienda finalizada.');
        };
    }, []); // Empty dependency array to run only once

    // Function to handle initiating a purchase
    const handlePurchase = async () => {
        if (!selectedProduct) {
            setErrorMessage('Por favor, selecciona un plan Premium para continuar.');
            setPurchaseStatus('failure');
            return;
        }

        setPurchaseStatus('processing');
        setErrorMessage(null);

        try {
            console.log('RNIap: Solicitando compra para SKU:', selectedProduct.id, 'Tipo:', selectedProduct.type);

            if (selectedProduct.type === 'subscription') {
                if (Platform.OS === 'android') {
                    // Find the RNIapSubscription object from availableProducts
                    const productToBuy = availableProducts.find(p => p.productId === selectedProduct.id);

                    // Ensure it's an Android subscription and has offer details
                    if (productToBuy && 'subscriptionOfferDetails' in productToBuy && productToBuy.subscriptionOfferDetails && productToBuy.subscriptionOfferDetails.length > 0) {
                        // Take the first available offerToken.
                        const offerToken = productToBuy.subscriptionOfferDetails[0].offerToken;

                        await RNIap.requestSubscription({
                            sku: selectedProduct.id,
                            subscriptionOffers: [{
                                sku: selectedProduct.id,
                                offerToken: offerToken
                            }]
                        });
                    } else {
                        console.error('Android Subscription Error: No subscriptionOfferDetails found or no valid offer for product:', selectedProduct.id);
                        setErrorMessage('Error: No se encontraron detalles de oferta válidos para este plan en Android. Asegúrate de que las ofertas estén configuradas en Google Play Console.');
                        setPurchaseStatus('failure');
                        return;
                    }
                } else {
                    // For iOS, the call is simple as before
                    await RNIap.requestSubscription({ sku: selectedProduct.id });
                }
            } else {
                // If you had other product types (consumable/non-consumable)
                await RNIap.requestPurchase({ sku: selectedProduct.id });
            }
            // The purchaseUpdatedListener will handle the actual purchase completion and Firestore update
        } catch (error: any) {
            console.error('RNIap Error al iniciar la compra:', error);
            setPurchaseStatus('failure');
            if (error.code !== 'E_USER_CANCELLED') {
                setErrorMessage(`Error al iniciar la compra: ${error.message || 'Ocurrió un error inesperado.'}`);
                Alert.alert(
                    'Error al Iniciar Compra',
                    `Hubo un problema al intentar iniciar tu pago: ${error.message || 'Error desconocido'}`,
                    [{ text: 'OK', onPress: () => setPurchaseStatus('idle') }]
                );
            } else {
                // User cancelled, reset status without showing an error message
                setPurchaseStatus('idle');
                setErrorMessage(null);
            }
        }
    };

    // Platform-specific font styles
    const titleFont = Platform.OS === 'ios' ? 'HelveticaNeue-Bold' : 'Roboto-Bold';
    const bodyFont = Platform.OS === 'ios' ? 'HelveticaNeue' : 'Roboto';

    // Función para obtener el precio compatible con iOS y Android
    // Función para obtener el precio compatible con iOS y Android
    const getProductPrice = (productId: string) => {
        // Find the RNIapSubscription object from availableProducts
        const product = availableProducts.find(p => p.productId === productId);

        if (!product) {
            return 'Cargando...';
        }

        if (Platform.OS === 'android') {
            // Type guard to ensure we are dealing with a SubscriptionAndroid type
            if ('subscriptionOfferDetails' in product && product.subscriptionOfferDetails && product.subscriptionOfferDetails.length > 0) {
                const defaultOffer = product.subscriptionOfferDetails[0];

                // Check if pricingPhases and pricingPhaseList exist and have elements
                if (defaultOffer.pricingPhases && defaultOffer.pricingPhases.pricingPhaseList && defaultOffer.pricingPhases.pricingPhaseList.length > 0) {
                    return defaultOffer.pricingPhases.pricingPhaseList[0].formattedPrice;
                }
            }
        } else if (Platform.OS === 'ios') {
            // For iOS, localizedPrice is directly on the Product type (which Subscription also extends)
            if ('localizedPrice' in product && product.localizedPrice) {
                return product.localizedPrice;
            }
        }

        return 'Cargando...'; // Fallback if price is not found or platform mismatch
    };

    // Determine if a product is actually available from RNIap
    const isProductAvailable = (productId: string) => {
        return availableProducts.some(p => p.productId === productId);
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
                                <Text style={styles.loadingProductsText}>Cargando planes Premium...</Text>
                            </View>
                        ) : availableProducts.length === 0 ? (
                            <View style={styles.noProductsContainer}>
                                <Icon name="sentiment-dissatisfied" size={40} color="#B0BEC5" />
                                <Text style={styles.noProductsText}>
                                    No se encontraron planes Premium. Esto puede deberse a:
                                    {"\n"}• IDs de producto incorrectos en el código.
                                    {"\n"}• Productos no publicados o activos en la Google Play Console/App Store Connect.
                                    {"\n"}• Problemas de conexión o la app no está en una pista de prueba válida.
                                    {"\n\n"}Verifica tu configuración y asegúrate de que tu aplicación esté publicada en una pista de prueba.
                                </Text>
                            </View>
                        ) : (
                            products.map((product) => {
                                const price = getProductPrice(product.id);
                                const isActualProductAvailable = isProductAvailable(product.id);
                                return (
                                    <TouchableOpacity
                                        key={product.id}
                                        style={[
                                            styles.productCard,
                                            selectedProduct?.id === product.id ? styles.selectedProductCard : null,
                                            !isActualProductAvailable && styles.unavailableProductCard
                                        ]}
                                        onPress={() => isActualProductAvailable && setSelectedProduct(product)}
                                        activeOpacity={isActualProductAvailable ? 0.8 : 1}
                                        disabled={!isActualProductAvailable}
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
                                            {!isActualProductAvailable && (
                                                <View style={styles.unavailableOverlay}>
                                                    <Text style={styles.unavailableText}>No Disponible</Text>
                                                </View>
                                            )}
                                            {selectedProduct?.id === product.id && isActualProductAvailable && (
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
                            disabled={purchaseStatus === 'processing' || !selectedProduct || productsLoading || availableProducts.length === 0 || !isProductAvailable(selectedProduct?.id || '')}
                            style={[
                                styles.buyButton,
                                (purchaseStatus === 'processing' || !selectedProduct || productsLoading || availableProducts.length === 0 || !isProductAvailable(selectedProduct?.id || '')) ? styles.disabledButton : null,
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