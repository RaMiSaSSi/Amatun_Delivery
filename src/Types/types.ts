export enum Statut {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
  EN_COURS_DE_RETOUR = 'EN_COURS_DE_RETOUR',
  EN_COURS_D_ECHANGE = 'EN_COURS_D_ECHANGE'
}

export enum Type {
  EXPRESS = 'EXPRESS',
  STANDARD = 'STANDARD'
}

export enum Paiement {
  CASH = 'CASH',
  POINTS = 'POINTS',
}

export enum MoyenTransport {
  VOITURE = 'VOITURE',
  MOTO = 'MOTO'
}

export enum RaisonRetour {
  INJOURNABLE = 'INJOURNABLE',
  NE_REPOND_PAS = 'NE_REPOND_PAS',
  ADRESSE_INCORRECTE = 'ADRESSE_INCORRECTE',
  NUMERO_INVALIDE = 'NUMERO_INVALIDE',
  RENDEZ_VOUS_INDISPONIBLE = 'RENDEZ_VOUS_INDISPONIBLE',
  ANNULATION_CLIENT = 'ANNULATION_CLIENT',
  CLIENT_NON_SERIEUX = 'CLIENT_NON_SERIEUX',
  COLIS_NON_CONFORME = 'COLIS_NON_CONFORME',
  LIVREUR_MIS_A_LA_LISTE_NOIRE = 'LIVREUR_MIS_A_LA_LISTE_NOIRE',
  MONTANT_INCORRECT = 'MONTANT_INCORRECT',
  DEMANDE_OUVERTURE_COLIS = 'DEMANDE_OUVERTURE_COLIS'
}

export interface Adresse {
  id?: number;
  rue: string;
  codePostal: string;
  delegation: string;
  gouvernerat: string;
  latitude?: number;
  longitude?: number;
}

export interface Commande {
  id: number;
  clientId?: number;
  nom?: string;
  prenom?: string;
  adresse: Adresse;
  numTel?: string;
  produits: CommandeProduit[];
  prixTotalSansLivraison: number;
  prixTotalAvecLivraison: number;
  type: Type;
  methodePaiement: Paiement;
  livraison: boolean;
  statut: Statut;
  date: string;
  livreurId?: number;
  acceptedByLivreur?: boolean;
  montantUser?: number;
  code?: string;
  isExchange?: boolean;
  qrToken?: string;
  raisonRetour?: RaisonRetour;
  boutiqueId?: number;
  moyenTransport?: MoyenTransport;
}

export interface CommandeProduit {
  id?: number;
  produitId: number;
  quantite: number;
  taille?: string;
  couleur?: string;
  nom?: string;
  prix?: number;
}

export interface GrandeCommande {
  id: number;
  code: string;
  dateCreation: string;
  statut: Statut;
  moyenTransport?: MoyenTransport;
  livreurId?: number;
  boutiqueId?: number;
  commandes: Commande[];
  totalPrixLivraison: number;
}