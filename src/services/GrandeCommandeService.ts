import api from './LivreurService';
import { GrandeCommande } from '../Types/GrandeCommande.model';

export const GrandeCommandeService = {
    // Récupérer la liste des grandes commandes pour un livreur
    getGrandesCommandes: async (livreurId: number): Promise<GrandeCommande[]> => {
        const response = await api.get(`/livreur/grandes-commandes`, {
            params: { livreurId }
        });
        return response.data;
    },

    // Accepter une grande commande (groupe de commandes)
    accepterGrandeCommande: async (grandeCommandeId: number, livreurId: number): Promise<GrandeCommande> => {
        const response = await api.post(`/livreur/grande-commande/${grandeCommandeId}/accept`, null, {
            params: { livreurId }
        });
        return response.data;
    },

    // Récupérer les détails d'une grande commande
    getGrandeCommandeById: async (id: number): Promise<GrandeCommande> => {
        const response = await api.get(`/livreur/grande-commande/${id}`);
        return response.data;
    }
};
