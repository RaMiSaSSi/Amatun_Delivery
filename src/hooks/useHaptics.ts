import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const useHaptics = () => {
    const selection = () => {
        if (Platform.OS !== 'web') {
            Haptics.selectionAsync();
        }
    };

    const notification = (type: Haptics.NotificationFeedbackType) => {
        if (Platform.OS !== 'web') {
            Haptics.notificationAsync(type);
        }
    };

    const impact = (style: Haptics.ImpactFeedbackStyle) => {
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(style);
        }
    };

    return { selection, notification, impact };
};
