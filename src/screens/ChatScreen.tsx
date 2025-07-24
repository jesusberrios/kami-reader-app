import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    SafeAreaView,
    StatusBar,
    Image
} from 'react-native';
import { db } from '../firebase/config';
import {
    doc,
    setDoc,
    updateDoc,
    onSnapshot,
    arrayUnion,
    deleteDoc,
    getDoc,
    serverTimestamp
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ChatMessage {
    id: string;
    text: string;
    createdAt: any;
    userId: string;
    userName: string;
    senderEmail: string;
    isSupportAgentMessage: boolean;
}

interface ChatDocument {
    chatRoomId: string;
    messages: ChatMessage[];
    participants: string[];
    createdAt: any;
    updatedAt: any;
}

interface ChatScreenProps {
    route: {
        params: {
            clientId?: string;
        };
    };
}

const AGENT_EMAIL = 'sukisoft.soporte@gmail.com';

const ChatScreen: React.FC<ChatScreenProps> = ({ route }) => {
    const { clientId } = route.params;
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const scrollViewRef = useRef<ScrollView>(null);
    const auth = getAuth();
    const currentUser = auth.currentUser;
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();

    useEffect(() => {
        if (!currentUser) {
            setMessages([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const isAgent = currentUser.email === AGENT_EMAIL;
        const chatRoomIdToUse = isAgent ? clientId : currentUser.uid;
        if (!chatRoomIdToUse) {
            setMessages([]);
            setLoading(false);
            return;
        }

        const chatDocRef = doc(db, 'chats', chatRoomIdToUse);

        const unsubscribe = onSnapshot(chatDocRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const chatData = docSnapshot.data() as ChatDocument;
                setMessages(chatData.messages || []);
            } else {
                setMessages([]);
                // Crear el documento de chat si no existe
                initializeChat(chatRoomIdToUse);
            }
            setLoading(false);
        }, (error) => {
            console.error('Error al obtener mensajes:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, clientId]);

    const initializeChat = async (chatRoomId: string) => {
        if (!currentUser) return;

        const isAgent = currentUser.email === AGENT_EMAIL;
        const participants = isAgent
            ? [AGENT_EMAIL, clientId || '']
            : [currentUser.uid, AGENT_EMAIL];

        const newChat: ChatDocument = {
            chatRoomId,
            messages: [],
            participants: participants.filter(p => p !== ''),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        try {
            await setDoc(doc(db, 'chats', chatRoomId), newChat);
        } catch (error) {
            console.error('Error al inicializar chat:', error);
        }
    };

    useEffect(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
    }, [messages]);

    const handleSendMessage = async () => {
        if (!message.trim() || !currentUser) return;

        const isSenderAgent = currentUser?.email === AGENT_EMAIL;
        const chatRoomIdToUse = isSenderAgent ? clientId : currentUser.uid;
        if (!chatRoomIdToUse) return;

        const senderUserName = isSenderAgent
            ? 'Soporte Sukisoft'
            : (currentUser.displayName || currentUser.email || 'Usuario');

        // Crear mensaje con timestamp local
        const newMessage: ChatMessage = {
            id: Date.now().toString(), // ID temporal
            text: message.trim(),
            createdAt: new Date(), // Timestamp local
            userId: currentUser.uid,
            userName: senderUserName,
            senderEmail: currentUser.email || '',
            isSupportAgentMessage: isSenderAgent
        };

        try {
            const chatDocRef = doc(db, 'chats', chatRoomIdToUse);

            // Primero actualiza el array de mensajes
            await updateDoc(chatDocRef, {
                messages: arrayUnion(newMessage),
                updatedAt: serverTimestamp() // Esto sí puede usar serverTimestamp
            });

            setMessage('');
            scrollViewRef.current?.scrollToEnd({ animated: true });
        } catch (error) {
            console.error('Error enviando mensaje:', error);
        }
    };

    const handleEndConversation = () => {
        Alert.alert(
            "Finalizar Conversación",
            "¿Estás seguro de que quieres finalizar esta conversación y borrar su historial?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Finalizar y Borrar",
                    style: "destructive",
                    onPress: async () => {
                        if (!currentUser) return;
                        setIsDeleting(true);
                        try {
                            const isAgent = currentUser.email === AGENT_EMAIL;
                            const chatRoomIdToUse = isAgent ? clientId : currentUser.uid;

                            if (!chatRoomIdToUse) return;

                            const chatDocRef = doc(db, 'chats', chatRoomIdToUse);
                            await deleteDoc(chatDocRef);

                            setMessages([]);
                            navigation.goBack();
                        } catch (error) {
                            console.error('Error al borrar chat:', error);
                            Alert.alert("Error", "No se pudo eliminar la conversación.");
                        } finally {
                            setIsDeleting(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.container}>
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
                <StatusBar barStyle="light-content" />

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Soporte en Vivo</Text>
                    <TouchableOpacity
                        onPress={handleEndConversation}
                        style={styles.endButton}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <ActivityIndicator size="small" color="#FF6B6B" />
                        ) : (
                            <Text style={styles.endButtonText}>Finalizar</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Chat Area */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#007bff" />
                        <Text style={styles.loadingText}>Cargando mensajes...</Text>
                    </View>
                ) : (
                    <ScrollView
                        style={styles.chatArea}
                        contentContainerStyle={styles.chatAreaContent}
                        ref={scrollViewRef}
                    >
                        {messages.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Image
                                    source={require('../../assets/auth-bg.png')}
                                    style={styles.emptyImage}
                                />
                                <Text style={styles.emptyText}>No hay mensajes aún</Text>
                                <Text style={styles.emptySubtext}>Envía un mensaje para iniciar la conversación</Text>
                            </View>
                        ) : (
                            messages.map(msg => (
                                <View
                                    key={msg.id}
                                    style={[
                                        styles.chatMessageBubble,
                                        msg.userId === currentUser?.uid
                                            ? styles.myMessageBubble
                                            : styles.otherMessageBubble,
                                    ]}
                                >
                                    <Text style={styles.chatMessageSender}>
                                        {msg.userId === currentUser?.uid ? 'Tú' : msg.userName}
                                    </Text>
                                    <Text style={styles.chatMessageText}>{msg.text}</Text>
                                    <Text style={styles.chatMessageTime}>
                                        {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </Text>
                                </View>
                            ))
                        )}
                    </ScrollView>
                )}

                {/* Input Area */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.inputContainer}
                >
                    <TextInput
                        style={styles.messageInput}
                        placeholder="Escribe tu mensaje..."
                        placeholderTextColor="#999"
                        value={message}
                        onChangeText={setMessage}
                        multiline
                        editable={!isDeleting}
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
                        onPress={handleSendMessage}
                        disabled={!message.trim() || isDeleting}
                    >
                        <Ionicons name="send" size={24} color="white" />
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1E1E2C',
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFF',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 10,
    },
    endButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 15,
    },
    endButtonText: {
        color: '#FF6B6B',
        fontSize: 14,
        fontWeight: 'bold',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        color: '#E0E0E0',
    },
    chatArea: {
        flex: 1,
        paddingHorizontal: 15,
    },
    chatAreaContent: {
        paddingVertical: 15,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 50,
    },
    emptyImage: {
        width: 150,
        height: 150,
        marginBottom: 20,
        opacity: 0.5,
    },
    emptyText: {
        color: '#999',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    emptySubtext: {
        color: '#666',
        fontSize: 14,
    },
    chatMessageBubble: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 15,
        marginBottom: 10,
        flexDirection: 'column',
    },
    myMessageBubble: {
        alignSelf: 'flex-end',
        backgroundColor: '#007bff',
        borderBottomRightRadius: 2,
    },
    otherMessageBubble: {
        alignSelf: 'flex-start',
        backgroundColor: '#2A2A3B',
        borderBottomLeftRadius: 2,
        borderWidth: 1,
        borderColor: '#333',
    },
    chatMessageSender: {
        fontSize: 12,
        color: '#CCC',
        marginBottom: 4,
        fontWeight: 'bold',
    },
    chatMessageText: {
        fontSize: 16,
        color: '#FFFFFF',
    },
    chatMessageTime: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.7)',
        alignSelf: 'flex-end',
        marginTop: 5,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
        backgroundColor: '#1E1E2C',
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    messageInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#555',
        borderRadius: 25,
        paddingHorizontal: 15,
        paddingVertical: Platform.OS === 'ios' ? 12 : 8,
        marginRight: 10,
        color: '#E0E0E0',
        backgroundColor: '#2A2A3B',
        maxHeight: 120,
        fontSize: 16,
    },
    sendButton: {
        backgroundColor: '#007bff',
        borderRadius: 25,
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#555',
    },
});

export default ChatScreen;