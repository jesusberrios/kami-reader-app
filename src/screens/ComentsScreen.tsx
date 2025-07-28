import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text, // Ensure Text is imported
    StyleSheet,
    TextInput,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StatusBar,
    Alert,
    Image
} from 'react-native';
import { db } from '../firebase/config';
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    arrayUnion,
    onSnapshot,
    serverTimestamp,
    arrayRemove // Import arrayRemove
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserData {
    accountType: string;
    avatar?: string;
    username: string;
    // ...otros campos
}

interface Comment {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    text: string;
    createdAt: any;
    avatar?: string;
    likes?: string[]; // New: Array of user UIDs who liked the comment
}

interface MangaCommentsDoc {
    mangaTitle: string;
    comments: Comment[];
    lastUpdated: any;
}

interface CommentsScreenRouteParams {
    mangaTitle: string;
}

const CommentsScreen: React.FC = () => {
    const route = useRoute();
    const { mangaTitle } = route.params as CommentsScreenRouteParams;
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);

    const auth = getAuth();
    const currentUser = auth.currentUser;
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList<Comment>>(null);

    // Fetch user data
    useEffect(() => {
        const fetchUserData = async () => {
            if (currentUser) {
                try {
                    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                    if (userDoc.exists()) {
                        setUserData(userDoc.data() as UserData);
                    }
                } catch (error) {
                    console.error("Error fetching user data:", error);
                }
            }
        };

        fetchUserData();
    }, [currentUser]);

    // Listen for comments changes
    useEffect(() => {
        if (!mangaTitle) return;

        const docRef = doc(db, 'manga_comments', mangaTitle);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as MangaCommentsDoc;
                const sortedComments = (data.comments || []).sort((a, b) => {
                    const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                    const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                    return timeA - timeB;
                });
                setComments(sortedComments);
            } else {
                setComments([]);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching comments:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [mangaTitle]);

    // Auto-scroll to the end of the list
    useEffect(() => {
        if (comments.length > 0) {
            const timer = setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [comments]);

    // Post new comment
    const handlePostComment = async () => {
        if (!newComment.trim() || !currentUser || !userData) {
            Alert.alert('Error', 'No puedes enviar un comentario vacío o no estás logueado.');
            return;
        }

        setSending(true);
        try {
            const comment = { // Remove the explicit Comment type if it's causing issues with Date object
                id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                userId: currentUser.uid,
                userName: userData.username || currentUser.email || 'Anónimo',
                userEmail: currentUser.email || '',
                text: newComment.trim(),
                createdAt: new Date(), // Use a Date object here
                avatar: userData.avatar,
                likes: [] // Initialize likes array
            };

            const docRef = doc(db, 'manga_comments', mangaTitle);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                // When updating, Firebase will convert the Date object in 'comment' to a server timestamp.
                await updateDoc(docRef, {
                    comments: arrayUnion(comment),
                    lastUpdated: serverTimestamp() // This serverTimestamp is fine because it's not in an array
                });
            } else {
                // When setting a new document, Firebase will convert the Date object in 'comment' to a server timestamp.
                await setDoc(docRef, {
                    mangaTitle,
                    comments: [comment],
                    lastUpdated: serverTimestamp() // This serverTimestamp is fine because it's not in an array
                });
            }

            setNewComment('');
        } catch (error) {
            console.error("Error posting comment:s", error);
            Alert.alert('Error', 'No se pudo publicar el comentario. Inténtalo de nuevo.');
        } finally {
            setSending(false);
        }
    };

    // Handle comment deletion
    const handleDeleteComment = useCallback(async (commentToDelete: Comment) => {
        if (!currentUser || currentUser.uid !== commentToDelete.userId) {
            Alert.alert('Permiso denegado', 'Solo puedes eliminar tus propios comentarios.');
            return;
        }

        Alert.alert(
            'Confirmar Eliminación',
            '¿Estás seguro de que quieres eliminar este comentario?',
            [
                {
                    text: 'Cancelar',
                    style: 'cancel'
                },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        setDeletingCommentId(commentToDelete.id);
                        try {
                            const docRef = doc(db, 'manga_comments', mangaTitle);
                            // To remove an object from an array, you need to remove the exact object.
                            // arrayRemove works by matching the entire object.
                            // If you only pass a subset of the object, it won't work.
                            await updateDoc(docRef, {
                                comments: arrayRemove(commentToDelete),
                                lastUpdated: serverTimestamp()
                            });
                        } catch (error) {
                            console.error("Error deleting comment:", error);
                            Alert.alert('Error', 'No se pudo eliminar el comentario. Inténtalo de nuevo.');
                        } finally {
                            setDeletingCommentId(null);
                        }
                    }
                }
            ]
        );
    }, [currentUser, mangaTitle]);

    // Handle comment like/unlike
    const handleLikeComment = useCallback(async (commentId: string, currentLikes: string[] = []) => {
        if (!currentUser) {
            Alert.alert('Error', 'Debes iniciar sesión para dar "Me gusta".');
            return;
        }

        const userId = currentUser.uid;
        const hasLiked = currentLikes.includes(userId);
        let updatedLikes;

        if (hasLiked) {
            // Unlike: remove userId from likes array
            updatedLikes = currentLikes.filter(id => id !== userId);
        } else {
            // Like: add userId to likes array
            updatedLikes = [...currentLikes, userId];
        }

        try {
            const docRef = doc(db, 'manga_comments', mangaTitle);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data() as MangaCommentsDoc;
                const updatedComments = data.comments.map(comment =>
                    comment.id === commentId
                        ? { ...comment, likes: updatedLikes }
                        : comment
                );

                await updateDoc(docRef, {
                    comments: updatedComments,
                    lastUpdated: serverTimestamp()
                });
            }
        } catch (error) {
            console.error("Error updating like status:", error);
            Alert.alert('Error', 'No se pudo actualizar el estado de "Me gusta".');
        }
    }, [currentUser, mangaTitle]);


    // Render each comment
    const renderCommentItem = ({ item }: { item: Comment }) => {
        const isMyComment = item.userId === currentUser?.uid;
        const isDeleting = deletingCommentId === item.id;
        const currentLikes = item.likes || [];
        const hasLiked = currentUser ? currentLikes.includes(currentUser.uid) : false;
        const likeCount = currentLikes.length;

        return (
            <View style={styles.commentBox}>
                <View style={styles.commentHeader}>
                    {item.avatar ? (
                        <Image source={{ uri: item.avatar }} style={styles.avatar} />
                    ) : (
                        <View style={styles.defaultAvatar}>
                            <Text style={styles.defaultAvatarText}>
                                {item.userName?.charAt(0).toUpperCase() || '?'}
                            </Text>
                        </View>
                    )}
                    <View style={styles.userInfo}>
                        <Text style={styles.commentSender}>
                            {isMyComment ? 'Tú' : item.userName}
                        </Text>
                        <Text style={styles.commentTime}>
                            {item.createdAt?.toDate?.()
                                ? `${item.createdAt.toDate().toLocaleDateString()} ${item.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : <Text>Ahora</Text>} {/* Fixed: Text inside Text for 'Ahora' */}
                        </Text>
                    </View>
                    {isMyComment && (
                        <TouchableOpacity
                            onPress={() => handleDeleteComment(item)}
                            style={styles.deleteButton}
                            disabled={isDeleting}
                            accessibilityLabel={`Eliminar comentario de ${item.userName}`}
                        >
                            {isDeleting ? (
                                <ActivityIndicator size="small" color="#FF6B6B" />
                            ) : (
                                <MaterialCommunityIcons name="trash-can-outline" size={20} color="#FF6B6B" />
                            )}
                        </TouchableOpacity>
                    )}
                </View>
                <Text style={styles.commentText}>{item.text}</Text>

                {/* Like Button */}
                <View style={styles.commentActions}>
                    <TouchableOpacity
                        onPress={() => handleLikeComment(item.id, item.likes)}
                        style={styles.likeButton}
                        disabled={!currentUser} // Disable if not logged in
                    >
                        <Ionicons
                            name={hasLiked ? "heart" : "heart-outline"}
                            size={20}
                            color={hasLiked ? "#FF6B6B" : "#AAA"}
                        />
                        {/* Fixed: Text inside Text for like count */}
                        <Text style={styles.likeCountText}>{likeCount > 0 ? likeCount : ''}</Text>
                    </TouchableOpacity>
                </View>
            </View>
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
                    <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
                        {mangaTitle}
                    </Text>
                    <View style={styles.headerRightPlaceholder} />
                </View>

                {/* Comments List */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#FF6B6B" />
                        <Text style={styles.loadingText}>Cargando comentarios...</Text>
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={comments}
                        keyExtractor={(item) => item.id}
                        renderItem={renderCommentItem}
                        contentContainerStyle={styles.commentsListContent}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="chatbubbles-outline" size={80} color="#666" />
                                <Text style={styles.emptyText}>No hay comentarios aún</Text>
                                <Text style={styles.emptySubtext}>Sé el primero en comentar</Text>
                            </View>
                        }
                    />
                )}

                {/* Input for new comments */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.inputContainer}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
                >
                    <TextInput
                        style={styles.commentInput}
                        placeholder="Escribe un comentario..."
                        placeholderTextColor="#999"
                        value={newComment}
                        onChangeText={setNewComment}
                        multiline
                        editable={!sending}
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, (!newComment.trim() || sending) && styles.sendButtonDisabled]}
                        onPress={handlePostComment}
                        disabled={!newComment.trim() || sending}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <Ionicons name="send" size={20} color="#FFF" />
                        )}
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
};

// Styles
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
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        backgroundColor: 'rgba(0,0,0,0.2)',
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
    headerRightPlaceholder: {
        width: 34,
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
    commentsListContent: {
        padding: 15,
        flexGrow: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 50,
    },
    emptyText: {
        color: '#999',
        fontSize: 18,
        marginTop: 10,
    },
    emptySubtext: {
        color: '#666',
        fontSize: 14,
    },
    commentBox: {
        backgroundColor: '#2A2A3B',
        borderRadius: 10,
        padding: 15,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    commentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
        backgroundColor: '#555',
    },
    defaultAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#444',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    defaultAvatarText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 18,
    },
    userInfo: {
        flex: 1,
    },
    commentSender: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 15,
    },
    commentTime: {
        color: '#AAA',
        fontSize: 12,
    },
    commentText: {
        color: '#FFF',
        fontSize: 16,
        lineHeight: 22,
    },
    commentActions: {
        flexDirection: 'row',
        marginTop: 10,
        justifyContent: 'flex-end', // Align actions to the right
    },
    likeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    likeCountText: {
        marginLeft: 5,
        color: '#FFF',
        fontSize: 14,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: '#333',
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    commentInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#555',
        borderRadius: 25,
        paddingHorizontal: 15,
        paddingVertical: Platform.OS === 'ios' ? 12 : 10,
        marginRight: 10,
        color: '#FFF',
        backgroundColor: '#2A2A3B',
        maxHeight: 120,
        fontSize: 16,
    },
    sendButton: {
        backgroundColor: '#6B8AFD',
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#555',
    },
    deleteButton: {
        marginLeft: 10,
        padding: 5,
    },
});

export default CommentsScreen;