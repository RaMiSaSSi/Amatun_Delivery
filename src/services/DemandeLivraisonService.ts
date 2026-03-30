import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { DemandeLivraison, StatutDemande } from '../Types/DemandeLivraison';
import { Type } from '../Types/types';

import { API_BASE_URL } from '../config/api';
import { StorageService } from './storage';
// Import the configured axios instance that handles tokens
import api from './LivreurService';

const BASE_PATH = '/api/demandes';

export class DemandeLivraisonService {
  static async getDemandesAcceptees(livreurId?: number): Promise<DemandeLivraison[]> {
    console.log(`[FRONT] Appel API: getDemandesAcceptees(livreurId=${livreurId})`);
    try {
      const url = livreurId ? `${BASE_PATH}/acceptees?livreurId=${livreurId}` : `${BASE_PATH}/acceptees`;
      const response = await api.get(url);
      console.log(`[FRONT] getDemandesAcceptees succès: ${Array.isArray(response.data) ? response.data.length : 0} items`);
      return response.data;
    } catch (error) {
      console.error('[FRONT] Exception getDemandesAcceptees:', error);
      throw error;
    }
  }

  static async accepterDemande(id: number, livreurId: number): Promise<DemandeLivraison> {
    console.log(`[FRONT] Appel API: accepterDemande(id=${id}, livreurId=${livreurId})`);
    try {
      const response = await api.post(`${BASE_PATH}/${id}/accepter?livreurId=${livreurId}`);
      console.log('[FRONT] accepterDemande succès');
      return response.data;
    } catch (error) {
      console.error('[FRONT] Exception accepterDemande:', error);
      throw error;
    }
  }

  static async getDemandeById(id: number): Promise<DemandeLivraison> {
    console.log(`[FRONT] Appel API: getDemandeById(id=${id})`);
    try {
      const response = await api.get(`${BASE_PATH}/${id}`);
      console.log('[FRONT] getDemandeById succès');
      return response.data;
    } catch (error) {
      console.error('[FRONT] Exception getDemandeById:', error);
      throw error;
    }
  }

  // Nouvelle méthode : mise à jour du statut d'une demande
  static async updateStatut(id: number, statut: StatutDemande): Promise<DemandeLivraison> {
    console.log(`[FRONT] Appel API: updateStatut(id=${id}, statut=${statut})`);
    try {
      const response = await api.put(`${BASE_PATH}/${id}/statut?statut=${statut}`);
      console.log('[FRONT] updateStatut succès');
      return response.data;
    } catch (error) {
      console.error('[FRONT] Exception updateStatut:', error);
      throw error;
    }
  }

  // Nouvelle méthode : récupérer les livraisons du livreur
  static async getMesLivraisons(livreurId: number): Promise<DemandeLivraison[]> {
    console.log(`[FRONT] Appel API: getMesLivraisons(livreurId=${livreurId})`);
    try {
      const response = await api.get(`${BASE_PATH}/mes-livraisons/${livreurId}`);
      console.log(`[FRONT] getMesLivraisons succès: ${Array.isArray(response.data) ? response.data.length : 0} items`);
      return response.data;
    } catch (error) {
      console.error('[FRONT] Exception getMesLivraisons:', error);
      throw error;
    }
  }

  static async countDemandesByType(type: Type): Promise<number> {
    console.log(`[FRONT] Appel API: countDemandesByType(type=${type})`);
    try {
      const response = await api.get(`${BASE_PATH}/count-by-type?type=${type}`);
      return response.data;
    } catch (error) {
      console.error('[FRONT] Exception countDemandesByType:', error);
      throw error;
    }
  }
}


// WebSocket pour temps réel
export class DemandeWebSocketService {
  private client: Client;
  private onNewDemande: (demande: DemandeLivraison) => void;
  private onDemandeAcceptee: (demande: DemandeLivraison) => void;

  constructor(
    onNewDemande: (demande: DemandeLivraison) => void,
    onDemandeAcceptee: (demande: DemandeLivraison) => void,
    livreurId: number | null
  ) {
    this.onNewDemande = onNewDemande;
    this.onDemandeAcceptee = onDemandeAcceptee;

    this.client = new Client({
      webSocketFactory: () =>
        new SockJS(`${API_BASE_URL}/ws`),
      reconnectDelay: 5000,
    });

    this.client.onConnect = () => {
      // Nouvelles demandes à traiter (Ciblées par disponibilité + état online côté backend)
      if (livreurId) {
        this.client.subscribe(`/topic/livreurs/${livreurId}`, (msg) => {
          const data = JSON.parse(msg.body);
          // Filtrage par type pour éviter les doublons avec les commandes classiques
          if (data.typeArticle) {
            this.onNewDemande(data);
          }
        });
      }

      // Demandes acceptées (Global pour synchroniser les états)
      this.client.subscribe('/topic/commande-accepted', (msg) => {
        this.onDemandeAcceptee(JSON.parse(msg.body));
      });
    };
  }

  async activate() {
    const token = await StorageService.getItem('jwt');
    if (token) {
      this.client.connectHeaders = {
        'Authorization': `Bearer ${token}`
      };
    }
    this.client.activate();
  }

  deactivate() {
    this.client.deactivate();
  }
}
