import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LivreurService } from '../services/LivreurService';
import { GrandeCommande } from '../Types/types';
import { useAuth } from '../context/AuthContext';
import { useHaptics } from './useHaptics';
import * as Haptics from 'expo-haptics';

export const useGrandeCommande = (enabled: boolean = true) => {
    const { userId } = useAuth();
    const queryClient = useQueryClient();
    const { notification, impact } = useHaptics();

    const grandesCommandesQuery = useQuery({
        queryKey: ['grandes-commandes', userId],
        queryFn: async () => {
            if (!userId) return [];
            const [assigned, available] = await Promise.all([
                LivreurService.getGrandesCommandes(userId),
                LivreurService.getAvailableGrandesCommandes()
            ]);
            
            // Fusionner les listes et éviter les doublons
            const map = new Map<number, GrandeCommande>();
            assigned.forEach((gc: GrandeCommande) => map.set(gc.id, gc));
            available.forEach((gc: GrandeCommande) => map.set(gc.id, gc));
            
            return Array.from(map.values()).sort((a, b) => b.id - a.id);
        },
        enabled: enabled && !!userId,
    });

    const acceptMutation = useMutation({
        mutationFn: (gcId: number) => {
            if (!userId) throw new Error('No userId');
            return LivreurService.acceptGrandeCommande(gcId, userId);
        },
        onSuccess: () => {
            notification(Haptics.NotificationFeedbackType.Success);
            queryClient.invalidateQueries({ queryKey: ['grandes-commandes'] });
            queryClient.invalidateQueries({ queryKey: ['commandes'] });
            queryClient.invalidateQueries({ queryKey: ['livreur', userId] });
        },
        onError: (error) => {
            console.error("Error accepting Grande Commande:", error);
            notification(Haptics.NotificationFeedbackType.Error);
        }
    });

    return {
        grandesCommandes: grandesCommandesQuery.data || [],
        isLoading: grandesCommandesQuery.isLoading,
        refetch: grandesCommandesQuery.refetch,
        accept: acceptMutation.mutateAsync,
        isAccepting: acceptMutation.isPending
    };
};
