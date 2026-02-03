import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LivreurService } from '../services/LivreurService';
import { useAuth } from '../context/AuthContext';
import { Commande } from '../Types/types';

export const useLivreur = () => {
    const { userId } = useAuth();
    const queryClient = useQueryClient();

    const profileQuery = useQuery({
        queryKey: ['livreur', userId],
        queryFn: () => (userId ? LivreurService.getLivreurInfos(userId) : null),
        enabled: !!userId,
    });

    const getDeliveryFee = (cmd: Commande) => {
        return (cmd.prixTotalAvecLivraison || 0) - (cmd.prixTotalSansLivraison || 0);
    };

    const isBlockedForCmd = (cmd: Commande | null) => {
        if (!cmd || !profileQuery.data) return false;
        const fee = getDeliveryFee(cmd);
        const balance = profileQuery.data.cashbalance || 0;
        const limit = (profileQuery.data.plafond || 0) + 10;
        return balance + fee >= limit;
    };

    const isBlockedByTotal = () => {
        if (!profileQuery.data) return false;
        return (profileQuery.data.cashbalance || 0) >= (profileQuery.data.plafond || 0) + 10;
    };

    const refreshProfile = () => {
        queryClient.invalidateQueries({ queryKey: ['livreur', userId] });
    };

    return {
        profile: profileQuery.data,
        isLoading: profileQuery.isLoading,
        isBlockedByTotal: isBlockedByTotal(),
        isBlockedForCmd,
        getDeliveryFee,
        refreshProfile
    };
};
