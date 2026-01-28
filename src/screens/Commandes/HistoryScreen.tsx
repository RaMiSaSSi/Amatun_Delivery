import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, SafeAreaView, StatusBar, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LivreurService } from '../../services/LivreurService';
import { DemandeLivraisonService } from '../../services/DemandeLivraisonService';
import { Commande, Statut } from '../../Types/types';
import { DemandeLivraison, StatutDemande } from '../../Types/DemandeLivraison';

import { useAuth } from '../../context/AuthContext';

type HistoryItem = {
    id: number;
    type: 'COMMANDE' | 'DEMANDE';
    date: string | Date;
    statut: string;
    clientNom: string;
    adresse: string;
    prix?: number;
    original: Commande | DemandeLivraison;
};

export default function HistoryScreen() {
    const navigation = useNavigation<any>();
    const { userId } = useAuth();
    const [items, setItems] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [range, setRange] = useState<'TODAY' | 'WEEK' | 'ALL'>('TODAY');

    const fetchHistory = async () => {
        if (!userId) return;
        setLoading(true);
        try {
            let startDate: string | undefined;
            let endDate: string | undefined;

            const now = new Date();

            if (range === 'TODAY') {
                startDate = now.toISOString().split('T')[0];
                endDate = startDate;
            } else if (range === 'WEEK') {
                const lastWeek = new Date();
                lastWeek.setDate(now.getDate() - 7);
                startDate = lastWeek.toISOString().split('T')[0];
                endDate = now.toISOString().split('T')[0];
            }

            // Fetch Commandes
            const cmdData: Commande[] = await LivreurService.getHistorique(userId, startDate, endDate);

            // Fetch Demandes
            const dmdData: DemandeLivraison[] = await DemandeLivraisonService.getMesLivraisons(userId);

            // Normalize and Combine
            const normalizedCmds: HistoryItem[] = (cmdData || []).map(c => ({
                id: c.id,
                type: 'COMMANDE',
                date: c.date,
                statut: c.statut,
                clientNom: `${c.nom} ${c.prenom}`,
                adresse: `${c.adresse?.rue}, ${c.adresse?.delegation}`,
                prix: c.prixTotalAvecLivraison,
                original: c
            }));

            const normalizedDmds: HistoryItem[] = (dmdData || [])
                .filter(d => {
                    if (range === 'ALL') return true;
                    const dDate = new Date(d.createdAt).toISOString().split('T')[0];
                    if (range === 'TODAY') return dDate === startDate;
                    if (startDate && endDate) {
                        return dDate >= startDate && dDate <= endDate;
                    }
                    return true;
                })
                .map(d => ({
                    id: d.id,
                    type: 'DEMANDE',
                    date: d.createdAt,
                    statut: d.statut,
                    clientNom: `${d.nomDestinataire} ${d.prenomDestinataire}`,
                    adresse: `${d.adresseCourteDestinataire}, ${d.villeDestinataire}`,
                    prix: 0, // Les demandes spéciales peuvent avoir un prix différent ou géré ailleurs
                    original: d
                }));

            const combined = [...normalizedCmds, ...normalizedDmds].sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );

            setItems(combined);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [range, userId]);

    const renderItem = ({ item }: { item: HistoryItem }) => {
        let badgeStyle = styles.badgeDefault;
        let textStyle = styles.badgeTextDefault;

        const isDelivered = item.statut === Statut.DELIVERED || item.statut === StatutDemande.LIVREE;
        const isReturned = item.statut === Statut.RETURNED || item.statut === StatutDemande.RETOUR;
        const isShipped = item.statut === Statut.SHIPPED || item.statut === StatutDemande.EN_COURS;

        if (isDelivered) { badgeStyle = styles.badgeEmerald; textStyle = { color: '#065f46' } }
        else if (isReturned) { badgeStyle = styles.badgeRed; textStyle = { color: '#991b1b' } }
        else if (isShipped) { badgeStyle = styles.badgeOrange; textStyle = { color: '#9a3412' } }

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => {
                    if (item.type === 'COMMANDE') {
                        navigation.navigate('CommandeDetails', { commandeId: item.id });
                    } else {
                        navigation.navigate('DemandeDetail', { demandeId: item.id });
                    }
                }}
            >
                <View style={styles.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={[styles.iconContainer, { backgroundColor: item.type === 'COMMANDE' ? '#d1fae5' : '#dbeafe' }]}>
                            <Image source={require('../../../assets/Delivery.png')} style={styles.historyIconImg} />
                        </View>
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={styles.orderId}>{item.type === 'COMMANDE' ? 'Cmd' : 'Dmd'} #{item.id}</Text>
                            </View>
                            <Text style={styles.dateText}>{new Date(item.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                        </View>
                    </View>
                    <View style={[styles.badge, badgeStyle]}>
                        <Text style={[styles.badgeText, textStyle]}>{item.statut}</Text>
                    </View>
                </View>

                <View style={styles.cardBody}>
                    <Text style={styles.clientName}>{item.clientNom}</Text>
                    <Text style={styles.address} numberOfLines={1}>{item.adresse}</Text>
                    <View style={styles.priceRow}>
                        <Text style={styles.price}>{item.prix && item.prix > 0 ? `${item.prix} TND` : '---'}</Text>
                        <Text style={styles.typeLabel}>{item.type === 'COMMANDE' ? 'E-commerce' : 'Livraison Directe'}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnWrapper}>
                    <Ionicons name="chevron-back" size={24} color="#1e293b" />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>Historique</Text>
                    <Text style={styles.headerSubtitle}>Mes courses & livraisons</Text>
                </View>
            </View>

            {/* Premium Filter Segment */}
            <View style={styles.filterWrapper}>
                <View style={styles.segmentControl}>
                    <TouchableOpacity
                        onPress={() => setRange('TODAY')}
                        style={[styles.segmentBtn, range === 'TODAY' && styles.segmentBtnActive]}
                    >
                        <Text style={[styles.segmentText, range === 'TODAY' && styles.segmentTextActive]}>Aujourd'hui</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setRange('WEEK')}
                        style={[styles.segmentBtn, range === 'WEEK' && styles.segmentBtnActive]}
                    >
                        <Text style={[styles.segmentText, range === 'WEEK' && styles.segmentTextActive]}>7 Jours</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setRange('ALL')}
                        style={[styles.segmentBtn, range === 'ALL' && styles.segmentBtnActive]}
                    >
                        <Text style={[styles.segmentText, range === 'ALL' && styles.segmentTextActive]}>Toutes</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#2563eb" />
                </View>
            ) : (
                <FlatList
                    data={items}
                    renderItem={renderItem}
                    keyExtractor={(item) => `${item.type}-${item.id}`}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="receipt-outline" size={60} color="#e2e8f0" />
                            <Text style={styles.emptyText}>Aucune activité enregistrée.</Text>
                        </View>
                    }
                    refreshControl={
                        <RefreshControl refreshing={loading} onRefresh={fetchHistory} colors={['#2563eb']} />
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },
    header: {
        backgroundColor: '#ffffff',
        paddingHorizontal: 20,
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9'
    },
    backBtnWrapper: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15
    },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
    headerSubtitle: { fontSize: 13, color: '#64748b', fontWeight: '500' },

    filterWrapper: { padding: 20 },
    segmentControl: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        borderRadius: 15,
        padding: 5
    },
    segmentBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 12
    },
    segmentBtnActive: {
        backgroundColor: '#ffffff',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
    },
    segmentText: { fontSize: 13, fontWeight: 'bold', color: '#64748b' },
    segmentTextActive: { color: '#1e293b' },

    listContent: { paddingHorizontal: 20, paddingBottom: 40 },

    card: {
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        elevation: 1,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    iconContainer: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    historyIconImg: { width: 20, height: 20, resizeMode: 'contain' },
    orderId: { fontWeight: 'bold', fontSize: 16, color: '#1e293b' },
    dateText: { fontSize: 12, color: '#94a3b8', marginTop: 2, fontWeight: '500' },

    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    badgeDefault: { backgroundColor: '#f8fafc' },
    badgeEmerald: { backgroundColor: '#ecfdf5' },
    badgeOrange: { backgroundColor: '#fff7ed' },
    badgeRed: { backgroundColor: '#fff1f2' },
    badgeText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    badgeTextDefault: { color: '#64748b' },

    cardBody: { gap: 4 },
    clientName: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' },
    address: { fontSize: 13, color: '#64748b', lineHeight: 18 },

    priceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f8fafc'
    },
    price: { fontWeight: 'bold', color: '#1e293b', fontSize: 16 },
    typeLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#3b82f6',
        backgroundColor: '#eff6ff',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        textTransform: 'uppercase'
    },

    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { alignItems: 'center', marginTop: 60, gap: 10 },
    emptyText: { textAlign: 'center', color: '#94a3b8', fontSize: 15, fontWeight: '500' }
});
