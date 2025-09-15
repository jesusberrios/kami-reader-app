import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Image,
    SafeAreaView,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    Modal,
    Pressable,
    ListRenderItem,
    AppState,
    AppStateStatus,
    Alert,
    Dimensions
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons, Feather } from '@expo/vector-icons';
import {
    collection,
    doc,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    updateDoc,
    setDoc,
    increment,
    getDoc,
    writeBatch,
    getDocs,
    where,
    DocumentData,
    deleteField
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlertContext } from '../contexts/AlertContext';

type Message = {
    id: string;
    text: string;
    senderId: string;
    recipientId: string;
    timestamp: any;
    read: boolean;
    sticker?: string;
};

type User = {
    uid: string;
    username: string;
    avatar: string;
    isOnline?: boolean;
    lastSeen?: any;
    fcmToken?: string;
};

type ChatScreenRouteProp = RouteProp<{
    Chat: {
        recipientId: string;
        recipientName: string;
    };
}, 'Chat'>;

// Convertir enlaces de Google Drive
const convertGoogleDriveLink = (driveLink: string): string => {
    const match = driveLink.match(/\/d\/(.*?)\//);
    if (match && match[1]) {
        return `https://drive.google.com/uc?export=view&id=${match[1]}`;
    }
    return driveLink;
};

// Stickers organizados por categorías
const ASIAN_STICKERS = {
    Mujer: [
        convertGoogleDriveLink('https://drive.google.com/file/d/1Yn9ACMUqfF8sv-X1qlrH8rh__20R3SQK/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1ptI26fEocnzbrZPiyFiNNtYXPgMsHrbh/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1JdGS4VJ7f9rfWSj3rTOz4dFdiOpludi_/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1Y-V1Hwoh9KY7Q5DAG-zzCX_ol4QpHqUs/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/15mxLytfdFjUUfBMzsSipLiW5pRn9Q0na/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1fhA_ohRy0iPxzUD7AB4axBhFrDt5XlTc/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/11YCNK59ai-GHbY2nM3tcS3_MvNWv0Xe4/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1mLT6Psh8ykdObuBkHoHc4GWAVSQIx3oo/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1acOua3zyuln_kWw6yBCC8WPnI4rVmrza/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1s71xYed7kQuCX1UDoDFxiLWXGNYQEn66/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1IBPydx-keR_dYQdcFA4XJgCnZpzv-V1e/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1c2mc2RStbkGYZum1bWvLxqN7aJElCVqM/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1c2M5hD2aBAxZ0K4ERX-keGZkYq-UKmj4/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1Q1uMjMSLcnwgqIXkJGWQt64Xxstsgket/view?usp=drive_link'),
    ],
    Hombre: [
        convertGoogleDriveLink('https://drive.google.com/file/d/1hvQUgPG4AovQti7bs1deyJ_L1xQNYZ2o/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1_A50LvgsPjOzXP9BSSqqS9uOH8SfAPok/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1lkETMJcetwdPvZZwtiHX8KJB-wNvxKeA/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1349FsYFtloQLigVgsYEhSIH0IdL9ZSsc/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1ZTO6n5l_UknqvIaEEtTGdXluQ8vyQ6jU/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1yF0Dm_RzycX_704VoidSWozN_e5mShLP/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1icldpmAgscBNApVsAKmGJnDxu0s63wHK/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1d0CB2075ZUqTpzahc7JmWgs0v8MMxdVj/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1PCck1Byq9q1PMIjWdcXlt8mzd51XL0V2/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/13k2hBYR908h4X1-Ur1viRd8Wr1PLbd61/view?usp=drive_link'),
        convertGoogleDriveLink('https://drive.google.com/file/d/1VtgShMUUXzSVDD1X-dy3c1wWxDkCrux3/view?usp=drive_link'),
    ],
};

const STICKER_CATEGORIES = Object.keys(ASIAN_STICKERS);

// Componente para stickers
const StickerItem = ({ sticker }: { sticker: string }) => {
    return (
        <Image
            source={{ uri: sticker }}
            style={styles.stickerImage}
            resizeMode="contain"
            onError={(e) => console.log('Error loading sticker:', e.nativeEvent.error)}
        />
    );
};

// Componente memoizado para mensajes
const MessageItem = React.memo(({ item, currentUserId }: { item: Message; currentUserId: string }) => {
    const isCurrentUser = item.senderId === currentUserId;

    const formattedTime = useMemo(() => {
        return item.timestamp?.toDate
            ? new Date(item.timestamp.toDate()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            })
            : 'Enviando...';
    }, [item.timestamp]);

    return (
        <View style={[
            styles.messageContainer,
            isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage
        ]}>
            <View style={[
                styles.messageBubble,
                isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble
            ]}>
                {item.sticker ? (
                    <View style={styles.stickerContainer}>
                        <StickerItem sticker={item.sticker} />
                    </View>
                ) : (
                    <Text style={[
                        styles.messageText,
                        isCurrentUser ? styles.currentUserText : styles.otherUserText
                    ]}>
                        {item.text}
                    </Text>
                )}
                <Text style={[
                    styles.timestamp,
                    isCurrentUser ? styles.currentUserTimestamp : styles.otherUserTimestamp
                ]}>
                    {formattedTime}
                    {!isCurrentUser && !item.read && (
                        <Text style={styles.unreadDot}> •</Text>
                    )}
                </Text>
            </View>
        </View>
    );
});

const { width } = Dimensions.get('window');

const ChatScreen = () => {
    const navigation = useNavigation();
    const route = useRoute<ChatScreenRouteProp>();
    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);
    const stickerFlatListRef = useRef<FlatList>(null);

    const { recipientId, recipientName } = route.params;

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [recipientInfo, setRecipientInfo] = useState<User | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [menuVisible, setMenuVisible] = useState(false);
    const [isRecipientOnline, setIsRecipientOnline] = useState(false);
    const [isRecipientTyping, setIsRecipientTyping] = useState(false);
    const [stickerPickerVisible, setStickerPickerVisible] = useState(false);
    const [selectedStickerCategory, setSelectedStickerCategory] = useState(STICKER_CATEGORIES[0]);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const appStateRef = useRef(AppState.currentState);

    const currentUser = auth.currentUser;
    const { alertError, alertConfirm } = useAlertContext();

    // Memoizar el ID del chat
    const chatId = useMemo(() => {
        if (!currentUser) return '';
        return [currentUser.uid, recipientId].sort().join('_');
    }, [currentUser, recipientId]);

    // Manejar cambios en el estado de la app
    const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
        if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
            // La app volvió al primer plano, marcar mensajes como leídos
            markMessagesAsRead();
        }
        appStateRef.current = nextAppState;
    }, []);

    // Función throttle para typing
    const throttle = useCallback((func: Function, delay: number) => {
        let timeoutId: NodeJS.Timeout | null = null;
        let lastExecTime = 0;

        return function (this: any, ...args: any[]) {
            const currentTime = Date.now();
            const timeSinceLastExec = currentTime - lastExecTime;

            const execute = () => {
                func.apply(this, args);
                lastExecTime = currentTime;
            };

            if (timeSinceLastExec > delay) {
                execute();
            } else {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                timeoutId = setTimeout(execute, delay - timeSinceLastExec);
            }
        };
    }, []);

    // Cargar información del destinatario
    useEffect(() => {
        const loadRecipientInfo = async () => {
            try {
                const recipientRef = doc(db, 'users', recipientId);
                const recipientSnap = await getDoc(recipientRef);
                if (recipientSnap.exists()) {
                    const userData = recipientSnap.data();
                    setRecipientInfo({
                        uid: recipientId,
                        username: userData.username || recipientName,
                        avatar: userData.avatar || 'https://via.placeholder.com/150',
                        isOnline: userData.isOnline || false,
                        lastSeen: userData.lastSeen || null,
                        fcmToken: userData.fcmToken || null,
                    });
                }
            } catch (error) {
                console.error('Error loading recipient info:', error);
                alertError('No se pudo cargar la información del destinatario');
            }
        };

        loadRecipientInfo();
    }, [recipientId, recipientName, alertError]);

    // Estado de conexión del destinatario
    useEffect(() => {
        if (!recipientId) return;

        const statusRef = doc(db, 'status', recipientId);
        const unsubscribe = onSnapshot(statusRef, (doc) => {
            if (doc.exists()) {
                setIsRecipientOnline(doc.data().state === 'online');

                setRecipientInfo(prev => prev ? {
                    ...prev,
                    isOnline: doc.data().state === 'online',
                    lastSeen: doc.data().lastSeen
                } : null);
            }
        });

        return () => unsubscribe();
    }, [recipientId]);

    // Función para manejar el typing (con throttle)
    const handleTyping = useCallback(throttle(() => {
        if (!currentUser || !chatId) return;

        const typingRef = doc(db, 'chats', chatId, 'typing', currentUser.uid);
        setDoc(typingRef, {
            typing: true,
            timestamp: serverTimestamp()
        });

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
            setDoc(typingRef, {
                typing: false,
                timestamp: serverTimestamp()
            });
        }, 2000);
    }, 1000), [currentUser, chatId]);

    // Escuchar typing del destinatario
    useEffect(() => {
        if (!chatId || !recipientId) return;

        const typingRef = doc(db, 'chats', chatId, 'typing', recipientId);
        const unsubscribe = onSnapshot(typingRef, (doc) => {
            if (doc.exists()) {
                setIsRecipientTyping(doc.data().typing === true);
            }
        });

        return () => unsubscribe();
    }, [chatId, recipientId]);

    // Cambia markMessagesAsRead para que sea estable con useCallback
    const markMessagesAsRead = useCallback(async () => {
        if (!currentUser || !chatId) return;

        try {
            const unreadMessages = messages.filter(
                msg => msg.senderId === recipientId && !msg.read
            );

            if (unreadMessages.length > 0) {
                const batch = writeBatch(db);

                unreadMessages.forEach(message => {
                    const messageRef = doc(db, 'chats', chatId, 'messages', message.id);
                    batch.update(messageRef, { read: true });
                });

                const userChatRef = doc(db, 'userChats', currentUser.uid);
                batch.update(userChatRef, {
                    [`${recipientId}.unreadCount`]: 0
                });

                await batch.commit();
                setUnreadCount(0);
            }
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }, [currentUser, chatId, recipientId, messages]); // ← Agrega messages aquí

    // ✅ MANTÉN SOLO la carga de mensajes normal
    useEffect(() => {
        if (!currentUser || !chatId) return;

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const messagesData: Message[] = [];
                let unread = 0;

                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added' || change.type === 'modified') {
                        const messageData = {
                            id: change.doc.id,
                            ...change.doc.data()
                        } as Message;

                        messagesData.push(messageData);

                        if (messageData.senderId === recipientId && !messageData.read) {
                            unread++;
                        }
                    }
                });

                setMessages(prev => {
                    const combined = [...prev];
                    messagesData.forEach(newMsg => {
                        const existingIndex = combined.findIndex(m => m.id === newMsg.id);
                        if (existingIndex > -1) {
                            combined[existingIndex] = newMsg;
                        } else {
                            combined.push(newMsg);
                        }
                    });
                    return combined.sort((a, b) =>
                        a.timestamp?.toDate?.() - b.timestamp?.toDate?.()
                    );
                });

                setUnreadCount(unread);
                setLoading(false);
            },
            (error) => {
                console.error('Error loading messages:', error);
                alertError('Error al cargar los mensajes');
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [currentUser, chatId, recipientId, alertError]);

    const deleteChatForMe = async () => {
        if (!currentUser) return;

        try {
            console.log('🗑️ Eliminando chat de MI lista...');

            // Solo eliminar de userChats del usuario actual
            const currentUserChatRef = doc(db, 'userChats', currentUser.uid);
            const userChatSnap = await getDoc(currentUserChatRef);

            if (userChatSnap.exists()) {
                const currentData = userChatSnap.data();

                // ✅ CORREGIDO: Definir el tipo explícitamente
                const updates: { [key: string]: any } = {};

                if (currentData[recipientId]) {
                    updates[recipientId] = deleteField();
                }

                if (currentData[chatId]) {
                    updates[chatId] = deleteField();
                }

                // Buscar por recipientId en los datos
                for (const key of Object.keys(currentData)) {
                    const chatData = currentData[key];
                    if (chatData && chatData.recipientId === recipientId) {
                        updates[key] = deleteField();
                        break;
                    }
                }

                if (Object.keys(updates).length > 0) {
                    await updateDoc(currentUserChatRef, updates);
                    console.log('✅ Chat eliminado de userChats');
                }
            }

            // Solo limpiar estado local y navegar
            setMessages([]);
            setUnreadCount(0);
            setMenuVisible(false);
            navigation.goBack();

        } catch (error) {
            console.error('❌ Error:', error);
            alertError('No se pudo eliminar el chat');
            setMenuVisible(false);
        }
    };
    // Configurar listeners de la app
    useEffect(() => {
        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, [handleAppStateChange]);

    // Función optimizada para enviar mensajes
    const sendMessage = useCallback(async (text?: string, sticker?: string) => {
        const messageContent = text || newMessage.trim();
        if (!messageContent && !sticker) return;
        if (!currentUser || sending || !chatId) return;

        setSending(true);
        try {
            // Guardar mensaje en la subcolección de mensajes
            const messagesRef = collection(db, 'chats', chatId, 'messages');
            const messageData: any = {
                senderId: currentUser.uid,
                recipientId: recipientId,
                timestamp: serverTimestamp(),
                read: false
            };

            // Agregar texto o sticker según corresponda
            if (sticker) {
                messageData.sticker = sticker;
            } else {
                messageData.text = messageContent;
            }

            await addDoc(messagesRef, messageData);

            // Actualizar userChats con una sola operación
            const batch = writeBatch(db);
            const lastMessage = sticker ? '📸 Sticker' : messageContent;

            // Para el usuario actual
            const userChatRef = doc(db, 'userChats', currentUser.uid);
            batch.set(userChatRef, {
                [recipientId]: {
                    lastMessage,
                    timestamp: serverTimestamp(),
                    unreadCount: 0,
                    recipientName: recipientInfo?.username || recipientName,
                    recipientAvatar: recipientInfo?.avatar
                }
            }, { merge: true });

            // Para el destinatario
            const recipientChatRef = doc(db, 'userChats', recipientId);
            batch.set(recipientChatRef, {
                [currentUser.uid]: {
                    lastMessage,
                    timestamp: serverTimestamp(),
                    unreadCount: increment(1),
                    recipientName: currentUser.displayName || 'Usuario',
                    recipientAvatar: currentUser.photoURL
                }
            }, { merge: true });

            await batch.commit();

            if (!sticker) {
                setNewMessage('');
                inputRef.current?.focus();
            }

        } catch (error) {
            console.error('Error sending message:', error);
            alertError('No se pudo enviar el mensaje');
        } finally {
            setSending(false);
        }
    }, [newMessage, currentUser, sending, chatId, recipientId, alertError, recipientInfo, recipientName]);

    // Enviar sticker
    const sendSticker = useCallback((sticker: string) => {
        sendMessage(undefined, sticker);
        setStickerPickerVisible(false);
    }, [sendMessage]);

    // Renderizar mensajes optimizado
    const renderMessage: ListRenderItem<Message> = useCallback(({ item }) => (
        <MessageItem item={item} currentUserId={currentUser?.uid || ''} />
    ), [currentUser]);

    // Key extractor optimizado
    const keyExtractor = useCallback((item: Message) => item.id, []);

    // Renderizar stickers en el selector
    const renderSticker = useCallback(({ item }: { item: string }) => (
        <TouchableOpacity
            style={styles.stickerItem}
            onPress={() => sendSticker(item)}
        >
            <StickerItem sticker={item} />
        </TouchableOpacity>
    ), [sendSticker]);

    // Scroll automático al final
    const scrollToEnd = useCallback(() => {
        if (flatListRef.current && messages.length > 0) {
            flatListRef.current.scrollToEnd({ animated: true });
        }
    }, [messages.length]);

    useEffect(() => {
        const timer = setTimeout(scrollToEnd, 100);
        return () => clearTimeout(timer);
    }, [messages, scrollToEnd]);

    // Memoizar componentes
    const headerComponent = useMemo(() => (
        <View style={styles.header}>
            <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.backButton}
            >
                <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>

            <View style={styles.headerUserInfo}>
                <Image
                    source={{ uri: recipientInfo?.avatar || 'https://via.placeholder.com/150' }}
                    style={styles.avatar}
                />
                <View style={styles.headerTextContainer}>
                    <Text style={styles.headerName} numberOfLines={1}>
                        {recipientInfo?.username || recipientName}
                    </Text>
                    <Text style={styles.statusText}>
                        {isRecipientOnline
                            ? 'En línea'
                            : recipientInfo?.lastSeen
                                ? `Visto ${new Date(recipientInfo.lastSeen.toDate()).toLocaleTimeString()}`
                                : 'Desconectado'
                        }
                    </Text>
                </View>
            </View>

            <TouchableOpacity
                onPress={() => setMenuVisible(true)}
                style={styles.menuButton}
            >
                <MaterialCommunityIcons name="dots-vertical" size={24} color="#FFF" />
            </TouchableOpacity>
        </View>
    ), [navigation, recipientInfo, recipientName, isRecipientOnline]);

    const emptyComponent = useMemo(() => (
        <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="message-text-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>Inicia una conversación</Text>
            <Text style={styles.emptySubtext}>
                Envía un mensaje para comenzar a chatear con {recipientInfo?.username || recipientName}
            </Text>
        </View>
    ), [recipientInfo, recipientName]);

    const stickerPickerComponent = useMemo(() => (
        <Modal transparent animationType="slide" visible={stickerPickerVisible} onRequestClose={() => setStickerPickerVisible(false)}>
            <View style={styles.stickerPickerContainer}>
                <Pressable style={{ flex: 1 }} onPress={() => setStickerPickerVisible(false)} />

                <View style={styles.stickerModalContent}>
                    {/* Categorías */}
                    <View style={styles.stickerCategorySelector}>
                        {STICKER_CATEGORIES.map(category => (
                            <TouchableOpacity
                                key={category}
                                style={[
                                    styles.categoryButton,
                                    selectedStickerCategory === category && styles.categoryButtonActive
                                ]}
                                onPress={() => setSelectedStickerCategory(category)}
                            >
                                <Text style={[
                                    styles.categoryText,
                                    selectedStickerCategory === category && styles.categoryTextActive
                                ]}>
                                    {category}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Stickers */}
                    <FlatList
                        ref={stickerFlatListRef}
                        data={ASIAN_STICKERS[selectedStickerCategory as keyof typeof ASIAN_STICKERS]}
                        renderItem={renderSticker}
                        keyExtractor={(item, index) => index.toString()}
                        numColumns={3}
                        showsVerticalScrollIndicator={true}
                        contentContainerStyle={{ paddingBottom: 16 }}
                        key={selectedStickerCategory} // ✅ forzar remount al cambiar categoría
                    />

                    <TouchableOpacity
                        style={styles.closeStickerButton}
                        onPress={() => setStickerPickerVisible(false)}
                    >
                        <Text style={styles.closeStickerText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    ), [stickerPickerVisible, selectedStickerCategory, renderSticker]);

    if (loading) {
        return (
            <LinearGradient colors={['#1A1A24', '#2C2C38']} style={styles.container}>
                <StatusBar barStyle="light-content" />
                <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#FF5252" />
                        <Text style={styles.loadingText}>Cargando mensajes...</Text>
                    </View>
                </SafeAreaView>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#1A1A24', '#2C2C38']} style={styles.container}>
            <StatusBar barStyle="light-content" />
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>

                {headerComponent}

                {isRecipientTyping && (
                    <View style={styles.typingIndicator}>
                        <Text style={styles.typingText}>
                            {recipientInfo?.username || recipientName} está escribiendo...
                        </Text>
                    </View>
                )}

                {unreadCount > 0 && (
                    <TouchableOpacity
                        onPress={() => {
                            scrollToEnd();
                            markMessagesAsRead();
                        }}
                        style={styles.scrollToBottomButton}
                    >
                        <Text style={styles.scrollToBottomText}>{unreadCount} nuevo(s)</Text>
                        <Ionicons name="arrow-down" size={16} color="#FFF" />
                    </TouchableOpacity>
                )}

                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.messagesList}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={20}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    removeClippedSubviews={true}
                    ListEmptyComponent={emptyComponent}
                />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                    style={styles.inputContainer}
                >
                    <View style={styles.messageInputContainer}>
                        <TouchableOpacity
                            onPress={() => setStickerPickerVisible(true)}
                            style={styles.mediaButton}
                        >
                            <Ionicons name="happy-outline" size={24} color="#FFF" />
                        </TouchableOpacity>

                        <TextInput
                            ref={inputRef}
                            style={styles.messageInput}
                            placeholder="Escribe un mensaje..."
                            placeholderTextColor="#666"
                            value={newMessage}
                            onChangeText={(text) => {
                                setNewMessage(text);
                                handleTyping();
                            }}
                            multiline
                            maxLength={500}
                            onSubmitEditing={() => sendMessage()}
                            returnKeyType="send"
                            blurOnSubmit={false}
                        />

                        <TouchableOpacity
                            style={[styles.sendButton, (!newMessage.trim() && !sending) && styles.sendButtonDisabled]}
                            onPress={() => sendMessage()}
                            disabled={!newMessage.trim() || sending}
                        >
                            {sending ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Feather
                                    name="send"
                                    size={20}
                                    color={newMessage.trim() ? "#FFF" : "#666"}
                                />
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>

                {stickerPickerComponent}

                {menuVisible && (
                    <Modal transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
                        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
                            <View style={styles.menuContainer}>
                                <TouchableOpacity
                                    style={styles.menuItem}
                                    onPress={() => {
                                        setMenuVisible(false);
                                        navigation.navigate('Profile' as any, { userId: recipientId });
                                    }}
                                >
                                    <MaterialCommunityIcons name="account-eye" size={20} color="#333" />
                                    <Text style={styles.menuItemText}>Ver perfil</Text>
                                </TouchableOpacity>
                                {/*  <TouchableOpacity
                                    style={styles.menuItem}
                                    onPress={() => {
                                        setMenuVisible(false);
                                        alertConfirm(
                                            "¿Estás seguro de que quieres eliminar este chat? Esto solo lo eliminará para ti.", // message
                                            deleteChatForMe, // onConfirm
                                            "Eliminar chat", // title
                                            "Eliminar", // confirmText (opcional)
                                            "Cancelar" // cancelText (opcional)
                                        );
                                    }}
                                >
                                    <MaterialCommunityIcons name="delete" size={20} color="#FF5252" />
                                    <Text style={[styles.menuItemText, { color: '#FF5252' }]}>Eliminar chat</Text>
                                </TouchableOpacity> */}
                            </View>
                        </Pressable>
                    </Modal>
                )}
            </SafeAreaView>
        </LinearGradient>
    );
};

// Estilos
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1A24'
    },
    safeArea: {
        flex: 1
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    loadingText: {
        color: '#FFF',
        marginTop: 16,
        fontSize: 16,
        fontFamily: 'Roboto-Medium'
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    backButton: {
        padding: 8,
        marginRight: 8
    },
    headerUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#333',
    },
    headerTextContainer: {
        marginLeft: 12,
        flex: 1,
    },
    headerName: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Roboto-Medium',
    },
    statusText: {
        color: '#AAA',
        fontSize: 12,
        fontFamily: 'Roboto-Regular',
    },
    menuButton: {
        padding: 8
    },
    messagesList: {
        flexGrow: 1,
        padding: 16,
    },
    messageContainer: {
        marginBottom: 12,
    },
    currentUserMessage: {
        alignItems: 'flex-end',
    },
    otherUserMessage: {
        alignItems: 'flex-start',
    },
    messageBubble: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 18,
    },
    currentUserBubble: {
        backgroundColor: '#FF5252',
        borderBottomRightRadius: 4,
    },
    otherUserBubble: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 16,
        fontFamily: 'Roboto-Regular',
        lineHeight: 20,
    },
    currentUserText: {
        color: '#FFF',
    },
    otherUserText: {
        color: '#FFF',
    },
    timestamp: {
        fontSize: 10,
        marginTop: 4,
        fontFamily: 'Roboto-Regular',
    },
    currentUserTimestamp: {
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'right',
    },
    otherUserTimestamp: {
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'left',
    },
    unreadDot: {
        color: '#FF5252',
        fontWeight: 'bold',
    },
    stickerContainer: {
        padding: 4,
    },
    stickerImage: {
        width: (width - 16 * 2 - 8 * 4) / 3.5, // padding del modal y margin entre items
        height: (width - 16 * 2 - 8 * 4) / 3.5,
        resizeMode: 'contain',
    },
    inputContainer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(26,26,36,0.8)',
    },
    messageInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 25,
        paddingHorizontal: 16,
    },
    messageInput: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Roboto-Regular',
        maxHeight: 100,
        paddingVertical: 12,
    },
    sendButton: {
        padding: 8,
        backgroundColor: '#FF5252',
        borderRadius: 20,
        marginLeft: 8,
    },
    sendButtonDisabled: {
        backgroundColor: 'rgba(255,82,82,0.5)',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 16,
        fontFamily: 'Roboto-Bold',
        textAlign: 'center',
    },
    emptySubtext: {
        color: '#AAA',
        fontSize: 14,
        marginTop: 8,
        fontFamily: 'Roboto-Regular',
        textAlign: 'center',
    },
    unreadBadge: {
        backgroundColor: '#FF5252',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 4,
        alignSelf: 'flex-start',
    },
    unreadBadgeText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
        paddingHorizontal: 6,
    },
    scrollToBottomButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FF5252',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 15,
        alignSelf: 'center',
        marginBottom: 8,
        position: 'absolute',
        top: 120,
        zIndex: 1000,
    },
    scrollToBottomText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: 'bold',
        marginRight: 4,
        fontFamily: 'Roboto-Bold',
    },
    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    menuContainer: {
        position: 'absolute',
        top: 50,
        right: 10,
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 8,
        minWidth: 180,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
    },
    menuItemText: {
        marginLeft: 12,
        fontSize: 14,
        color: '#333',
        fontFamily: 'Roboto-Regular',
    },
    stickerPickerContainer: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)', // Fondo semitransparente
    },
    stickerModalContent: {
        backgroundColor: '#2C2C38',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 16,
        maxHeight: '60%',
    },
    stickerCategorySelector: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    categoryButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginRight: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    categoryButtonActive: {
        backgroundColor: '#FF5252',
    },
    categoryText: {
        color: '#FFF',
        fontSize: 12,
    },
    categoryTextActive: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    stickerItem: {
        padding: 8,
        margin: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 8,
    },
    stickerGrid: {
        paddingBottom: 16,
    },
    closeStickerButton: {
        backgroundColor: '#FF5252',
        padding: 12,
        borderRadius: 20,
        alignItems: 'center',
        marginTop: 16,
    },
    closeStickerText: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    typingIndicator: {
        padding: 8,
        alignItems: 'center',
    },
    typingText: {
        color: '#AAA',
        fontSize: 12,
        fontStyle: 'italic',
    },
    mediaButton: {
        padding: 8,
        marginRight: 8,
    },
});

export default React.memo(ChatScreen);