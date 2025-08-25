import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableWithoutFeedback,
    TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

// Tipo para los iconos de Ionicons
export type IoniconsIconName = keyof typeof Ionicons.glyphMap;

export interface AlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertProps {
    visible: boolean;
    title: string;
    message: string;
    buttons?: AlertButton[];
    onDismiss: () => void;
    showIcon?: boolean;
    iconName?: IoniconsIconName;
    iconColor?: string;
}

const CustomAlert: React.FC<CustomAlertProps> = ({
    visible,
    title,
    message,
    buttons = [],
    onDismiss,
    showIcon = false,
    iconName = 'information-circle',
    iconColor = '#FF6E6E'
}) => {
    if (!visible) return null;

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onDismiss}
        >
            <TouchableWithoutFeedback onPress={onDismiss}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback>
                        <View style={styles.alertContainer}>
                            <LinearGradient
                                colors={['#1E1E2D', '#2D2D42']}
                                style={styles.gradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                {showIcon && (
                                    <View style={styles.iconContainer}>
                                        <Ionicons name={iconName} size={40} color={iconColor} />
                                    </View>
                                )}

                                <Text style={styles.title}>{title}</Text>
                                <Text style={styles.message}>{message}</Text>

                                <View style={[
                                    styles.buttonContainer,
                                    buttons.length > 2 ? styles.columnLayout : styles.rowLayout
                                ]}>
                                    {buttons.map((button, index) => (
                                        <TouchableOpacity
                                            key={index}
                                            style={[
                                                styles.button,
                                                button.style === 'cancel' && styles.cancelButton,
                                                button.style === 'destructive' && styles.destructiveButton,
                                                buttons.length > 2 && styles.columnButton
                                            ]}
                                            onPress={() => {
                                                button.onPress?.();
                                                onDismiss();
                                            }}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[
                                                styles.buttonText,
                                                button.style === 'cancel' && styles.cancelButtonText
                                            ]}>
                                                {button.text}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </LinearGradient>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 15, 26, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    alertContainer: {
        width: '100%',
        maxWidth: 340,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 110, 110, 0.2)',
    },
    gradient: {
        padding: 25,
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: 15,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FF6E6E',
        textAlign: 'center',
        marginBottom: 10,
        fontFamily: 'Roboto-Bold',
    },
    message: {
        fontSize: 16,
        color: '#FFF',
        textAlign: 'center',
        marginBottom: 25,
        lineHeight: 22,
        fontFamily: 'Roboto-Regular',
    },
    buttonContainer: {
        gap: 12,
    },
    rowLayout: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    columnLayout: {
        flexDirection: 'column',
    },
    button: {
        flex: 1,
        backgroundColor: '#FF6E6E',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 25,
        alignItems: 'center',
        minWidth: 100,
    },
    columnButton: {
        width: '100%',
    },
    cancelButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    destructiveButton: {
        backgroundColor: '#E74C3C',
    },
    buttonText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 14,
        fontFamily: 'Roboto-Bold',
    },
    cancelButtonText: {
        color: '#AAA',
    },
});

export default CustomAlert;