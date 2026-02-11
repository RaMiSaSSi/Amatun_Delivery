import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DemandeLivraisonService } from '../services/DemandeLivraisonService';
import { useAuth } from '../context/AuthContext';
import { DemandeLivraison, StatutDemande } from '../Types/DemandeLivraison';
import { useHaptics } from './useHaptics';
import * as Haptics from 'expo-haptics';

export const useDemandes = () => {
    const { userId } = useAuth();
    const queryClient = useQueryClient();
    const { notification } = useHaptics();

    const demandesQuery = useQuery({
        queryKey: ['demandes', userId],
        queryFn: () => (userId ? DemandeLivraisonService.getDemandesAcceptees(userId) : []),
        enabled: !!userId,
    });

    const acceptMutation = useMutation({
        mutationFn: (demandeId: number) => {
            if (!userId) throw new Error('No userId');
            return DemandeLivraisonService.accepterDemande(demandeId, userId);
        },
        onSuccess: () => {
            notification(Haptics.NotificationFeedbackType.Success);
            queryClient.invalidateQueries({ queryKey: ['demandes'] });
            queryClient.invalidateQueries({ queryKey: ['livreur', userId] });
        },
        onError: () => {
            notification(Haptics.NotificationFeedbackType.Error);
        }
    });

    const updateStatutMutation = useMutation({
        mutationFn: ({ demandeId, statut }: { demandeId: number, statut: StatutDemande }) => {
            return DemandeLivraisonService.updateStatut(demandeId, statut);
        },
        onSuccess: (_, variables) => {
            notification(Haptics.NotificationFeedbackType.Success);
            queryClient.invalidateQueries({ queryKey: ['demandes'] });
            if (variables.statut === StatutDemande.LIVREE) {
                queryClient.invalidateQueries({ queryKey: ['livreur', userId] });
            }
        },
        onError: () => {
            notification(Haptics.NotificationFeedbackType.Error);
        }
    });

    return {
        demandes: demandesQuery.data || [],
        isLoading: demandesQuery.isLoading,
        isRefetching: demandesQuery.isRefetching,
        refetch: demandesQuery.refetch,
        accept: acceptMutation.mutateAsync,
        updateStatut: updateStatutMutation.mutateAsync,
        isAccepting: acceptMutation.isPending,
        isUpdatingStatus: updateStatutMutation.isPending
    };
};
