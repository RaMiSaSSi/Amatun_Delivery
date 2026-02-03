import { Adresse } from './types';

export enum Role {
  CLIENT = 'CLIENT',
  LIVREUR = 'LIVREUR',
  BOUTIQUE = 'BOUTIQUE',
  ADMIN = 'ADMIN'
}

export enum MoyenTransport {
  MOTO = 'MOTO',
  VOITURE = 'VOITURE',
  VELO = 'VELO',
  CAMION = 'CAMION'
}

export interface UtilisateurInscrit {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  telephone: string;
  role: Role;
  refreshToken?: string;
  adresseLivraison?: Adresse;
  pointsFidelite?: number;
  qrCodePromo?: string;
  firstLogin?: boolean;
}

export interface Livreur extends UtilisateurInscrit {

  moyen: MoyenTransport;
  dispo: boolean;
  online:boolean;
  plafond:number;
  cashbalance:number;
}

export interface AuthenticationRequest {
  email: string;
  password: string;
}

export interface AuthenticationResponse {
  jwt: string;
  role: string;
  userId: number;
  refreshToken: string;
}