import { useState, useCallback } from 'react';
import { AlertButton, IoniconsIconName } from '../components/customAlert';

interface AlertConfig {
    visible: boolean;
    title: string;
    message: string;
    buttons: AlertButton[];
    showIcon?: boolean;
    iconName?: IoniconsIconName;
    iconColor?: string;
}

export const useAlert = () => {
    const [alertConfig, setAlertConfig] = useState<AlertConfig>({
        visible: false,
        title: '',
        message: '',
        buttons: [],
        showIcon: false,
        iconName: 'information-circle',
        iconColor: '#FF6E6E'
    });

    const showAlert = useCallback((
        title: string,
        message: string,
        buttons: AlertButton[] = [{ text: 'OK' }],
        options?: {
            showIcon?: boolean;
            iconName?: IoniconsIconName;
            iconColor?: string;
        }
    ) => {
        setAlertConfig({
            visible: true,
            title,
            message,
            buttons: buttons.length > 0 ? buttons : [{ text: 'OK' }],
            showIcon: options?.showIcon || false,
            iconName: options?.iconName || 'information-circle',
            iconColor: options?.iconColor || '#FF6E6E'
        });
    }, []);

    const hideAlert = useCallback(() => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    }, []);

    const alert = useCallback((
        title: string,
        message: string,
        buttons?: AlertButton[],
        options?: {
            showIcon?: boolean;
            iconName?: IoniconsIconName;
            iconColor?: string;
        }
    ) => {
        showAlert(title, message, buttons, options);
    }, [showAlert]);

    // Métodos predefinidos para tipos comunes de alertas
    const alertSuccess = useCallback((message: string, title: string = 'Éxito') => {
        showAlert(title, message, [{ text: 'OK' }], {
            showIcon: true,
            iconName: 'checkmark-circle',
            iconColor: '#4CD964'
        });
    }, [showAlert]);

    const alertError = useCallback((message: string, title: string = 'Error') => {
        showAlert(title, message, [{ text: 'OK' }], {
            showIcon: true,
            iconName: 'close-circle',
            iconColor: '#FF3B30'
        });
    }, [showAlert]);

    const alertWarning = useCallback((message: string, title: string = 'Advertencia') => {
        showAlert(title, message, [{ text: 'OK' }], {
            showIcon: true,
            iconName: 'warning',
            iconColor: '#FFCC00'
        });
    }, [showAlert]);

    const alertInfo = useCallback((message: string, title: string = 'Información') => {
        showAlert(title, message, [{ text: 'OK' }], {
            showIcon: true,
            iconName: 'information-circle',
            iconColor: '#007AFF'
        });
    }, [showAlert]);

    const alertConfirm = useCallback((
        message: string, // Primer parámetro: mensaje
        onConfirm: () => void, // Segundo parámetro: callback de confirmación
        title: string = 'Confirmar', // Tercer parámetro: título (opcional)
        confirmText: string = 'Sí', // Cuarto parámetro: texto del botón de confirmar (opcional)
        cancelText: string = 'Cancelar' // Quinto parámetro: texto del botón de cancelar (opcional)
    ) => {
        showAlert(title, message, [
            {
                text: cancelText,
                style: 'cancel',
                onPress: () => { }
            },
            {
                text: confirmText,
                onPress: onConfirm
            }
        ], {
            showIcon: true,
            iconName: 'help-circle',
            iconColor: '#FF6E6E'
        });
    }, [showAlert]);

    return {
        alertConfig,
        showAlert,
        hideAlert,
        alert,
        alertSuccess,
        alertError,
        alertWarning,
        alertInfo,
        alertConfirm
    };
};

export default useAlert;