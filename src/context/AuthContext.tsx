import React, { createContext, useState, useEffect, useContext } from 'react';
import { StorageService } from '../services/storage';
import api from '../services/LivreurService';
import { AuthenticationResponse } from '../Types/auth';

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    userId: number | null;
    role: string | null;
    login: (data: AuthenticationResponse, email: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userId, setUserId] = useState<number | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Vérifier la session au démarrage
    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const token = await StorageService.getItem('jwt');
            const storedId = await StorageService.getItem('id');
            const storedRole = await StorageService.getItem('role');

            if (token && storedId && storedRole === 'LIVREUR') {
                setIsAuthenticated(true);
                setUserId(parseInt(storedId));
                setRole(storedRole);
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            } else {
                // Token invalide ou mauvais rôle
                await logout();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (data: AuthenticationResponse, email: string) => {
        // Vérification stricte du rôle (Guard logique)
        if (data.role !== 'LIVREUR') {
            throw new Error('Accès réservé aux livreurs');
        }


        if (data.jwt) await StorageService.setItem('jwt', data.jwt);
        if (data.refreshToken) await StorageService.setItem('refreshToken', data.refreshToken);
        if (data.userId) await StorageService.setItem('id', data.userId.toString());
        if (data.role) await StorageService.setItem('role', data.role);
        await StorageService.setItem('email', email); // Pour le refresh token

        // Spécifique livreur
        await StorageService.setItem('livreurId', data.userId.toString());

        setIsAuthenticated(true);
        setUserId(data.userId);
        setRole(data.role);

        api.defaults.headers.common['Authorization'] = `Bearer ${data.jwt}`;
    };

    const logout = async () => {
        await StorageService.clearAuth();
        delete api.defaults.headers.common['Authorization'];
        setIsAuthenticated(false);
        setUserId(null);
        setRole(null);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, isLoading, userId, role, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);