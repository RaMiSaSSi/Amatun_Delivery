import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// On utilise SecureStore pour iOS/Android, et AsyncStorage fallback pour le web
const isWeb = Platform.OS === 'web';

export const StorageService = {
    async setItem(key: string, value: string) {
        try {
            if (value === undefined || value === null) {
                console.warn(`StorageService: Attempted to save null/undefined for key: ${key}`);
                return;
            }
            const stringValue = typeof value === 'string' ? value : String(value);

            if (isWeb) {
                await AsyncStorage.setItem(key, stringValue);
            } else {
                await SecureStore.setItemAsync(key, stringValue);
            }
        } catch (e) {
            console.error(`Erreur sauvegarde secure pour la clé ${key}:`, e);
        }
    },

    async getItem(key: string): Promise<string | null> {
        try {
            if (isWeb) {
                return await AsyncStorage.getItem(key);
            } else {
                return await SecureStore.getItemAsync(key);
            }
        } catch (e) {
            console.error('Erreur lecture secure:', e);
            return null;
        }
    },

    async removeItem(key: string) {
        try {
            if (isWeb) {
                await AsyncStorage.removeItem(key);
            } else {
                await SecureStore.deleteItemAsync(key);
            }
        } catch (e) {
            console.error('Erreur suppression secure:', e);
        }
    },

    async clearAuth() {
        await this.removeItem('jwt');
        await this.removeItem('refreshToken');
        await this.removeItem('id');
        await this.removeItem('role');
        await this.removeItem('livreurId');
    }
};