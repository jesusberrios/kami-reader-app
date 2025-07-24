// screens/ChatListScreen.tsx (Conceptual Outline)

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, orderBy, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface ChatPreview {
    chatRoomId: string;
    otherParticipantName: string;
    lastMessageText: string;
    lastMessageTime: any;
    // Add other relevant fields for display
}

interface AppUser {
    uid: string;
    email: string;
    displayName: string; // Or other user info
}

const ChatListScreen: React.FC = () => {
    const [chats, setChats] = useState<ChatPreview[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [searchResults, setSearchResults] = useState<AppUser[]>([]);
    const [searchingUsers, setSearchingUsers] = useState(false);

    const auth = getAuth();
    const currentUser = auth.currentUser;
    const navigation = useNavigation();

    useEffect(() => {
        if (!currentUser) {
            setLoading(false);
            return;
        }

        // --- Listen for existing chats ---
        const chatsRef = collection(db, 'chats');
        // Query chats where current user is a participant
        const q = query(
            chatsRef,
            where('participants', 'array-contains', currentUser.uid),
            orderBy('updatedAt', 'desc') // Order by most recent activity
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chatPreviews: ChatPreview[] = [];
            snapshot.forEach((doc) => {
                const chatData = doc.data();
                // Determine the other participant's name
                const otherParticipantUid = chatData.participants.find((p: string) => p !== currentUser.uid);
                // You'd need to fetch user data for 'otherParticipantUid'
                // For simplicity here, we'll just use a placeholder
                const otherParticipantName = otherParticipantUid === 'sukisoft.soporte@gmail.com' ? 'Soporte Sukisoft' : 'Otro Usuario';

                // Get last message info
                const lastMessage = chatData.messages && chatData.messages.length > 0
                    ? chatData.messages[chatData.messages.length - 1]
                    : null;

                chatPreviews.push({
                    chatRoomId: doc.id,
                    otherParticipantName: otherParticipantName, // This needs to be dynamic based on fetched user data
                    lastMessageText: lastMessage ? lastMessage.text : 'No hay mensajes',
                    lastMessageTime: lastMessage ? lastMessage.createdAt : chatData.updatedAt,
                });
            });
            setChats(chatPreviews);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching chat list:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const handleSearchUsers = async (text: string) => {
        setSearchText(text);
        if (text.length > 2) { // Only search if more than 2 characters
            setSearchingUsers(true);
            const usersRef = collection(db, 'users');
            // This is a basic search. For more robust search, consider Algolia or more complex Firestore queries.
            const q = query(
                usersRef,
                where('username', '>=', text),
                where('username', '<=', text + '\uf8ff')
            );
            // You might also search by email
            // const qEmail = query(usersRef, where('email', '==', text));

            try {
                const snapshot = await getDocs(q); // You'd need getDocs here, not onSnapshot
                const users: AppUser[] = [];
                snapshot.forEach(doc => {
                    if (doc.id !== currentUser?.uid) { // Don't show current user in search results
                        users.push({ uid: doc.id, ...doc.data() } as AppUser);
                    }
                });
                setSearchResults(users);
            } catch (error) {
                console.error("Error searching users:", error);
            } finally {
                setSearchingUsers(false);
            }
        } else {
            setSearchResults([]);
        }
    };

    const handleStartNewChat = (user: AppUser) => {
        // Determine chatRoomId. For 1-on-1 chats, a common pattern is to sort UIDs and concatenate them.
        // Example: If user A is uid1 and user B is uid2, chatRoomId = 'uid1_uid2' (if uid1 < uid2)
        const participantIds = [currentUser?.uid, user.uid].sort();
        const newChatRoomId = participantIds.join('_');

        // Navigate to ChatScreen with the new chatRoomId
        navigation.navigate('Chat', { clientId: newChatRoomId });
        setSearchText(''); // Clear search after starting chat
        setSearchResults([]);
    };

    const renderChatItem = ({ item }: { item: ChatPreview }) => (
        <TouchableOpacity
            style={styles.chatListItem}
            onPress={() => navigation.navigate('Chat', { clientId: item.chatRoomId })}
        >
            <Text style={styles.chatListName}>{item.otherParticipantName}</Text>
            <Text style={styles.chatListLastMessage}>{item.lastMessageText}</Text>
            <Text style={styles.chatListTime}>
                {item.lastMessageTime?.toDate ? item.lastMessageTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </Text>
        </TouchableOpacity>
    );

    const renderSearchResultItem = ({ item }: { item: AppUser }) => (
        <TouchableOpacity
            style={styles.searchResultItem}
            onPress={() => handleStartNewChat(item)}
        >
            <Text style={styles.searchResultName}>{item.displayName || item.email}</Text>
            <Ionicons name="chatbubbles-outline" size={20} color="#007bff" />
        </TouchableOpacity>
    );

    return (
        <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Tus Conversaciones</Text>
            </View>

            <TextInput
                style={styles.searchInput}
                placeholder="Buscar usuarios o iniciar nueva conversación..."
                placeholderTextColor="#999"
                value={searchText}
                onChangeText={handleSearchUsers}
            />

            {searchingUsers ? (
                <ActivityIndicator size="small" color="#FFF" style={{ marginTop: 10 }} />
            ) : (
                searchResults.length > 0 && searchText.length > 2 && (
                    <View style={styles.searchResultsContainer}>
                        <Text style={styles.searchResultsTitle}>Usuarios encontrados:</Text>
                        <FlatList
                            data={searchResults}
                            keyExtractor={(item) => item.uid}
                            renderItem={renderSearchResultItem}
                            keyboardShouldPersistTaps="always"
                        />
                    </View>
                )
            )}

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007bff" />
                    <Text style={styles.loadingText}>Cargando chats...</Text>
                </View>
            ) : (
                <FlatList
                    data={chats}
                    keyExtractor={(item) => item.chatRoomId}
                    renderItem={renderChatItem}
                    ListEmptyComponent={
                        <View style={styles.emptyListContainer}>
                            <Ionicons name="chatbubbles-outline" size={80} color="#666" />
                            <Text style={styles.emptyListText}>Aún no tienes conversaciones.</Text>
                            <Text style={styles.emptyListSubtext}>Usa la barra de búsqueda para encontrar a alguien.</Text>
                        </View>
                    }
                />
            )}
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 50, // Adjust for safe area
    },
    header: {
        paddingHorizontal: 15,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FFF',
    },
    searchInput: {
        backgroundColor: '#2A2A3B',
        borderRadius: 25,
        paddingHorizontal: 15,
        paddingVertical: 10,
        margin: 15,
        color: '#E0E0E0',
        fontSize: 16,
    },
    searchResultsContainer: {
        marginHorizontal: 15,
        backgroundColor: '#2A2A3B',
        borderRadius: 10,
        marginBottom: 10,
        maxHeight: 200, // Limit height for search results
    },
    searchResultsTitle: {
        color: '#CCC',
        fontSize: 14,
        fontWeight: 'bold',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    searchResultItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    searchResultName: {
        color: '#FFF',
        fontSize: 16,
    },
    chatListItem: {
        backgroundColor: '#2A2A3B',
        padding: 15,
        marginHorizontal: 15,
        marginBottom: 10,
        borderRadius: 10,
        flexDirection: 'column',
    },
    chatListName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 5,
    },
    chatListLastMessage: {
        fontSize: 14,
        color: '#CCC',
        marginBottom: 3,
    },
    chatListTime: {
        fontSize: 12,
        color: '#999',
        alignSelf: 'flex-end',
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
    emptyListContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 50,
    },
    emptyListText: {
        color: '#999',
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 10,
    },
    emptyListSubtext: {
        color: '#666',
        fontSize: 14,
        marginTop: 5,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
});

export default ChatListScreen;