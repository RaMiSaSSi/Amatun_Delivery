import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';

import { useAuth } from '../context/AuthContext';
import { LivreurService } from '../services/LivreurService';
import { DemandeLivraisonService, DemandeWebSocketService } from '../services/DemandeLivraisonService';
import { WebSocketService } from '../services/websocket';
import { Statut, Commande } from '../Types/types';
import { StatutDemande } from '../Types/DemandeLivraison';
import { AppState, AppStateStatus } from 'react-native';
import { NotificationService } from '../services/NotificationService';

export default function HomeScreen() {
    const navigation = useNavigation<any>();
    const { logout, userId } = useAuth();
    const [commandesCount, setCommandesCount] = useState(0);
    const [demandesCount, setDemandesCount] = useState(0);
    const [confirmedLast3Days, setConfirmedLast3Days] = useState(0);

    const player = useAudioPlayer(require('../../assets/Notification.mp3'));

    // Pour le son
    const playNotificationSound = async () => {
        try {
            player.play();
        } catch (error) {
            console.log('Erreur son notification', error);
        }
    };

    const fetchData = async () => {
        if (!userId) return;
        try {
            // 1. Charger Commandes (Juste pour le count des CONFIRMED dispo + les miennes)
            // Note: Idéalement il faudrait un endpoint light juste pour le count, ici on récupère tout c'est ptet lourd à terme
            // On prend la date du jour par défaut pour l'indicateur immédiat
            const today = new Date().toISOString().split('T')[0];
            const cmdData = await LivreurService.getCommandesByDay(today, userId);
            // Count logic: Confirmed not assigned OR Assigned to me
            const countCmd = cmdData.filter((c: Commande) =>
                (c.statut === Statut.CONFIRMED && !c.livreurId) || c.livreurId === userId
            ).length;
            setCommandesCount(countCmd);

            // 2. Charger Demandes
            const dmdData = await DemandeLivraisonService.getDemandesAcceptees(userId);
            // Count logic: CONFIRMEE (Dispo)
            const countDmd = dmdData.filter(d => d.statut === StatutDemande.CONFIRMEE).length;
            setDemandesCount(countDmd);

            // 3. Charger le count des CONFIRMED sur les 3 derniers jours (ex: hier, ajd, demain)
            const datesToCheck = [];
            for (let i = -1; i <= 1; i++) {
                const d = new Date();
                d.setDate(d.getDate() + i);
                datesToCheck.push(d.toISOString().split('T')[0]);
            }
            let totalConfirmed = 0;
            await Promise.all(datesToCheck.map(async (date) => {
                try {
                    const c = await LivreurService.countConfirmedCommandesByDate(date);
                    totalConfirmed += c;
                } catch (e) { }
            }));
            setConfirmedLast3Days(totalConfirmed);

        } catch (e) {
            console.error(e);
        }
    };

    // Rafraîchir les données quand on revient sur l'écran
    useFocusEffect(
        React.useCallback(() => {
            fetchData();
        }, [userId])
    );

    // WebSockets pour notifications global
    useEffect(() => {
        if (!userId) return;

        // Écouter le changement d'état de l'app (Arrière-plan -> Premier plan)
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                console.log('App revenue au premier plan, rafraîchissement...');
                fetchData();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // WS Commandes
        const wsCmd = new WebSocketService((msg) => {
            if (msg.type === 'NEW_ORDER' || msg.type === 'ORDER_ACCEPTED') {
                fetchData();
                if (msg.type === 'NEW_ORDER') {
                    playNotificationSound();
                    NotificationService.presentLocalNotification(
                        "📦 Nouvelle Commande !",
                        "Une nouvelle commande est disponible dans votre secteur."
                    );
                    Alert.alert(
                        "📦 Nouvelle Commande !",
                        "Une nouvelle commande est disponible. Consultez l'espace Commandes.",
                        [{ text: "Voir", onPress: () => navigation.navigate('Dashboard') }, { text: "OK" }]
                    );
                }
            }
        }, userId);
        wsCmd.activate();

        // WS Demandes
        const wsDmd = new DemandeWebSocketService(
            (newDmd) => {
                fetchData();
                playNotificationSound();
                NotificationService.presentLocalNotification(
                    "🚲 Nouvelle Demande !",
                    "Une nouvelle demande de livraison spéciale est disponible."
                );
                Alert.alert(
                    "🚲 Nouvelle Demande !",
                    "Une nouvelle demande de livraison spéciale est disponible.",
                    [{ text: "Voir", onPress: () => navigation.navigate('DemandesList') }, { text: "OK" }]
                );
            },
            (acceptedDmd) => {
                fetchData();
            },
            userId
        );
        wsDmd.activate();

        return () => {
            subscription.remove();
            wsCmd.deactivate();
            wsDmd.deactivate();
        };
    }, [userId]);


    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeTitle}>Bonjour,</Text>
                    <Text style={styles.userName}>Partenaire Livreur</Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.profileBtn}>
                        <Ionicons name="person-outline" size={22} color="#059669" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                        <Ionicons name="log-out-outline" size={22} color="#ef4444" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.statusBanner}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Vous êtes en ligne</Text>
            </View>

            <View style={styles.content}>
                <Text style={styles.sectionTitle}>Votre Activité</Text>

                <View style={styles.grid}>
                    {/* COMMANDES */}
                    <TouchableOpacity
                        style={styles.card}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('Dashboard')}
                    >
                        <View style={styles.cardInfo}>
                            <View style={[styles.iconBox, { backgroundColor: '#ecfdf5' }]}>
                                <Ionicons name="cube" size={28} color="#10b981" />
                            </View>
                            <View>
                                <Text style={styles.cardTitleText}>Commandes</Text>
                                <Text style={styles.cardSubtitleText}>Marchandises & Colis</Text>
                                {confirmedLast3Days > 0 && (
                                    <View style={styles.statsBadge}>
                                        <Text style={styles.statsBadgeText}>{confirmedLast3Days} dispos</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                        {commandesCount > 0 && (
                            <View style={[styles.mainBadge, { backgroundColor: '#10b981' }]}>
                                <Text style={styles.mainBadgeText}>{commandesCount}</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* DEMANDES */}
                    <TouchableOpacity
                        style={styles.card}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('DemandesList')}
                    >
                        <View style={styles.cardInfo}>
                            <View style={[styles.iconBox, { backgroundColor: '#eff6ff' }]}>
                                <Ionicons name="bicycle" size={28} color="#3b82f6" />
                            </View>
                            <View>
                                <Text style={styles.cardTitleText}>Demandes</Text>
                                <Text style={styles.cardSubtitleText}>Livraisons Spéciales</Text>
                            </View>
                        </View>
                        {demandesCount > 0 && (
                            <View style={[styles.mainBadge, { backgroundColor: '#3b82f6' }]}>
                                <Text style={styles.mainBadgeText}>{demandesCount}</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* HISTORIQUE */}
                    <TouchableOpacity
                        style={styles.card}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('History')}
                    >
                        <View style={styles.cardInfo}>
                            <View style={[styles.iconBox, { backgroundColor: '#fffbe6' }]}>
                                <Ionicons name="time" size={28} color="#f59e0b" />
                            </View>
                            <View>
                                <Text style={styles.cardTitleText}>Historique</Text>
                                <Text style={styles.cardSubtitleText}>Toutes vos courses</Text>
                            </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                </View>
            </View>


        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 15,
    },
    welcomeTitle: {
        fontSize: 16,
        color: '#64748b',
        fontWeight: '500',
    },
    userName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    headerTitleText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    headerActions: {
        flexDirection: 'row',
        gap: 12,
    },
    profileBtn: {
        width: 45,
        height: 45,
        borderRadius: 15,
        backgroundColor: '#ecfdf5',
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoutBtn: {
        width: 45,
        height: 45,
        borderRadius: 15,
        backgroundColor: '#fff1f2',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        marginHorizontal: 24,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 25,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10b981',
        marginRight: 10,
    },
    statusText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#047857',
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: 20,
    },
    grid: {
        gap: 16,
    },
    card: {
        backgroundColor: '#ffffff',
        padding: 20,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        // Shadows for Android/iOS
        elevation: 3,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    cardInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    iconBox: {
        width: 56,
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
    },
    cardIconImg: {
        width: 32,
        height: 32,
        resizeMode: 'contain'
    },
    cardTitleText: {
        fontSize: 17,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    cardSubtitleText: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 2,
    },
    mainBadge: {
        minWidth: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    mainBadgeText: {
        color: 'white',
        fontSize: 13,
        fontWeight: 'bold',
    },
    statsBadge: {
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        marginTop: 6,
        alignSelf: 'flex-start',
    },
    statsBadgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#64748b',
    },
    footer: {
        padding: 20,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: '#94a3b8',
    },
});
