import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePersonalization } from '../contexts/PersonalizationContext';

interface UpdateRequiredModalProps {
    visible: boolean;
    currentVersion: string;
    minVersion: string;
    iosAppId: string;
    androidPackageName: string;
}

const UpdateRequiredModal: React.FC<UpdateRequiredModalProps> = ({
    visible,
    currentVersion,
    minVersion,
    iosAppId,
    androidPackageName,
}) => {
    const { theme } = usePersonalization();
    const handleUpdateApp = () => {
        const storeUrl = Platform.OS === 'ios'
            ? `itms-apps://itunes.apple.com/app/id${iosAppId}`
            : `market://details?id=${androidPackageName}`;

        Linking.openURL(storeUrl).catch(err => {
            // Si falla, abrir en navegador
            const webUrl = Platform.OS === 'ios'
                ? `https://apps.apple.com/app/id${iosAppId}`
                : `https://play.google.com/store/apps/details?id=${androidPackageName}`;

            Linking.openURL(webUrl);
        });
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={() => { }} // No permitir cerrar el modal
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContainer, { backgroundColor: theme.card, borderColor: theme.border }]}> 
                    <MaterialCommunityIcons
                        name="alert-circle-outline"
                        size={50}
                        color={theme.danger}
                        style={styles.modalIcon}
                    />
                    <Text style={[styles.modalTitle, { color: theme.text }]}>Actualización Requerida</Text>
                    <Text style={[styles.modalText, { color: theme.textMuted }]}>
                        La versión actual de la app ({currentVersion}) ya no es compatible.
                        Por favor, actualiza a la versión {minVersion} o superior para continuar.
                    </Text>
                    <Text style={[styles.modalSubtext, { color: theme.textMuted }]}>
                        Esta actualización incluye mejoras de seguridad y nuevas funciones.
                    </Text>
                    <TouchableOpacity
                        style={[styles.modalButton, styles.updateButton, { backgroundColor: theme.accent }]}
                        onPress={handleUpdateApp}
                    >
                        <Text style={[styles.modalButtonText, { color: theme.text }]}>Actualizar Ahora</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    modalContainer: {
        backgroundColor: '#1E1E2A',
        borderRadius: 10,
        borderWidth: 1,
        padding: 20,
        width: '90%',
        maxWidth: 500,
        maxHeight: '85%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8,
    },
    modalIcon: {
        alignSelf: 'center',
        marginBottom: 15,
    },
    modalTitle: {
        fontSize: 22,
        fontFamily: 'Roboto-Bold',
        color: 'white',
        marginBottom: 15,
        textAlign: 'center',
    },
    modalText: {
        fontSize: 14,
        fontFamily: 'Roboto-Regular',
        color: '#DDD',
        lineHeight: 20,
        textAlign: 'center',
        marginBottom: 10,
    },
    modalSubtext: {
        fontSize: 13,
        fontFamily: 'Roboto-Regular',
        color: '#AAA',
        marginTop: 10,
        textAlign: 'center',
    },
    modalButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 20,
    },
    updateButton: {
        backgroundColor: '#FF5252',
        width: '100%',
    },
    modalButtonText: {
        color: 'white',
        fontFamily: 'Roboto-Medium',
        fontSize: 16,
    },
});

export default UpdateRequiredModal;