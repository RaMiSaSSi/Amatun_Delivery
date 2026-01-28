import { Platform } from 'react-native';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { DemandeLivraison, StatutDemande } from '../Types/DemandeLivraison';

const API_BASE = 'https://lpvq76hs-8085.uks1.devtunnels.ms/api/demandes'; // à adapter

export class DemandeLivraisonService {
  static async getDemandesAcceptees(livreurId?: number): Promise<DemandeLivraison[]> {
    console.log(`[FRONT] Appel API: getDemandesAcceptees(livreurId=${livreurId})`);
    try {
      const url = livreurId ? `${API_BASE}/acceptees?livreurId=${livreurId}` : `${API_BASE}/acceptees`;
      const res = await fetch(url);
      console.log(`[FRONT] Réponse getDemandesAcceptees: status=${res.status}`);
      if (!res.ok) {
        console.error('[FRONT] Erreur getDemandesAcceptees - Response not OK');
        throw new Error('Erreur récupération demandes');
      }
      const data = await res.json();
      console.log(`[FRONT] getDemandesAcceptees succès: ${Array.isArray(data) ? data.length : 0} items`);
      return data;
    } catch (error) {
      console.error('[FRONT] Exception getDemandesAcceptees:', error);
      throw error;
    }
  }

  static async accepterDemande(id: number, livreurId: number): Promise<DemandeLivraison> {
    console.log(`[FRONT] Appel API: accepterDemande(id=${id}, livreurId=${livreurId})`);
    try {
      const res = await fetch(`${API_BASE}/${id}/accepter?livreurId=${livreurId}`, {
        method: 'POST'
      });
      console.log(`[FRONT] Réponse accepterDemande: status=${res.status}`);
      if (!res.ok) {
        console.error('[FRONT] Erreur accepterDemande - Response not OK');
        throw new Error('Erreur acceptation demande');
      }
      const data = await res.json();
      console.log('[FRONT] accepterDemande succès');
      return data;
    } catch (error) {
      console.error('[FRONT] Exception accepterDemande:', error);
      throw error;
    }
  }

  static async getDemandeById(id: number): Promise<DemandeLivraison> {
    console.log(`[FRONT] Appel API: getDemandeById(id=${id})`);
    try {
      const res = await fetch(`${API_BASE}/${id}`);
      console.log(`[FRONT] Réponse getDemandeById: status=${res.status}`);
      if (!res.ok) {
        console.error('[FRONT] Erreur getDemandeById - Response not OK');
        throw new Error('Demande non trouvée');
      }
      const data = await res.json();
      console.log('[FRONT] getDemandeById succès');
      return data;
    } catch (error) {
      console.error('[FRONT] Exception getDemandeById:', error);
      throw error;
    }
  }

  // Nouvelle méthode : mise à jour du statut d'une demande
  static async updateStatut(id: number, statut: StatutDemande): Promise<DemandeLivraison> {
    console.log(`[FRONT] Appel API: updateStatut(id=${id}, statut=${statut})`);
    try {
      const res = await fetch(`${API_BASE}/${id}/statut?statut=${statut}`, {
        method: 'PUT'
      });
      console.log(`[FRONT] Réponse updateStatut: status=${res.status}`);
      if (!res.ok) {
        console.error('[FRONT] Erreur updateStatut - Response not OK');
        throw new Error('Erreur mise à jour statut');
      }
      const data = await res.json();
      console.log('[FRONT] updateStatut succès');
      return data;
    } catch (error) {
      console.error('[FRONT] Exception updateStatut:', error);
      throw error;
    }
  }

  // Nouvelle méthode : récupérer les livraisons du livreur
  static async getMesLivraisons(livreurId: number): Promise<DemandeLivraison[]> {
    console.log(`[FRONT] Appel API: getMesLivraisons(livreurId=${livreurId})`);
    try {
      const res = await fetch(`${API_BASE}/mes-livraisons/${livreurId}`);
      console.log(`[FRONT] Réponse getMesLivraisons: status=${res.status}`);
      if (!res.ok) {
        console.error('[FRONT] Erreur getMesLivraisons - Response not OK');
        throw new Error('Erreur récupération livraisons');
      }
      const data = await res.json();
      console.log(`[FRONT] getMesLivraisons succès: ${Array.isArray(data) ? data.length : 0} items`);
      return data;
    } catch (error) {
      console.error('[FRONT] Exception getMesLivraisons:', error);
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
        new SockJS('https://lpvq76hs-8085.uks1.devtunnels.ms/ws'), // à adapter
      reconnectDelay: 5000,
    });

    this.client.onConnect = () => {
      // Nouvelles demandes à traiter (Ciblées par disponibilité côté backend)
      if (livreurId) {
        this.client.subscribe(`/topic/livreurs/${livreurId}`, (msg) => {
          this.onNewDemande(JSON.parse(msg.body));
        });
      } else {
        // Fallback global si pas ID (Optionnel, mais plus sûr pour les anciennes versions backend)
        this.client.subscribe('/topic/livreurs', (msg) => {
          this.onNewDemande(JSON.parse(msg.body));
        });
      }

      // Demandes acceptées (par un autre livreur)
      this.client.subscribe('/topic/commande-accepted', (msg) => {
        this.onDemandeAcceptee(JSON.parse(msg.body));
      });
    };
  }

  activate() {
    this.client.activate();
  }

  deactivate() {
    this.client.deactivate();
  }
}
