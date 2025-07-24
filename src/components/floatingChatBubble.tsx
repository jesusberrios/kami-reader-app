import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

interface FloatingChatBubbleProps {
    clientId?: string;
    // Nueva prop para controlar la visibilidad
    visible?: boolean;
}

const FloatingChatBubble: React.FC<FloatingChatBubbleProps> = ({
    clientId,
    visible = true
}) => {
    const navigation = useNavigation();

    const handlePress = () => {
        navigation.navigate('ChatList');
    };

    if (!visible) return null;

    return (
        <View style={styles.container} pointerEvents="box-none">
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={handlePress}
                style={styles.bubble}
            >
                <Ionicons
                    name="chatbubbles"
                    size={28}
                    color="#fff"
                />
                {/* Puedes añadir un badge para mensajes no leídos */}
                {/* <View style={styles.badge}>
                    <Text style={styles.badgeText}>3</Text>
                </View> */}
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 30,
        right: 20,
        // Permitir tocar solo la burbuja sin bloquear otros elementos
        zIndex: 1000,
    },
    bubble: {
        backgroundColor: '#007bff',
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    },
    badge: {
        position: 'absolute',
        top: -5,
        right: -5,
        backgroundColor: 'red',
        borderRadius: 10,
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
});

export default FloatingChatBubble;
