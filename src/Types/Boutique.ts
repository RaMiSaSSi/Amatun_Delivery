// boutique.model.ts
export interface Boutique {
  id: number;
  nom: string;
  telephone: string;
  email: string;
  image: Uint8Array;
  banner: Uint8Array;
  adresseId: number;
  categorieIds: number[];
  views?: number;
  bannerPath?: string;
  imagePath?: string;
  categoryShopId: number;
  online?:string;
  facebookUrl?:string;
  instagramUrl?:string;
  tiktokUrl?:string;
}