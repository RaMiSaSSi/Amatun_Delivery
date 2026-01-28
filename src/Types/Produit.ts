// File: src/app/models/produit.model.ts

export interface Produit {
  id: number;
  nom: string;
  description: string;
  prix: number;
  quantite: number;
  categorieId?: number;
  sousCategorieId?: number;
  boutiqueId: number;
  promo?: boolean;
  promotionPercentage?: number;
  duree?: number;
  startDate?: string;
imagePaths?: string[];
  dateDeCreation?: string; 
  marque?: string; 
  views: number;
  taille?: string[]; 
  couleur?: string[];
  pointsPrix?: number;
  pointsAchats?: number;
}