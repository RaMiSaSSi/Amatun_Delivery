import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GrandeCommandeService } from '../services/GrandeCommandeService';
import { useAuth } from '../context/AuthContext';
import { useHaptics } from './useHaptics';
import * as Haptics from 'expo-haptics';

export const useGrandeCommande = () => {
    const { userId } = useAuth();
    const queryClient = useQueryClient();
    const { notification, impact } = useHaptics();

    const grandesCommandesQuery = useQuery({
        queryKey: ['grandes-commandes', userId],
        queryFn: () => (userId ? GrandeCommandeService.getGrandesCommandes(userId) : []),
        enabled: !!userId,
    });

    const acceptMutation = useMutation({
        mutationFn: (gcId: number) => {
            if (!userId) throw new Error('No userId');
            return GrandeCommandeService.accepterGrandeCommande(gcId, userId);
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
