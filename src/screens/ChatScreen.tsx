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
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
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
    getDocs
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
};

type User = {
    uid: string;
    username: string;
    avatar: string;
};

type ChatScreenRouteProp = RouteProp<{
    Chat: {
        recipientId: string;
        recipientName: string;
    };
}, 'Chat'>;

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
                <Text style={[
                    styles.messageText,
                    isCurrentUser ? styles.currentUserText : styles.otherUserText
                ]}>
                    {item.text}
                </Text>
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

const ChatScreen = () => {
    const navigation = useNavigation();
    const route = useRoute<ChatScreenRouteProp>();
    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);

    const { recipientId, recipientName } = route.params;

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [recipientInfo, setRecipientInfo] = useState<User | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [menuVisible, setMenuVisible] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

    const currentUser = auth.currentUser;
    const { alertError, alertConfirm, alertSuccess } = useAlertContext();

    // Memoizar el ID del chat
    const chatId = useMemo(() => {
        if (!currentUser) return '';
        return [currentUser.uid, recipientId].sort().join('_');
    }, [currentUser, recipientId]);

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
                    });
                }
            } catch (error) {
                console.error('Error loading recipient info:', error);
                alertError('No se pudo cargar la información del destinatario');
            }
        };

        loadRecipientInfo();
    }, [recipientId, recipientName, alertError]);

    // Marcar mensajes como leídos
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
                batch.update(userChatRef, { [`${recipientId}.unreadCount`]: 0 });

                await batch.commit();
                setUnreadCount(0);
            }
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }, [messages, currentUser, recipientId, chatId]);

    // Cargar mensajes en tiempo real
    useEffect(() => {
        if (!currentUser || !chatId) return;

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const messagesData: Message[] = [];
                let unread = 0;

                snapshot.forEach((doc) => {
                    const messageData = {
                        id: doc.id,
                        ...doc.data()
                    } as Message;

                    messagesData.push(messageData);

                    if (messageData.senderId === recipientId && !messageData.read) {
                        unread++;
                    }
                });

                setMessages(messagesData);
                setUnreadCount(unread);
                setLoading(false);

                // Marcar como leídos después de un breve delay
                setTimeout(markMessagesAsRead, 300);
            },
            (error) => {
                console.error('Error loading messages:', error);
                alertError('Error al cargar los mensajes');
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [currentUser, chatId, recipientId, markMessagesAsRead, alertError]);

    // Función para eliminar el chat
    const deleteChat = useCallback(async () => {
        if (!currentUser || !chatId) return;

        alertConfirm(
            '¿Estás seguro de que quieres eliminar este chat? Se borrará todo el historial de mensajes.',
            async () => {
                try {
                    const messagesRef = collection(db, 'chats', chatId, 'messages');
                    const messagesSnapshot = await getDocs(messagesRef);

                    const batch = writeBatch(db);
                    messagesSnapshot.forEach((doc) => {
                        batch.delete(doc.ref);
                    });

                    const chatRef = doc(db, 'chats', chatId);
                    batch.delete(chatRef);

                    await batch.commit();
                    alertSuccess('Chat eliminado correctamente');
                    navigation.goBack();
                } catch (error) {
                    console.error('Error deleting chat:', error);
                    alertError('No se pudo eliminar el chat');
                }
            },
            'Eliminar chat',
            'Eliminar',
            'Cancelar'
        );
    }, [currentUser, chatId, alertConfirm, alertSuccess, alertError, navigation]);

    // Enviar mensaje
    const sendMessage = useCallback(async () => {
        if (!newMessage.trim() || !currentUser || sending || !chatId) return;

        setSending(true);
        try {
            const messagesRef = collection(db, 'chats', chatId, 'messages');

            await addDoc(messagesRef, {
                text: newMessage.trim(),
                senderId: currentUser.uid,
                recipientId: recipientId,
                timestamp: serverTimestamp(),
                read: false
            });

            // Actualizar userChats en lote
            const batch = writeBatch(db);

            const userChatRef = doc(db, 'userChats', currentUser.uid);
            batch.set(userChatRef, {
                [recipientId]: {
                    lastMessage: newMessage.trim(),
                    timestamp: serverTimestamp(),
                    unreadCount: 0
                }
            }, { merge: true });

            const recipientChatRef = doc(db, 'userChats', recipientId);
            batch.set(recipientChatRef, {
                [currentUser.uid]: {
                    lastMessage: newMessage.trim(),
                    timestamp: serverTimestamp(),
                    unreadCount: increment(1)
                }
            }, { merge: true });

            await batch.commit();
            setNewMessage('');
            inputRef.current?.focus();

        } catch (error) {
            console.error('Error sending message:', error);
            alertError('No se pudo enviar el mensaje');
        } finally {
            setSending(false);
        }
    }, [newMessage, currentUser, sending, chatId, recipientId, alertError]);

    // Renderizar mensajes optimizado
    const renderMessage: ListRenderItem<Message> = useCallback(({ item }) => (
        <MessageItem item={item} currentUserId={currentUser?.uid || ''} />
    ), [currentUser]);

    // Key extractor optimizado
    const keyExtractor = useCallback((item: Message) => item.id, []);

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
                    {unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                        </View>
                    )}
                </View>
            </View>

            <TouchableOpacity
                onPress={(e) => {
                    setMenuPosition({
                        x: e.nativeEvent.pageX - 100,
                        y: e.nativeEvent.pageY
                    });
                    setMenuVisible(true);
                }}
                style={styles.menuButton}
            >
                <MaterialCommunityIcons name="dots-vertical" size={24} color="#FFF" />
            </TouchableOpacity>
        </View>
    ), [navigation, recipientInfo, recipientName, unreadCount]);

    const emptyComponent = useMemo(() => (
        <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="message-text-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>Inicia una conversación</Text>
            <Text style={styles.emptySubtext}>
                Envía un mensaje para comenzar a chatear con {recipientInfo?.username || recipientName}
            </Text>
        </View>
    ), [recipientInfo, recipientName]);

    const scrollToBottomButton = useMemo(() => (
        unreadCount > 0 && (
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
        )
    ), [unreadCount, scrollToEnd, markMessagesAsRead]);

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
                {scrollToBottomButton}

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
                        <TextInput
                            ref={inputRef}
                            style={styles.messageInput}
                            placeholder="Escribe un mensaje..."
                            placeholderTextColor="#666"
                            value={newMessage}
                            onChangeText={setNewMessage}
                            multiline
                            maxLength={500}
                            onSubmitEditing={sendMessage}
                            returnKeyType="send"
                            blurOnSubmit={false}
                        />
                        <TouchableOpacity
                            style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]}
                            onPress={sendMessage}
                            disabled={!newMessage.trim() || sending}
                        >
                            {sending ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <MaterialCommunityIcons
                                    name="send"
                                    size={24}
                                    color={newMessage.trim() ? "#FFF" : "#666"}
                                />
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>

                {menuVisible && (
                    <Modal transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
                        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
                            <View style={[styles.menuContainer, { top: menuPosition.y, left: menuPosition.x }]}>
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
                            </View>
                        </Pressable>
                    </Modal>
                )}
            </SafeAreaView>
        </LinearGradient>
    );
};

// Estilos optimizados
const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
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
    backButton: { padding: 8 },
    headerUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginHorizontal: 12,
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
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
    },
    menuButton: { padding: 8 },
    messagesList: {
        flexGrow: 1,
        padding: 16,
    },
    messageContainer: {
        marginBottom: 8,
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
});

export default React.memo(ChatScreen);