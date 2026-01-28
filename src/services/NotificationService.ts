import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Configuration de la gestion des notifications au premier plan
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export const NotificationService = {
    // Demander les permissions et récupérer le Token Expo
    registerForPushNotificationsAsync: async () => {
        let token;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') {
                alert('Échec de l\'obtention du jeton de notification push !');
                return;
            }

            // Récupérer le token pour ce projet spécifique
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;

            token = (await Notifications.getExpoPushTokenAsync({
                projectId
            })).data;
            console.log('Expo Push Token:', token);
        } else {
            alert('Must use physical device for Push Notifications');
        }

        return token;
    },

    // Ajouter un listener pour quand une notification est reçue (app ouverte)
    addNotificationReceivedListener: (callback: (notification: Notifications.Notification) => void) => {
        return Notifications.addNotificationReceivedListener(callback);
    },

    // Ajouter un listener pour quand on clique sur une notification
    addNotificationResponseReceivedListener: (callback: (response: Notifications.NotificationResponse) => void) => {
        return Notifications.addNotificationResponseReceivedListener(callback);
    }
};
