import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { DrawerParamList } from '../navigation/types';

const DrawerToggle = () => {
    const navigation = useNavigation<DrawerNavigationProp<DrawerParamList>>();
    const [scaleValue] = useState(new Animated.Value(1));
    const [rotationValue] = useState(new Animated.Value(0));

    const handlePress = () => {
        // Animation sequence
        Animated.sequence([
            // Scale down
            Animated.timing(scaleValue, {
                toValue: 0.9,
                duration: 100,
                easing: Easing.ease,
                useNativeDriver: true,
            }),
            // Scale back up with rotation
            Animated.parallel([
                Animated.timing(scaleValue, {
                    toValue: 1,
                    duration: 200,
                    easing: Easing.elastic(1.5),
                    useNativeDriver: true,
                }),
                Animated.timing(rotationValue, {
                    toValue: 1,
                    duration: 300,
                    easing: Easing.ease,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();

        // Reset rotation for next press
        rotationValue.setValue(0);

        // Toggle drawer
        navigation.toggleDrawer();
    };

    const rotation = rotationValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '90deg'],
    });

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    transform: [
                        { scale: scaleValue },
                        { rotateZ: rotation }
                    ]
                }
            ]}
        >
            <TouchableOpacity
                onPress={handlePress}
                activeOpacity={0.7}
                testID="drawer-toggle-button"
                accessibilityLabel="Abrir menú de navegación"
                accessibilityRole="button"
            >
                <Ionicons
                    name="menu"
                    size={28}
                    color="#FF6E6E"
                    style={styles.icon}
                />
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginRight: 15,
        padding: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 110, 110, 0.1)',
    },
    icon: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
});

export default DrawerToggle;