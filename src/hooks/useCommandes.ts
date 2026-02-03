import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LivreurService } from '../services/LivreurService';
import { useAuth } from '../context/AuthContext';
import { Commande, Statut } from '../Types/types';
import { useHaptics } from './useHaptics';
import * as Haptics from 'expo-haptics';

export const useCommandes = (selectedDate: string) => {
    const { userId } = useAuth();
    const queryClient = useQueryClient();
    const { notification } = useHaptics();

    const commandesQuery = useQuery({
        queryKey: ['commandes', userId, selectedDate],
        queryFn: () => (userId ? LivreurService.getCommandesByDay(selectedDate, userId) : []),
        enabled: !!userId && !!selectedDate,
    });

    const acceptMutation = useMutation({
        mutationFn: (cmdId: number) => {
            if (!userId) throw new Error('No userId');
            return LivreurService.acceptCommande(cmdId, userId);
        },
        onSuccess: () => {
            notification(Haptics.NotificationFeedbackType.Success);
            queryClient.invalidateQueries({ queryKey: ['commandes'] });
            queryClient.invalidateQueries({ queryKey: ['livreur', userId] });
        },
        onError: () => {
            notification(Haptics.NotificationFeedbackType.Error);
        }
    });

    const updateStatutMutation = useMutation({
        mutationFn: ({ cmdId, statut }: { cmdId: number, statut: string }) => {
            return LivreurService.updateStatut(cmdId, statut);
        },
        onSuccess: (_, variables) => {
            notification(Haptics.NotificationFeedbackType.Success);
            queryClient.invalidateQueries({ queryKey: ['commandes'] });
            if (variables.statut === Statut.DELIVERED) {
                queryClient.invalidateQueries({ queryKey: ['livreur', userId] });
            }
        },
        onError: () => {
            notification(Haptics.NotificationFeedbackType.Error);
        }
    });

    return {
        commandes: commandesQuery.data || [],
        isLoading: commandesQuery.isLoading,
        isRefetching: commandesQuery.isRefetching,
        refetch: commandesQuery.refetch,
        accept: acceptMutation.mutateAsync,
        updateStatut: updateStatutMutation.mutateAsync,
        isAccepting: acceptMutation.isPending,
        isUpdatingStatus: updateStatutMutation.isPending
    };
};
