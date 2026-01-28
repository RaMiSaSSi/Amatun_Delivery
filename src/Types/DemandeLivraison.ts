import { Type } from "./types";

// types/DemandeLivraison.ts
export enum StatutDemande {
  EN_ATTENTE = 'EN_ATTENTE',
  CONFIRMEE = 'CONFIRMEE',
  ANNULEE = 'ANNULEE',
  ACCEPTEE = 'ACCEPTEE',
  EN_COURS = 'EN_COURS',
  LIVREE = 'LIVREE',
  RETOUR = 'RETOUR'
}

export interface DemandeLivraison {
  id: number;
  createdAt: string;
  updatedAt: string;
  statut: StatutDemande;
  livreurId?: number;
  type?: Type;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  ville: string;
  quartier: string;
  adresseCourte: string;
  pointDeRepere?: string;
  nomDestinataire: string;
  prenomDestinataire: string;
  telephoneDestinataire: string;
  villeDestinataire: string;
  quartierDestinataire: string;
  adresseCourteDestinataire: string;
  pointDeRepereDestinataire?: string;
  dateLivraison: string;
  creneau?: string;
  typeArticle?: string;
  photoArticlePath?: string;
  methodePaiement?: string;
}
