import { LivreurService } from '../services/LivreurService';
import { Commande, CommandeProduit, Statut, Type } from '../Types/types';
import { MoyenTransport } from '../Types/auth';

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

export const calculateDriverRevenue = async (commande: Commande, transportMode?: MoyenTransport): Promise<number> => {
    try {
        let cmdToProcess = commande;

        // 0. If products are missing, fetch full details
        if (!cmdToProcess.produits || cmdToProcess.produits.length === 0) {
            try {
                cmdToProcess = await LivreurService.getCommandeDetails(commande.id);
            } catch (e) {
                console.warn(`Could not fetch details for cmd ${commande.id}`, e);
                return 0;
            }
        }

        // 1. Get all products to find associated boutiques
        if (!cmdToProcess.produits || cmdToProcess.produits.length === 0) return 0;

        // Fetch full product details to get boutiqueIds
        const productPromises = cmdToProcess.produits.map(p => LivreurService.getProduitById(p.produitId));
        const products = await Promise.all(productPromises);

        const boutiqueIds = [...new Set(products.map(p => p.boutiqueId))];

        // Special Revenue Rule for Returned Orders: 1 TND per boutique
        if (commande.statut === Statut.RETURNED) {
            return boutiqueIds.length * 1.0;
        }

        if (boutiqueIds.length === 0) return 0;

        // --- NEW LOGIC FOR CAR ---
        if (transportMode === MoyenTransport.VOITURE) {
            const pricePerBoutique = commande.type === Type.EXPRESS ? 4.0 : 3.2;
            return boutiqueIds.length * pricePerBoutique;
        }

        // --- DEFAULT LOGIC (MOTO, etc.) ---
        // 2. Fetch all boutiques and their addresses
        const boutiquePromises = boutiqueIds.map(id => LivreurService.getBoutiqueById(id));
        const boutiques = await Promise.all(boutiquePromises);

        const addressPromises = boutiques.map(b => {
            if (b.adresseId) return LivreurService.getAdresseById(b.adresseId);
            return Promise.resolve(null);
        });
        const addresses = await Promise.all(addressPromises);

        // Filter out any null addresses
        const validAddresses = addresses.filter(a => a != null && a.latitude && a.longitude);

        if (validAddresses.length === 0) return 0;

        // 3. Calculate Distance
        let totalDistance = 0;

        // Distance between boutiques
        for (let i = 0; i < validAddresses.length - 1; i++) {
            totalDistance += calculateDistance(
                validAddresses[i].latitude!, validAddresses[i].longitude!,
                validAddresses[i + 1].latitude!, validAddresses[i + 1].longitude!
            );
        }

        // Distance from last boutique to client
        const lastBoutiqueAddr = validAddresses[validAddresses.length - 1];
        if (commande.adresse && commande.adresse.latitude && commande.adresse.longitude) {
            totalDistance += calculateDistance(
                lastBoutiqueAddr.latitude!, lastBoutiqueAddr.longitude!,
                commande.adresse.latitude, commande.adresse.longitude
            );
        }

        // 4. Calculate Revenue (default 0.8 TND / km)
        return totalDistance * 0.8;

    } catch (error) {
        console.error("Error calculating revenue:", error);
        return 0;
    }
};
