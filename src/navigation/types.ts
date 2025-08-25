
// Actualiza tus tipos para el nuevo sistema de navegación:
export type RootStackParamList = {
    Auth: undefined;
    Main: undefined;
    Details: { slug: string };
    Reader: { hid: string };
    Payment: undefined;
    Profile: { userId?: string }; // Añade userId como parámetro opcional
    AddFriends: undefined;
    Chat: { recipientId?: string; recipientName?: string };
};

export type DrawerParamList = {
    Home: undefined;
    Profile: undefined;
    Library: undefined;
};

// Para el nuevo sistema, no necesitas combinar manualmente los tipos
// React Navigation 6+ maneja esto automáticamente

declare global {
    namespace ReactNavigation {
        interface RootParamList extends RootStackParamList { }
    }
}

// Alternativamente, si usas un drawer navigator anidado:
export type AppStackParamList = {
    Drawer: undefined;
    // otras pantallas que no están en el drawer
};

export type HomeStackParamList = {
    Home: undefined;
    Details: { slug: string };
    Reader: { hid: string };
};

export type ProfileStackParamList = {
    Profile: { userId?: string };
    AddFriends: undefined;
    Chat: { recipientId?: string; recipientName?: string };
};