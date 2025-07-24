// src/types/react-native-canvas.d.ts
declare module 'react-native-canvas' {
    import React from 'react';
    import { ViewProps } from 'react-native';

    export interface CanvasProps extends ViewProps {
        ref: React.Ref<Canvas>;
    }

    class Canvas extends React.Component<CanvasProps> {
        getContext(contextType: '2d'): CanvasRenderingContext2D;
        // Agrega otras propiedades y métodos que uses de Canvas si TypeScript se sigue quejando
        width: number;
        height: number;
    }

    export default Canvas;
}