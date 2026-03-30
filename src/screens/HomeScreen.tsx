import React, { useEffect, useState, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, Image, ActivityIndicator, ScrollView, Dimensions, ImageBackground
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Package,Motorbike, Rocket, History, Bell, BellOff, ChevronRight, Navigation2, LogOut, User,
    MapPin, Home as HomeIcon, ClipboardList
} from 'lucide-react-native';
import { useAudioPlayer } from 'expo-audio';

import { useAuth } from '../context/AuthContext';
import { LivreurService } from '../services/LivreurService';
import { DemandeLivraisonService, DemandeWebSocketService } from '../services/DemandeLivraisonService';
import { WebSocketService } from '../services/websocket';
import { Statut, Commande } from '../Types/types';
import { StatutDemande } from '../Types/DemandeLivraison';
import { AppState, AppStateStatus } from 'react-native';
import { NotificationService } from '../services/NotificationService';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
    const navigation = useNavigation<any>();
    const { logout, userId } = useAuth();
    
    const [commandesCount, setCommandesCount] = useState(0);
    const [demandesCount, setDemandesCount] = useState(0);
    const [confirmedLast3Days, setConfirmedLast3Days] = useState(0);
    
    // Dynamically computed data
    const [dailyEarnings, setDailyEarnings] = useState(0);
    const [dailyDeliveriesCount, setDailyDeliveriesCount] = useState(0);
    const [currentTrip, setCurrentTrip] = useState<any>(null);

    const [isOnline, setIsOnline] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState(false);
    const [livreurInfo, setLivreurInfo] = useState<any>(null);
    const [ongoingDeliveries, setOngoingDeliveries] = useState<any[]>([]);

    const player = useAudioPlayer(require('../../assets/Notification.mp3'));
    const isOnlineRef = useRef(isOnline);

    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    const playNotificationSound = async () => {
        try { player.play(); } catch (error) { console.log('Erreur son', error); }
    };

    const fetchData = async () => {
        if (!userId) return;
        try {
            const today = new Date().toISOString().split('T')[0];
            const cmdData = await LivreurService.getCommandesByDay(today, userId).catch(() => []);
            
            // Sequential loop to protect backend connection pool limits
            const fetchDates = [-3, -2, -1, 0, 1].map(i => {
                const d = new Date();
                d.setDate(d.getDate() + i);
                return d.toISOString().split('T')[0];
            });
            
            let allCmdsList: Commande[] = [];
            for (const date of fetchDates) {
                try {
                    const cmds = await LivreurService.getCommandesByDay(date, userId);
                    if (Array.isArray(cmds)) {
                        allCmdsList.push(...cmds);
                    }
                } catch (e) { console.error("Error fetching date", date, e); }
            }
            const allCmds = Array.from(new Map(allCmdsList.map((item: any) => [item.id, item])).values()) as Commande[];

            const countCmd = allCmds.filter((c: Commande) =>
                (c.statut === Statut.CONFIRMED && !c.livreurId) || (c.livreurId === userId && (c.statut === Statut.ACCEPTED || c.statut === Statut.CONFIRMED || c.statut === Statut.SHIPPED))
            ).length;
            setCommandesCount(countCmd);

            // Compute Earnings (only for today's deliveries)
            const todaysDeliveries = (Array.isArray(cmdData) ? cmdData : []).filter((c: Commande) => c.livreurId === userId && c.statut === Statut.DELIVERED);
            const totalEarnings = todaysDeliveries.reduce((sum: number, c: Commande) => {
                const deliveryPrc = c.prixTotalAvecLivraison && c.prixTotalSansLivraison ? (c.prixTotalAvecLivraison - c.prixTotalSansLivraison) : 0;
                return sum + deliveryPrc;
            }, 0);
            setDailyEarnings(totalEarnings);
            setDailyDeliveriesCount(todaysDeliveries.length);

            // Fetch Demandes sequentially
            let dmdData: any[] = [];
            try {
                const dmd1 = await DemandeLivraisonService.getDemandesAcceptees(userId).catch(() => []);
                const dmd2 = await DemandeLivraisonService.getMesLivraisons(userId).catch(() => []);
                const combinedDmd = [...dmd1, ...dmd2];
                dmdData = Array.from(new Map(combinedDmd.map((item: any) => [item.id, item])).values());
            } catch(e) {}
            
            const countDmd = dmdData.filter((d: any) => (d.statut === StatutDemande.CONFIRMEE && !d.livreurId) || (d.livreurId === userId && (d.statut === StatutDemande.ACCEPTEE || d.statut === StatutDemande.EN_COURS))).length;
            setDemandesCount(countDmd);

            let groupesData: any[] = [];
            try {
                const { GrandeCommandeService } = require('../services/GrandeCommandeService');
                groupesData = await GrandeCommandeService.getGrandesCommandes(userId);
            } catch(e) {}

            // Fetch ongoing deliveries from dedicated API
            const ongoing = await LivreurService.getCurrentOrders(userId).catch(() => []);
            setOngoingDeliveries(Array.isArray(ongoing) ? ongoing : []);

            // Fetch Current Trip
            const activeCommandes = allCmds.filter((c: Commande) => c.livreurId === userId && (c.statut === Statut.SHIPPED || c.statut === Statut.ACCEPTED));
            const activeDemandes = dmdData.filter((d: any) => d.livreurId === userId && (d.statut === StatutDemande.EN_COURS || d.statut === StatutDemande.ACCEPTEE));
            const activeGroupes = groupesData.filter((g: any) => g.livreurId === userId && (g.statut === 'SHIPPED' || g.statut === 'ACCEPTED' || g.statut === 'EN_COURS' || g.statut === Statut.ACCEPTED || g.statut === Statut.SHIPPED));

            if (activeCommandes.length > 0) {
                const cmd = activeCommandes[0];
                setCurrentTrip({
                    type: 'COMMANDE',
                    destination: `${cmd.adresse?.rue || ''}, ${cmd.adresse?.gouvernerat || 'Ville'}`,
                    eta: 'Trajet',
                    data: cmd
                });
            } else if (activeGroupes.length > 0) {
                const grp = activeGroupes[0];
                setCurrentTrip({
                    type: 'GRANDE_COMMANDE',
                    destination: `Groupe #${grp.id} - ${grp.commandes?.length || 0} commandes`,
                    eta: 'Trajet Groupé',
                    data: grp
                });
            } else if (activeDemandes.length > 0) {
                const dmd = activeDemandes[0];
                setCurrentTrip({
                    type: 'DEMANDE',
                    destination: `${dmd.adresseCourteDestinataire || ''}, ${dmd.villeDestinataire || ''}`,
                    eta: 'Trajet',
                    data: dmd
                });
            } else if (Array.isArray(ongoing) && ongoing.length > 0) {
                // Fallback: use first ongoing delivery from getCurrentOrders API
                const first = ongoing[0];
                setCurrentTrip({
                    type: 'COMMANDE',
                    destination: `${first.adresse?.rue || ''}, ${first.adresse?.gouvernerat || 'En cours'}`,
                    eta: 'Trajet',
                    data: first
                });
            } else {
                setCurrentTrip(null);
            }

            const datesToCheck = [-1, 0, 1].map(i => {
                const d = new Date();
                d.setDate(d.getDate() + i);
                return d.toISOString().split('T')[0];
            });
            let totalConfirmed = 0;
            // Execute sequentially to protect local connection pool
            for (const date of datesToCheck) {
                try {
                    const c = await LivreurService.countConfirmedCommandesByDate(date);
                    totalConfirmed += c;
                } catch (e) { }
            }
            setConfirmedLast3Days(totalConfirmed);

            const info = await LivreurService.getLivreurInfos(userId);
            setLivreurInfo(info);
            setIsOnline(info.online);
        } catch (e) { console.error(e); }
    };

    useFocusEffect(
        React.useCallback(() => {
            fetchData();
        }, [userId])
    );

    useEffect(() => {
        if (!userId) return;
        const subscription = AppState.addEventListener('change', (next) => {
            if (next === 'active') fetchData();
        });

        const wsCmd = new WebSocketService((msg) => {
            if (msg.type === 'NEW_ORDER' || msg.type === 'ORDER_ACCEPTED') {
                fetchData();
                if (msg.type === 'NEW_ORDER' && isOnlineRef.current) {
                    playNotificationSound();
                    NotificationService.presentLocalNotification("📦 Nouvelle Commande !", "Une nouvelle commande est disponible.");
                    Alert.alert("📦 Nouvelle Commande !", "Disponible dans votre secteur.", [{ text: "Voir", onPress: () => navigation.navigate('Dashboard') }, { text: "OK" }]);
                }
            }
        }, userId);
        wsCmd.activate();

        const wsDmd = new DemandeWebSocketService(
            (newDmd) => {
                fetchData();
                if (isOnlineRef.current) {
                    playNotificationSound();
                    NotificationService.presentLocalNotification("🚲 Nouvelle Demande !", "Demande spéciale disponible.");
                    Alert.alert("🚲 Nouvelle Demande !", "Demande spéciale disponible.", [{ text: "Voir", onPress: () => navigation.navigate('DemandesList') }, { text: "OK" }]);
                }
            },
            () => fetchData(),
            userId
        );
        wsDmd.activate();

        return () => {
            subscription.remove();
            wsCmd.deactivate();
            wsDmd.deactivate();
        };
    }, [userId]);

    const handleToggleStatus = async (value: boolean) => {
        if (!userId) return;
        setLoadingStatus(true);
        try {
            const updated = await LivreurService.updateStatus(userId, value);
            setIsOnline(updated.online);
        } catch (error) {
            setIsOnline(!value);
            Alert.alert("Erreur", "Impossible de changer l'état.");
        } finally {
            setLoadingStatus(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

            {/* 1. HEADER - Pinned at Top */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.userInfo}>
                    <View style={styles.avatarContainer}>
                        <Image
                            source={require('../../assets/logo.png')}
                            style={styles.avatar}
                        />
                    </View>
                    <View style={styles.welcomeTextContainer}>
                        <Text style={styles.greetingText}>Bonjour,</Text>
                        <Text style={styles.userNameText}>{livreurInfo?.prenom || livreurInfo?.nom || 'Partenaire Livreur'}</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.headerRight}>
                    <View style={[styles.onlineBadge, !isOnline && styles.offlineBadge]}>
                        <View style={[styles.statusDot, !isOnline && styles.offlineDot]} />
                        <Text style={[styles.onlineText, !isOnline && styles.offlineText]}>
                            {isOnline ? 'En ligne' : 'Hors ligne'}
                        </Text>
                    </View>
                    <TouchableOpacity 
                        style={styles.iconBtn}
                        onPress={() => handleToggleStatus(!isOnline)}
                        disabled={loadingStatus}
                    >
                        {loadingStatus ? (
                            <ActivityIndicator size="small" color="#059669" />
                        ) : isOnline ? (
                            <Bell size={22} color="#1e293b" />
                        ) : (
                            <BellOff size={22} color="#f97316" />
                        )}
                        {isOnline && <View style={styles.notificationDot} />}
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* 2. EARNINGS CARD */}
                <LinearGradient
                    colors={['#059669', '#065f46']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.earningsCard}
                >
                    <View style={styles.earningsInfo}>
                        <Text style={styles.earningsAmount}>{dailyEarnings.toFixed(2)} TND</Text>
                        <Text style={styles.earningsSubtitle}>Gains aujourd'hui • {dailyDeliveriesCount} livraisons</Text>
                    </View>
                </LinearGradient>

                {/* 3. ACTIVITY SECTION */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Votre Activité</Text>
                  
                </View>

                <View style={styles.activityGrid}>
                    <TouchableOpacity
                        style={styles.activityCard}
                        onPress={() => navigation.navigate('Dashboard')}
                    >
                        <View style={styles.cardHeader}>
                            <View style={[styles.cardIconBox, { backgroundColor: '#d1fae5' }]}>
                                <Package size={24} color="#059669" />
                            </View>
                            {commandesCount > 0 && (
                                <View style={styles.activeBadge}>
                                    <Text style={styles.activeBadgeText}>{commandesCount} ACTIVES</Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.cardTitle}>Commandes</Text>
                        <Text style={styles.cardDesc}>Marchandises & Colis en attente de livraison.</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.activityCard}
                        onPress={() => navigation.navigate('DemandesList')}
                    >
                        <View style={styles.cardHeader}>
                            <View style={[styles.cardIconBox, { backgroundColor: '#e2f3feff' }]}>
                                <Motorbike size={24} color="blue" />
                            </View>
                            {demandesCount > 0 && (
                                <View style={[styles.activeBadge, { backgroundColor: 'blue' }]}>
                                    <Text style={[styles.activeBadgeText, { color: 'white' }]}>NOUVEAU</Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.cardTitle}>Demandes</Text>
                        <Text style={styles.cardDesc}>Livraisons spéciales et courses express.</Text>
                    </TouchableOpacity>
                </View>

                {/* ONGOING DELIVERIES LIST (New) */}
                {ongoingDeliveries && ongoingDeliveries.length > 0 && (
                    <View style={{ marginBottom: 20 }}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>VOS COURSES ACCEPTÉES</Text>
                        </View>
                        {ongoingDeliveries.map((item: any, index: number) => (
                            <View key={index} style={styles.ongoingItemCard}>
                                <View style={styles.ongoingItemHeader}>
                                    <View style={[styles.cardIconBox, { backgroundColor: '#e0f2fe' }]}>
                                        <ClipboardList size={22} color="#0369a1" />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={styles.ongoingItemTitle}>Commande #{item.id}</Text>
                                        <Text style={styles.ongoingItemSubtitle} numberOfLines={1}>
                                            {item.adresse?.rue || item.adresse?.gouvernerat || 'En cours...'}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.viewDetailBtn}
                                        onPress={() => navigation.navigate('CommandeDetails', { commandeId: item.id })}
                                    >
                                        <Text style={styles.viewDetailText}>Voir Détails</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* HISTORIQUE CARD */}
                <TouchableOpacity
                    style={styles.historyCard}
                    onPress={() => navigation.navigate('History')}
                >
                    <View style={styles.historyLeft}>
                        <View style={styles.historyIconBox}>
                            <History size={20} color="#64748b" />
                        </View>
                        <View style={styles.historyTextContent}>
                            <Text style={styles.historyTitle}>Historique</Text>
                            <Text style={styles.historySubtitle}>Consultez vos trajets terminés et avis.</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color="#cbd5e1" />
                </TouchableOpacity>

                {/* 4. TRAJET EN COURS */}
                {currentTrip ? (
                    <View>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>TRAJET EN COURS</Text>
                        </View>

                        <View style={styles.tripCard}>
                            <View style={styles.tripStatusIndicator} />
                            <View style={styles.tripHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.tripLabel}>DESTINATION</Text>
                                    <Text style={styles.tripValue} numberOfLines={1}>{currentTrip.destination}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                                    <Text style={styles.tripLabel}>STATUT</Text>
                                    <Text style={styles.tripValue}>{currentTrip.eta}</Text>
                                </View>
                            </View>

                            <ImageBackground
                                source={require('../../assets/logo.png')} 
                                style={styles.mapSnippet}
                                imageStyle={{ opacity: 0.1, resizeMode: 'cover' }}
                            >
                                <View style={styles.mapOverlay}>
                                    <MapPin size={30} color="#059669" />
                                </View>
                            </ImageBackground>

                            <TouchableOpacity 
                                style={styles.gpsBtn}
                                onPress={() => {
                                    if (currentTrip.type === 'COMMANDE') {
                                        navigation.navigate('CommandeDetails', { commandeId: currentTrip.data.id });
                                    } else if (currentTrip.type === 'GRANDE_COMMANDE') {
                                        navigation.navigate('GrandeCommandeDetail', { grandeCommandeId: currentTrip.data.id, initialData: currentTrip.data });
                                    } else {
                                        navigation.navigate('DemandeDetail', { demandeId: currentTrip.data.id });
                                    }
                                }}
                            >
                                <Text style={styles.gpsBtnText}>Ouvrir les Détails</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : ongoingDeliveries.length === 0 ? (
                    <View>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>AUCUN TRAJET</Text>
                        </View>
                        <View style={styles.tripCardEmpty}>
                            <Navigation2 size={40} color="#cbd5e1" style={{ marginBottom: 15 }} />
                            <Text style={styles.emptyTripText}>Vous n'avez aucune livraison en cours.</Text>
                            <Text style={styles.emptyTripSubText}>Restez en ligne pour recevoir des demandes.</Text>
                        </View>
                    </View>
                ) : null}

                <View style={{ height: 110 }} />
            </ScrollView>

            {/* 5. BOTTOM NAVIGATION BAR */}
            <View style={styles.bottomNav}>
              

                

                <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Profile')}>
                    <User size={22} color="#94a3b8" />
                    <Text style={styles.navText}>Profile</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.navItem} onPress={logout}>
                    <LogOut size={22} color="#ef4444" />
                    <Text style={[styles.navText, { color: '#ef4444' }]}>Logout</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 15,
        backgroundColor: '#f8fafc',
        zIndex: 10, // Ensure it stays on top outside the scroll view
        elevation: 2, // Slight shadow on Android for the sticky header
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#e2e8f0',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderWidth: 2,
        borderColor: 'white',
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        resizeMode: 'contain'
    },
    welcomeTextContainer: {},
    greetingText: {
        fontSize: 14,
        color: '#64748b',
        fontWeight: '500',
    },
    userNameText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    onlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ecfdf5',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#d1fae5',
    },
    offlineBadge: {
        backgroundColor: '#fff7ed',
        borderColor: '#ffedd5',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
        backgroundColor: '#10b981',
    },
    offlineDot: {
        backgroundColor: '#f97316',
    },
    onlineText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#047857',
    },
    offlineText: {
        color: '#c2410c',
    },
    iconBtn: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
    },
    notificationDot: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
        borderWidth: 1.5,
        borderColor: 'white',
    },
    earningsCard: {
        borderRadius: 28,
        padding: 24,
        marginBottom: 25,
        elevation: 10,
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
    },
    earningsInfo: {
        marginBottom: 20,
    },
    earningsAmount: {
        fontSize: 36,
        fontWeight: 'bold',
        color: 'white',
    },
    earningsSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
        marginTop: 4,
    },
    earningsActions: {
        flexDirection: 'row',
        gap: 12,
    },
    retirerBtn: {
        backgroundColor: 'white',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 14,
    },
    retirerText: {
        color: '#059669',
        fontWeight: 'bold',
        fontSize: 15,
    },
    detailsBtn: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    detailsText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 15,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
        marginTop: 5,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1e293b',
        letterSpacing: 0.5,
    },
    toutVoirText: {
        fontSize: 14,
        color: '#059669',
        fontWeight: '600',
    },
    activityGrid: {
        flexDirection: 'row',
        gap: 15,
        marginBottom: 15,
    },
    activityCard: {
        flex: 1,
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 16,
        elevation: 4,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    cardIconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    activeBadge: {
        backgroundColor: '#d1fae5',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    activeBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#059669',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 6,
    },
    cardDesc: {
        fontSize: 12,
        color: '#64748b',
        lineHeight: 16,
    },
    historyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 16,
        marginBottom: 25,
        elevation: 2,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
    },
    historyLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    historyIconBox: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    historyTextContent: {},
    historyTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1e293b',
    },
    historySubtitle: {
        fontSize: 12,
        color: '#94a3b8',
    },
    ongoingItemCard: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    ongoingItemHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    ongoingItemTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    ongoingItemSubtitle: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 2,
    },
    viewDetailBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#f1f5f9',
    },
    viewDetailText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#059669',
    },
    tripCard: {
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 20,
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    tripCardEmpty: {
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 35,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#f1f5f9',
        borderStyle: 'dashed',
    },
    emptyTripText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#64748b',
        marginBottom: 5,
        textAlign: 'center'
    },
    emptyTripSubText: {
        fontSize: 13,
        color: '#94a3b8',
        textAlign: 'center'
    },
    tripStatusIndicator: {
        position: 'absolute',
        top: 20,
        left: 0,
        width: 4,
        height: 40,
        backgroundColor: '#059669',
        borderTopRightRadius: 4,
        borderBottomRightRadius: 4,
    },
    tripHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 15,
    },
    tripLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#94a3b8',
        marginBottom: 4,
    },
    tripValue: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1e293b',
    },
    mapSnippet: {
        height: 120,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#f8fafc',
        marginBottom: 15,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mapOverlay: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    gpsBtn: {
        backgroundColor: '#f1f5f9',
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
    },
    gpsBtnText: {
        color: '#059669',
        fontWeight: 'bold',
        fontSize: 16,
    },
    bottomNav: {
        position: 'absolute',
        bottom: 25,
        left: 20,
        right: 20,
        height: 70,
        backgroundColor: 'white',
        borderRadius: 25,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        elevation: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        paddingHorizontal: 10,
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    navIconActive: {
        padding: 10,
        borderRadius: 15,
    },
    navText: {
        fontSize: 10,
        fontWeight: 'bold',
        marginTop: 4,
        color: '#94a3b8',
    },
});