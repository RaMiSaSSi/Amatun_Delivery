import { LivreurService } from '../services/LivreurService';
import { Commande, CommandeProduit, Statut, Type } from '../Types/types';
import { MoyenTransport } from '../Types/auth';
import { GrandeCommande } from '../Types/GrandeCommande.model';
import { DemandeLivraison } from '../Types/DemandeLivraison';

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
};

const deg2rad = (deg: number) => {
    return deg * (Math.PI / 180);
};

export const calculateDriverRevenue = async (commande: Commande, transportMode?: MoyenTransport, isPartOfBundle: boolean = false, knownBoutiqueCount?: number): Promise<number> => {
    try {
        let nbBoutique = knownBoutiqueCount;

        // If not provided, we need to calculate/fetch it
        if (nbBoutique === undefined) {
            // Try to get it from products if they are fully loaded with boutiqueId (not just CommandeProduit)
            // But CommandeProduit only has produitId. We need to fetch details or count.
            // Efficient way: use the API endpoint for counting boutiques if possible
            if (commande.id) {
                try {
                    nbBoutique = await LivreurService.countBoutiquesInCommande(commande.id);
                } catch (e) {
                    console.warn(`Failed to count boutiques for cmd ${commande.id}`, e);
                    // Fallback to 1 if failure, or 0
                    nbBoutique = 1;
                }
            } else {
                nbBoutique = 1;
            }
        }

        // Ensure nbBoutique is at least 1 to avoid 0 revenue for valid orders
        nbBoutique = nbBoutique && nbBoutique > 0 ? nbBoutique : 1;

        // --- NEW LOGIC (MOTO & VOITURE) ---
        if (transportMode === MoyenTransport.MOTO) {
            if (commande.type === Type.EXPRESS) {
                return 6.0 * nbBoutique;
            } else {
                // STANDARD
                return 4.0 * nbBoutique;
            }
        } else if (transportMode === MoyenTransport.VOITURE) {
            if (commande.type === Type.EXPRESS) {
                return 7.0 * nbBoutique;
            } else {
                // STANDARD
                return 5.0 * nbBoutique;
            }
        }

        // --- FALLBACK FOR OTHER MODES (VELO, CAMION, etc.) ---
        // Keep distance-based or rely on a default. 
        // Let's use the distance logic as fallback to be safe, but we need to fetch addresses.

        let cmdToProcess = commande;
        if (!cmdToProcess.produits || cmdToProcess.produits.length === 0) {
            try {
                cmdToProcess = await LivreurService.getCommandeDetails(commande.id);
            } catch (e) {
                return 0;
            }
        }

        if (!cmdToProcess.produits || cmdToProcess.produits.length === 0) return 0;

        // Fetch full product details to get boutiqueIds
        const productPromises = cmdToProcess.produits.map(p => LivreurService.getProduitById(p.produitId));
        const products = await Promise.all(productPromises);
        const boutiqueIds = [...new Set(products.map(p => p.boutiqueId))];

        if (boutiqueIds.length === 0) return 0;

        const boutiquePromises = boutiqueIds.map(id => LivreurService.getBoutiqueById(id));
        const boutiques = await Promise.all(boutiquePromises);

        const addressPromises = boutiques.map(b => {
            if (b.adresseId) return LivreurService.getAdresseById(b.adresseId);
            return Promise.resolve(null);
        });
        const addresses = await Promise.all(addressPromises);
        const validAddresses = addresses.filter(a => a != null && a.latitude && a.longitude);

        if (validAddresses.length === 0) return 0;

        let totalDistance = 0;
        for (let i = 0; i < validAddresses.length - 1; i++) {
            totalDistance += calculateDistance(
                validAddresses[i].latitude!, validAddresses[i].longitude!,
                validAddresses[i + 1].latitude!, validAddresses[i + 1].longitude!
            );
        }
        const lastBoutiqueAddr = validAddresses[validAddresses.length - 1];
        if (commande.adresse && commande.adresse.latitude && commande.adresse.longitude) {
            totalDistance += calculateDistance(
                lastBoutiqueAddr.latitude!, lastBoutiqueAddr.longitude!,
                commande.adresse.latitude, commande.adresse.longitude
            );
        }

        if (totalDistance <= 3) return 3.0;
        if (totalDistance <= 6) return 3.5;
        if (totalDistance <= 10) return 5.0;
        return 5.0 + (totalDistance - 10) * 0.5;

    } catch (error) {
        console.error("Error calculating revenue:", error);
        return 0;
    }
};

/**
 * Calculates the total revenue for a GrandeCommande (bundle of orders).
 * For MOTO: 5 TND per order.
 * For VOITURE: Uses the existing per-boutique logic across all orders.
 */
export const calculateGrandeCommandeRevenue = async (gc: GrandeCommande, transportMode?: MoyenTransport): Promise<number> => {
    if (!gc.commandes || gc.commandes.length === 0) return 0;

    // For all modes, calculate sum of individual revenues
    // We pass the fact that they are part of a bundle if we had specific logic.
    // For now, let's sum them up which will use the new per-command logic (Moto 4/6, Car 5/7)
    let total = 0;
    for (const cmd of gc.commandes) {
        // We can optimize if gc.commandes already has product info or boutique counts? 
        // Usually GC listing might not have full details. calculateDriverRevenue will fetch if needed.
        total += await calculateDriverRevenue(cmd, transportMode, true);
    }
    return total;
};

/**
 * Calculates revenue for a DemandeLivraison (Personal delivery request).
 * Rates:
 * Moto: Standard 4 TND, Express 6 TND
 * Voiture: Standard 5 TND, Express 7 TND
 */
export const calculateDemandeRevenue = (demande: DemandeLivraison, transportMode?: MoyenTransport): number => {
    // Assuming demande.type Article or similar, but the user mentioned EXPRESS/STANDARD
    const isExpress = demande.type === Type.EXPRESS;

    if (transportMode === MoyenTransport.MOTO) {
        return isExpress ? 6.0 : 4.0;
    } else if (transportMode === MoyenTransport.VOITURE) {
        return isExpress ? 7.0 : 5.0;
    }

    // Fallback
    return isExpress ? 4.0 : 3.0;
};

