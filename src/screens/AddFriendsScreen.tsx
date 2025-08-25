import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
    RefreshControl,
    Modal,
    Pressable,
    ListRenderItem,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, deleteField, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlertContext } from '../contexts/AlertContext';

type User = {
    uid: string;
    email: string;
    username: string;
    avatar: string;
    status?: 'friend' | 'requestSent' | 'requestReceived';
    unreadCount?: number;
};

type TabType = 'friends' | 'sent' | 'received';

// Componente memoizado para items de usuario
const UserItem = React.memo(({
    item,
    onSendMessage,
    onOpenMenu,
    onCancelRequest,
    onAcceptRequest,
    onRejectRequest,
    onSendRequest
}: {
    item: User;
    onSendMessage: (user: User) => void;
    onOpenMenu: (user: User, event: any) => void;
    onCancelRequest: (userId: string) => void;
    onAcceptRequest: (userId: string) => void;
    onRejectRequest: (userId: string) => void;
    onSendRequest: (userId: string) => void;
}) => {
    return (
        <View style={styles.userItem}>
            <Image
                source={{ uri: item.avatar }}
                style={styles.avatar}
                defaultSource={require('../../assets/icon.png')}
            />
            <View style={styles.userInfo}>
                <Text style={styles.username}>{item.username}</Text>
                <Text style={styles.email}>{item.email}</Text>
            </View>

            <View style={styles.actionsContainer}>
                {item.status === 'friend' && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.messageButton]}
                        onPress={() => onSendMessage(item)}
                    >
                        <MaterialCommunityIcons name="message-text" size={20} color="#FFF" />
                        {(item.unreadCount ?? 0) > 0 && (
                            <View style={styles.unreadBadge}>
                                <Text style={styles.unreadBadgeText}>
                                    {(item.unreadCount ?? 0) > 99 ? '99+' : item.unreadCount}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}

                {item.status === 'friend' ? (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.menuButton]}
                        onPress={(event) => onOpenMenu(item, event)}
                    >
                        <MaterialCommunityIcons name="dots-horizontal" size={20} color="#FFF" />
                    </TouchableOpacity>
                ) : item.status === 'requestSent' ? (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.cancelButton]}
                        onPress={() => onCancelRequest(item.uid)}
                    >
                        <MaterialCommunityIcons name="close-circle" size={20} color="#FFF" />
                        <Text style={styles.buttonText}>Cancelar</Text>
                    </TouchableOpacity>
                ) : item.status === 'requestReceived' ? (
                    <View style={styles.requestActions}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.acceptButton]}
                            onPress={() => onAcceptRequest(item.uid)}
                        >
                            <MaterialCommunityIcons name="check" size={20} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.rejectButton]}
                            onPress={() => onRejectRequest(item.uid)}
                        >
                            <MaterialCommunityIcons name="close" size={20} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.addButton]}
                        onPress={() => onSendRequest(item.uid)}
                    >
                        <MaterialCommunityIcons name="account-plus" size={20} color="#FFF" />
                        <Text style={styles.buttonText}>Agregar</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
});

const FriendsScreen = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();
    const { alertError, alertSuccess, alertConfirm } = useAlertContext();

    const [activeTab, setActiveTab] = useState<TabType>('friends');
    const [friends, setFriends] = useState<User[]>([]);
    const [sentRequests, setSentRequests] = useState<User[]>([]);
    const [receivedRequests, setReceivedRequests] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

    const currentUser = auth.currentUser;

    // Memoizar datos actuales
    const currentData = useMemo(() => {
        if (searchQuery.trim()) return searchResults;
        return activeTab === 'friends' ? friends :
            activeTab === 'sent' ? sentRequests :
                receivedRequests;
    }, [searchQuery, searchResults, activeTab, friends, sentRequests, receivedRequests]);

    // Cargar datos de amigos
    const loadFriendsData = useCallback(async () => {
        if (!currentUser) return;

        try {
            const [userDoc, userChatsDoc] = await Promise.all([
                getDoc(doc(db, 'users', currentUser.uid)),
                getDoc(doc(db, 'userChats', currentUser.uid))
            ]);

            if (!userDoc.exists()) return;

            const userData = userDoc.data();
            const unreadCounts: { [key: string]: number } = {};

            if (userChatsDoc.exists()) {
                const chatsData = userChatsDoc.data();
                Object.entries(chatsData).forEach(([userId, chatData]: [string, any]) => {
                    if (chatData.unreadCount) {
                        unreadCounts[userId] = chatData.unreadCount;
                    }
                });
            }

            // Cargar datos en paralelo
            const [friendsData, sentData, receivedData] = await Promise.all([
                loadUsersWithStatus(userData.friends || [], 'friend', unreadCounts),
                loadUsersWithStatus(userData.pendingSentRequests || [], 'requestSent'),
                loadUsersWithStatus(userData.pendingReceivedRequests || [], 'requestReceived')
            ]);

            setFriends(friendsData);
            setSentRequests(sentData);
            setReceivedRequests(receivedData);

        } catch (error) {
            console.error('Error loading friends data:', error);
            alertError('No se pudieron cargar los amigos y solicitudes');
        } finally {
            setLoading(false);
        }
    }, [currentUser, alertError]);

    // Función auxiliar para cargar usuarios con estado
    const loadUsersWithStatus = async (userIds: string[], status: User['status'], unreadCounts?: { [key: string]: number }) => {
        const users = await Promise.all(
            userIds.map(async (userId) => {
                try {
                    const userDoc = await getDoc(doc(db, 'users', userId));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        return {
                            uid: userId,
                            email: userData.email,
                            username: userData.username || userData.email.split('@')[0],
                            avatar: userData.avatar || 'https://via.placeholder.com/150',
                            status,
                            unreadCount: unreadCounts?.[userId] || 0
                        };
                    }
                } catch (error) {
                    console.error(`Error loading user ${userId}:`, error);
                }
                return null;
            })
        );
        return users.filter(Boolean) as User[];
    };

    // Búsqueda de usuarios optimizada
    const searchUsers = useCallback(async (queryText: string) => {
        if (!queryText.trim() || !currentUser) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        try {
            const usersRef = collection(db, 'users');
            const querySnapshot = await getDocs(usersRef);

            const results = querySnapshot.docs
                .filter(doc => doc.id !== currentUser.uid)
                .map(doc => {
                    const userData = doc.data();
                    const username = userData.username || userData.email.split('@')[0];
                    return { doc, username, userData };
                })
                .filter(({ username }) =>
                    username.toLowerCase().includes(queryText.toLowerCase())
                )
                .map(({ doc, userData, username }) => ({
                    uid: doc.id,
                    email: userData.email,
                    username,
                    avatar: userData.avatar || 'https://via.placeholder.com/150',
                }));

            // Obtener estado de los usuarios encontrados
            const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (currentUserDoc.exists()) {
                const currentUserData = currentUserDoc.data();
                const usersWithStatus = results.map(user => {
                    if (currentUserData.friends?.includes(user.uid)) {
                        return { ...user, status: 'friend' as const };
                    }
                    if (currentUserData.pendingSentRequests?.includes(user.uid)) {
                        return { ...user, status: 'requestSent' as const };
                    }
                    if (currentUserData.pendingReceivedRequests?.includes(user.uid)) {
                        return { ...user, status: 'requestReceived' as const };
                    }
                    return user;
                });
                setSearchResults(usersWithStatus);
            }
        } catch (error) {
            console.error('Error searching users:', error);
            alertError('No se pudo realizar la búsqueda');
        } finally {
            setIsSearching(false);
        }
    }, [currentUser, alertError]);

    // Debounce para búsqueda
    useEffect(() => {
        const handler = setTimeout(() => {
            if (searchQuery.trim()) {
                searchUsers(searchQuery);
            } else {
                setSearchResults([]);
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(handler);
    }, [searchQuery, searchUsers]);

    // Listeners en tiempo real
    useEffect(() => {
        if (!currentUser) return;

        const unsubscribeUser = onSnapshot(doc(db, 'users', currentUser.uid), loadFriendsData);
        const unsubscribeChats = onSnapshot(doc(db, 'userChats', currentUser.uid), (doc) => {
            if (doc.exists()) {
                const chatsData = doc.data();
                setFriends(prev => prev.map(friend => ({
                    ...friend,
                    unreadCount: chatsData[friend.uid]?.unreadCount || 0
                })));
            }
        });

        return () => {
            unsubscribeUser();
            unsubscribeChats();
        };
    }, [currentUser, loadFriendsData]);

    // Recargar al enfocar
    useEffect(() => {
        if (isFocused) loadFriendsData();
    }, [isFocused, loadFriendsData]);

    // Funciones de manejo de amigos
    const handleFriendRequest = useCallback(async (operation: 'accept' | 'reject' | 'cancel' | 'remove', targetUserId: string) => {
        if (!currentUser) return;

        try {
            const batch = writeBatch(db);
            const currentUserRef = doc(db, 'users', currentUser.uid);
            const targetUserRef = doc(db, 'users', targetUserId);

            switch (operation) {
                case 'accept':
                    batch.update(currentUserRef, {
                        pendingReceivedRequests: arrayRemove(targetUserId),
                        friends: arrayUnion(targetUserId)
                    });
                    batch.update(targetUserRef, {
                        pendingSentRequests: arrayRemove(currentUser.uid),
                        friends: arrayUnion(currentUser.uid)
                    });
                    alertSuccess('Solicitud aceptada', 'Ahora son amigos');
                    break;

                case 'reject':
                    batch.update(currentUserRef, {
                        pendingReceivedRequests: arrayRemove(targetUserId)
                    });
                    batch.update(targetUserRef, {
                        pendingSentRequests: arrayRemove(currentUser.uid)
                    });
                    alertSuccess('Solicitud rechazada');
                    break;

                case 'cancel':
                    batch.update(currentUserRef, {
                        pendingSentRequests: arrayRemove(targetUserId)
                    });
                    batch.update(targetUserRef, {
                        pendingReceivedRequests: arrayRemove(currentUser.uid)
                    });
                    alertSuccess('Solicitud cancelada');
                    break;

                case 'remove':
                    batch.update(currentUserRef, { friends: arrayRemove(targetUserId) });
                    batch.update(targetUserRef, { friends: arrayRemove(currentUser.uid) });
                    alertSuccess('Amigo eliminado');
                    break;
            }

            await batch.commit();
            loadFriendsData();

        } catch (error) {
            console.error(`Error in ${operation} operation:`, error);
            alertError(`No se pudo completar la operación`);
        }
    }, [currentUser, alertSuccess, alertError, loadFriendsData]);

    const sendFriendRequest = useCallback(async (targetUserId: string) => {
        if (!currentUser) return;

        try {
            const batch = writeBatch(db);
            batch.update(doc(db, 'users', currentUser.uid), {
                pendingSentRequests: arrayUnion(targetUserId)
            });
            batch.update(doc(db, 'users', targetUserId), {
                pendingReceivedRequests: arrayUnion(currentUser.uid)
            });

            await batch.commit();
            alertSuccess('Solicitud enviada');
            loadFriendsData();

        } catch (error) {
            console.error('Error sending friend request:', error);
            alertError('No se pudo enviar la solicitud');
        }
    }, [currentUser, alertSuccess, alertError, loadFriendsData]);

    // Handlers memoizados
    const handleAcceptRequest = useCallback((userId: string) => handleFriendRequest('accept', userId), [handleFriendRequest]);
    const handleRejectRequest = useCallback((userId: string) => handleFriendRequest('reject', userId), [handleFriendRequest]);
    const handleCancelRequest = useCallback((userId: string) => handleFriendRequest('cancel', userId), [handleFriendRequest]);
    const handleRemoveFriend = useCallback((userId: string) => {
        alertConfirm(
            '¿Estás seguro de que quieres eliminar a este amigo?',
            () => handleFriendRequest('remove', userId),
            'Eliminar amigo',
            'Eliminar',
            'Cancelar'
        );
    }, [handleFriendRequest, alertConfirm]);

    const handleSendMessage = useCallback((user: User) => {
        navigation.navigate('Chat' as any, {
            recipientId: user.uid,
            recipientName: user.username
        });
    }, [navigation]);

    const handleOpenMenu = useCallback((user: User, event: any) => {
        setSelectedUser(user);
        setMenuPosition({
            x: event.nativeEvent.pageX - 100,
            y: event.nativeEvent.pageY
        });
        setMenuVisible(true);
    }, []);

    const handleViewProfile = useCallback(() => {
        if (selectedUser) {
            setMenuVisible(false);
            navigation.navigate('Profile' as any, { userId: selectedUser.uid });
        }
    }, [selectedUser, navigation]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadFriendsData();
        setRefreshing(false);
    }, [loadFriendsData]);

    // Renderizado optimizado
    const renderUserItem: ListRenderItem<User> = useCallback(({ item }) => (
        <UserItem
            item={item}
            onSendMessage={handleSendMessage}
            onOpenMenu={handleOpenMenu}
            onCancelRequest={handleCancelRequest}
            onAcceptRequest={handleAcceptRequest}
            onRejectRequest={handleRejectRequest}
            onSendRequest={sendFriendRequest}
        />
    ), [handleSendMessage, handleOpenMenu, handleCancelRequest, handleAcceptRequest, handleRejectRequest, sendFriendRequest]);

    const keyExtractor = useCallback((item: User) => item.uid, []);

    const renderEmptyList = useCallback(() => {
        if (searchQuery.trim()) {
            return (
                <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="account-search" size={64} color="#666" />
                    <Text style={styles.emptyText}>No se encontraron usuarios</Text>
                </View>
            );
        }

        const emptyConfig = {
            friends: { icon: 'account-group', text: 'No tienes amigos aún' },
            sent: { icon: 'account-arrow-up', text: 'No has enviado solicitudes' },
            received: { icon: 'account-arrow-down', text: 'No tienes solicitudes pendientes' }
        };

        const { icon, text } = emptyConfig[activeTab];

        return (
            <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name={icon as any} size={64} color="#666" />
                <Text style={styles.emptyText}>{text}</Text>
            </View>
        );
    }, [searchQuery, activeTab]);

    if (loading) {
        return (
            <LinearGradient colors={['#1A1A24', '#2C2C38']} style={styles.container}>
                <StatusBar barStyle="light-content" />
                <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#FF5252" />
                    </View>
                </SafeAreaView>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#1A1A24', '#2C2C38']} style={styles.container}>
            <StatusBar barStyle="light-content" />
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Amigos</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('AddFriends' as never)} style={styles.addButton}>
                        <MaterialCommunityIcons name="account-plus" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>

                {/* Búsqueda */}
                <View style={styles.searchContainer}>
                    <MaterialCommunityIcons name="magnify" size={20} color="#666" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar usuarios..."
                        placeholderTextColor="#666"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                            <MaterialCommunityIcons name="close-circle" size={20} color="#666" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Tabs */}
                {!searchQuery.trim() && (
                    <View style={styles.tabsContainer}>
                        {(['friends', 'received', 'sent'] as TabType[]).map(tab => (
                            <TouchableOpacity
                                key={tab}
                                style={[styles.tab, activeTab === tab && styles.activeTab]}
                                onPress={() => setActiveTab(tab)}
                            >
                                <MaterialCommunityIcons
                                    name={
                                        tab === 'friends' ? 'account-group' :
                                            tab === 'received' ? 'account-arrow-down' : 'account-arrow-up'
                                    }
                                    size={20}
                                    color={activeTab === tab ? '#FF5252' : '#666'}
                                />
                                <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                                    {tab === 'friends' ? `Amigos (${friends.length})` :
                                        tab === 'received' ? `Recibidas (${receivedRequests.length})` :
                                            `Enviadas (${sentRequests.length})`}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Lista */}
                <FlatList
                    data={currentData}
                    renderItem={renderUserItem}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.listContainer}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={['#FF5252']}
                        />
                    }
                    ListEmptyComponent={renderEmptyList}
                    initialNumToRender={10}
                    maxToRenderPerBatch={5}
                    windowSize={5}
                />

                {/* Menú contextual */}
                {menuVisible && (
                    <Modal transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
                        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
                            <View style={[styles.menuContainer, { top: menuPosition.y, left: menuPosition.x }]}>
                                <TouchableOpacity style={styles.menuItem} onPress={handleViewProfile}>
                                    <MaterialCommunityIcons name="account-eye" size={20} color="#333" />
                                    <Text style={styles.menuItemText}>Ver perfil</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.menuItem} onPress={() => selectedUser && handleSendMessage(selectedUser)}>
                                    <MaterialCommunityIcons name="message-text" size={20} color="#333" />
                                    <Text style={styles.menuItemText}>Enviar mensaje</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.menuItem, styles.menuItemDanger]}
                                    onPress={() => selectedUser && handleRemoveFriend(selectedUser.uid)}
                                >
                                    <MaterialCommunityIcons name="account-remove" size={20} color="#FF5252" />
                                    <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Eliminar amigo</Text>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </Modal>
                )}

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
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFF',
        fontFamily: 'Roboto-Bold',
    },
    addButton: {
        padding: 8,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        margin: 16,
        borderRadius: 25,
        paddingHorizontal: 16,
        height: 50,
    },
    searchIcon: {
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Roboto-Regular',
    },
    clearButton: {
        padding: 4,
    },
    tabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: '#FF5252',
    },
    tabText: {
        color: '#666',
        fontSize: 12,
        fontWeight: 'bold',
        marginLeft: 6,
        fontFamily: 'Roboto-Bold',
    },
    activeTabText: {
        color: '#FF5252',
    },
    listContainer: {
        flexGrow: 1,
        paddingHorizontal: 16,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#333',
    },
    userInfo: {
        flex: 1,
        marginLeft: 12,
    },
    username: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
        marginBottom: 4,
    },
    email: {
        color: '#AAA',
        fontSize: 14,
        fontFamily: 'Roboto-Regular',
    },
    actionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionButton: {
        padding: 10,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    buttonText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
    },
    messageButton: {
        backgroundColor: '#2196F3',
    },
    menuButton: {
        backgroundColor: '#666',
    },
    removeButton: {
        backgroundColor: '#FF5252',
    },
    cancelButton: {
        backgroundColor: '#FF9800',
        flexDirection: 'row',
        alignItems: 'center',
    },
    acceptButton: {
        backgroundColor: '#4CAF50',
    },
    rejectButton: {
        backgroundColor: '#FF5252',
    },
    /*     addButton: {
            backgroundColor: '#4CAF50',
            flexDirection: 'row',
            alignItems: 'center',
        }, */
    requestActions: {
        flexDirection: 'row',
        gap: 8,
    },
    unreadBadge: {
        position: 'absolute',
        top: -5,
        right: -5,
        backgroundColor: '#FF5252',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#1A1A24',
    },
    unreadBadgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
        marginTop: 50,
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
    addFriendsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#4CAF50',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 25,
        marginTop: 20,
    },
    addFriendsText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 8,
        fontFamily: 'Roboto-Bold',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    loadingText: {
        color: '#FFF',
        marginTop: 16,
        fontSize: 16,
        fontFamily: 'Roboto-Medium',
    },
    searchingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        marginBottom: 10,
    },
    searchingText: {
        color: '#FFF',
        marginLeft: 10,
        fontSize: 14,
        fontFamily: 'Roboto-Regular',
    },
    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
    },
    menuContainer: {
        position: 'absolute',
        backgroundColor: '#FFF',
        borderRadius: 12,
        marginTop: 8,
        padding: 8,
        marginLeft: -60,
        minWidth: 180,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
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
    menuItemDanger: {
        borderTopWidth: 1,
        borderTopColor: '#EEE',
        marginTop: 4,
    },
    menuItemText: {
        marginLeft: 12,
        fontSize: 14,
        color: '#333',
        fontFamily: 'Roboto-Regular',
    },
    menuItemTextDanger: {
        color: '#FF5252',
        fontWeight: 'bold',
    },
});

export default React.memo(FriendsScreen);