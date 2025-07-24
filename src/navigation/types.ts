export type RootStackParamList = {
    Auth: undefined;
    Main: undefined;
    Details: { slug: string };
    Reader: { hid: string };
    Payment: undefined;
    Profile: undefined;
    Chat: { clientId?: string };
};

export type DrawerParamList = {
    Home: undefined;
    Profile: undefined;
    Library: undefined;
};

// Combina ambos tipos para el drawer
export type CombinedDrawerParamList = RootStackParamList & DrawerParamList;

declare global {
    namespace ReactNavigation {
        interface RootParamList extends CombinedDrawerParamList { }
    }
}