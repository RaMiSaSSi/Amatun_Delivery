export enum Statut {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED'
}
export enum Type {
  EXPRESS = 'EXPRESS',
  STANDARD = 'STANDARD'
}
export enum Paiement {
  CASH = 'CASH',
  POINTS = 'POINTS',
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
  date: Date;
  livreurId?: number;
  acceptedByLivreur?: boolean;
  montantUser?: number;
}

export interface CommandeProduit {
  id?: number;
  produitId: number;
  quantite: number;
}