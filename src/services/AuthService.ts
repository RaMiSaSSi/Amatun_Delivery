import axios from 'axios';
import { StorageService } from './storage';
import { API_BASE_URL } from '../config/api';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const AuthService = {
    login: async (email: string, mdp: string) => {
        try {
            const response = await api.post('/auth/login', {
                email,
                password: mdp
            });

            if (response.data && response.data.jwt) {
                const { jwt, refreshToken, userId, role } = response.data;
                
                if (role !== 'LIVREUR') {
                    throw new Error('Seuls les livreurs peuvent se connecter à cette application.');
                }

                await StorageService.setItem('jwt', jwt);
                if (refreshToken) await StorageService.setItem('refreshToken', refreshToken);
                await StorageService.setItem('livreurId', userId.toString());
                await StorageService.setItem('role', role);
                await StorageService.setItem('email', email);

                return response.data;
            }
            throw new Error('Identifiants invalides');
        } catch (error: any) {
            console.error('Login error:', error);
            throw error;
        }
    },

    logout: async () => {
        await StorageService.clearAuth();
    },

    getLivreurId: async (): Promise<number | null> => {
        const id = await StorageService.getItem('livreurId');
        return id ? parseInt(id, 10) : null;
    },

    isAuthenticated: async (): Promise<boolean> => {
        const token = await StorageService.getItem('jwt');
        return !!token;
    },

    refreshToken: async () => {
        try {
            const email = await StorageService.getItem('email');
            const refreshToken = await StorageService.getItem('refreshToken');
            
            if (!email || !refreshToken) throw new Error('No credentials for refresh');

            const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
                email,
                refreshToken
            });

            if (response.data && response.data.jwt) {
                await StorageService.setItem('jwt', response.data.jwt);
                return response.data.jwt;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            await StorageService.clearAuth();
            throw error;
        }
    }
};
