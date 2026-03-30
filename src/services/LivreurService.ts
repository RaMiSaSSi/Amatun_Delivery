import axios from 'axios';

import { StorageService } from './storage';
import { Type } from '../Types/types';

import { API_BASE_URL } from '../config/api';

// IMPORTANT : Mettez l'IP de votre machine, pas localhost pour le mobile
export const BASE_URL = API_BASE_URL;

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    'bypass-tunnel-reminder': 'true'
  },
});

// Intercepteur pour ajouter le token JWT si vous en avez un (simulé ici)
api.interceptors.request.use(async (config) => {
  const token = await StorageService.getItem('jwt');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    // Si erreur 401 (Non autorisé) ou 403 (Souvent JWT expiré dans Spring Security)
    if ((error.response?.status === 401 || error.response?.status === 403) && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await StorageService.getItem('refreshToken');
        const email = await StorageService.getItem('email');
        
        if (!refreshToken || !email) {
          throw new Error('No refresh token or email found');
        }

        // Appel au endpoint Refresh via axios direct pour éviter les intercepteurs sur cet appel
        const response = await axios.post(`${BASE_URL}/auth/refresh-token`, {
          refreshToken,
          email
        });

        const { jwt, refreshToken: newRefreshToken } = response.data;
        
        // Sauvegarder les nouveaux tokens
        await StorageService.setItem('jwt', jwt);
        if (newRefreshToken) await StorageService.setItem('refreshToken', newRefreshToken);
        
        // Mettre à jour le header et rejouer la requête initiale
        api.defaults.headers.common['Authorization'] = `Bearer ${jwt}`;
        originalRequest.headers['Authorization'] = `Bearer ${jwt}`;

        return api(originalRequest);
      } catch (refreshError) {
        // Si le refresh échoue, on déconnecte tout
        await StorageService.clearAuth();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);


export const LivreurService = {
  // Récupérer les commandes du jour
  getCommandesByDay: async (date: string, livreurId: number) => {
    const response = await api.get(`/livreur/commandes/by-day`, {
      params: { date, livreurId }
    });
    return response.data;
  },

  // Accepter une commande
  acceptCommande: async (commandeId: number, livreurId: number) => {
    const response = await api.post(`/livreur/commande/${commandeId}/accept?livreurId=${livreurId}`, {});
    return response.data;
  },

  // Changer le statut (Shipped, Delivered, etc.)
  updateStatut: async (commandeId: number, statut: string, raison?: string) => {
    const response = await api.put(`/livreur/commande/${commandeId}/statut`, null, {
      params: { statut, raison }
    });
    return response.data;
  },


  // Historique dynamique
  getHistorique: async (livreurId: number, startDate?: string, endDate?: string) => {
    const response = await api.get(`/livreur/commandes/historique-dynamique`, {
      params: { livreurId, startDate, endDate }
    });
    return response.data;
  },

  getCommandeDetails: async (commandeId: number) => {
    const response = await api.get(`/livreur/commande/${commandeId}/details`);
    return response.data;
  },
  getProduitById: async (id: number) => {
    const response = await api.get(`/livreur/produit/${id}`);
    return response.data;
  },

  getBoutiqueById: async (id: number) => {
    const response = await api.get(`/livreur/boutique/${id}`);
    return response.data;
  },

  getAdresseById: async (id: number) => {
    const response = await api.get(`/livreur/adresse/${id}`);
    return response.data;
  },

  countConfirmedCommandesByDate: async (date: string) => {
    const response = await api.get(`/livreur/commandes/count-by-day`, {
      params: { date }
    });
    return response.data;
  },

  countCommandesByType: async (livreurId: number, type: Type) => {
    const response = await api.get(`/livreur/commandes/count-by-type`, {
      params: { livreurId, type }
    });
    return response.data;
  },

  countBoutiquesInCommande: async (commandeId: number) => {
    const response = await api.get(`/livreur/commande/${commandeId}/boutiques/count`);
    return response.data;
  },

  getLivreurInfos: async (id: number) => {
    const response = await api.get(`/livreur/${id}/infos`);
    return response.data;
  },



  updateStatus: async (livreurId: number, online: boolean) => {
    const response = await api.put(`/livreur/status`, null, {
      params: { livreurId, online }
    });
    return response.data;
  },

  getCurrentOrders: async (livreurId: number) => {
    try {
      const response = await api.get(`/livreur/commandes/current`, {
        params: { livreurId }
      });
      return response.data;
    } catch (error) {
      console.error('[FRONT] Exception getCurrentOrders:', error);
      throw error;
    }
  },

  getCommandeByQrToken: async (qrToken: string) => {
    const response = await api.get(`/livreur/commande/by-token/${qrToken}`);
    return response.data;
  },

  acceptGrandeCommande: async (id: number, livreurId: number) => {
    const response = await api.post(`/livreur/grande-commande/${id}/accept`, null, {
      params: { livreurId }
    });
    return response.data;
  },

  getGrandesCommandes: async (livreurId: number) => {
    const response = await api.get(`/livreur/grandes-commandes`, {
      params: { livreurId }
    });
    return response.data;
  },

  getAvailableGrandesCommandes: async () => {
    const response = await api.get(`/livreur/grandes-commandes/available`);
    return response.data;
  },

  getGrandeCommandeById: async (id: number) => {
    const response = await api.get(`/livreur/grande-commande/${id}`);
    return response.data;
  },

  updateGrandeCommandeStatut: async (grandeCommandeId: number, statut: string) => {
    const response = await api.post(`/livreur/grande-commande/${grandeCommandeId}/statut`, null, {
      params: { statut }
    });
    return response.data;
  },
};

export default api;