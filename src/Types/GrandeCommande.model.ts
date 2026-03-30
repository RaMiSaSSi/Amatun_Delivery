// types.ts

import { Commande } from "./types";

export interface GrandeCommande {
  id: number;
  code: string;
  dateCreation: string;
  statut: 'PENDING' | 'ACCEPTED' | 'CONFIRMED';
  livreurId: number;
  boutiqueId: number;
  commandes: Commande[]; // Assurez-vous d'avoir l'interface Commande définie
  totalPrixLivraison: number;
}


