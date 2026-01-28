import { Statut, Type, Paiement } from "../Types/types";
import { StatutDemande } from "../Types/DemandeLivraison";

export const translateStatut = (statut: Statut | string): string => {
    switch (statut) {
        case Statut.PENDING: return "En attente";
        case Statut.ACCEPTED: return "Acceptée";
        case Statut.CONFIRMED: return "Confirmée";
        case Statut.SHIPPED: return "En livraison";
        case Statut.DELIVERED: return "Livrée";
        case Statut.RETURNED: return "Retournée";
        case Statut.CANCELLED: return "Annulée";
        default: return statut.toString();
    }
};

export const translateStatutDemande = (statut: StatutDemande | string): string => {
    switch (statut) {
        case StatutDemande.EN_ATTENTE: return "En attente";
        case StatutDemande.CONFIRMEE: return "Confirmée";
        case StatutDemande.ANNULEE: return "Annulée";
        case StatutDemande.ACCEPTEE: return "Acceptée";
        case StatutDemande.EN_COURS: return "En cours";
        case StatutDemande.LIVREE: return "Livrée";
        case StatutDemande.RETOUR: return "Retournée";
        default: return statut.toString();
    }
};

export const translateType = (type: Type | string): string => {
    switch (type) {
        case Type.EXPRESS: return "Express";
        case Type.STANDARD: return "Standard";
        default: return type.toString();
    }
};

export const translatePaiement = (paiement: Paiement | string): string => {
    switch (paiement) {
        case Paiement.CASH: return "Espèces";
        case Paiement.POINTS: return "Points";
        default: return typeof paiement === 'string' ? paiement : "Inconnu";
    }
};
