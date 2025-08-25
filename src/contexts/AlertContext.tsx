import React, { createContext, useContext, ReactNode } from 'react';
import CustomAlert, { AlertButton, IoniconsIconName } from '../components/customAlert';
import { useAlert } from '../hooks/useAlert';

interface AlertOptions {
    showIcon?: boolean;
    iconName?: IoniconsIconName;
    iconColor?: string;
}

interface AlertContextType {
    showAlert: (title: string, message: string, buttons?: AlertButton[], options?: AlertOptions) => void;
    hideAlert: () => void;
    alert: (title: string, message: string, buttons?: AlertButton[], options?: AlertOptions) => void;
    alertSuccess: (message: string, title?: string) => void;
    alertError: (message: string, title?: string) => void;
    alertWarning: (message: string, title?: string) => void;
    alertInfo: (message: string, title?: string) => void;
    alertConfirm: (
        message: string,
        onConfirm: () => void,
        title?: string,
        confirmText?: string,
        cancelText?: string
    ) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

interface AlertProviderProps {
    children: ReactNode;
}

export const AlertProvider: React.FC<AlertProviderProps> = ({ children }) => {
    const {
        alertConfig,
        showAlert,
        hideAlert,
        alert,
        alertSuccess,
        alertError,
        alertWarning,
        alertInfo,
        alertConfirm
    } = useAlert();

    return (
        <AlertContext.Provider
            value={{
                showAlert,
                hideAlert,
                alert,
                alertSuccess,
                alertError,
                alertWarning,
                alertInfo,
                alertConfirm
            }}
        >
            {children}
            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onDismiss={hideAlert}
                showIcon={alertConfig.showIcon}
                iconName={alertConfig.iconName}
                iconColor={alertConfig.iconColor}
            />
        </AlertContext.Provider>
    );
};

export const useAlertContext = (): AlertContextType => {
    const context = useContext(AlertContext);
    if (!context) {
        throw new Error('useAlertContext must be used within an AlertProvider');
    }
    return context;
};

export default AlertContext;