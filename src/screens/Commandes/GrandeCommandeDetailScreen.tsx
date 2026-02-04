import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, StatusBar, Image } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GrandeCommandeService } from '../../services/GrandeCommandeService';
import { GrandeCommande } from '../../Types/GrandeCommande.model';
import { Commande, Statut } from '../../Types/types';
import { useHaptics } from '../../hooks/useHaptics';
import * as Haptics from 'expo-haptics';
import { translateStatut } from '../../utils/translations';
import { LinearGradient } from 'expo-linear-gradient';
import { useLivreur } from '../../hooks/useLivreur';
import { MoyenTransport } from '../../Types/auth';

type RootStackParamList = {
    GrandeCommandeDetail: { grandeCommandeId: number; initialData?: GrandeCommande };
};

type GrandeCommandeDetailRouteProp = RouteProp<RootStackParamList, 'GrandeCommandeDetail'>;

export default function GrandeCommandeDetailScreen() {
    const route = useRoute<GrandeCommandeDetailRouteProp>();
    const navigation = useNavigation<any>();
    const { grandeCommandeId, initialData } = route.params;
    const { impact } = useHaptics();
    const { profile } = useLivreur();

    const [grandeCommande, setGrandeCommande] = useState<GrandeCommande | null>(initialData || null);
    const [loading, setLoading] = useState(!initialData);

    useEffect(() => {
        if (!initialData) {
            loadDetails();
        }
    }, [grandeCommandeId]);

    const loadDetails = async () => {
        try {
            const data = await GrandeCommandeService.getGrandeCommandeById(grandeCommandeId);
            setGrandeCommande(data);
        } catch (error) {
            console.error(error);
            Alert.alert("Erreur", "Impossible de charger les détails du groupe.");
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const renderOrder = ({ item }: { item: Commande }) => (
        <TouchableOpacity
            style={styles.orderCard}
            onPress={() => {
                impact(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('CommandeDetails', { commandeId: item.id });
            }}
        >
            <View style={styles.orderCardContent}>
                <View style={styles.orderInfo}>
                    <Text style={styles.orderCode}>Commande #{item.id}</Text>
                    <Text style={styles.clientName}>{item.prenom} {item.nom}</Text>
                    <View style={styles.addressRow}>
                        <Ionicons name="location-sharp" size={14} color="#64748b" />
                        <Text style={styles.addressText} numberOfLines={1}>
                            {item.adresse?.rue}, {item.adresse?.delegation}
                        </Text>
                    </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
            </View>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#10b981" />
            </View>
        );
    }

    if (!grandeCommande) return null;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header with Gradient */}
            <LinearGradient colors={['#10b981', '#059669']} style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Groupe de Livraison</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={styles.bundleInfo}>
                    <View style={styles.bundleIcon}>
                        <Ionicons name="layers" size={30} color="white" />
                    </View>
                    <View style={styles.bundleMeta}>
                        <Text style={styles.bundleCode}>{grandeCommande.code}</Text>
                        <Text style={styles.bundleSub}>{grandeCommande.commandes?.length || 0} commandes groupées</Text>
                    </View>
                    <View style={[styles.priceBadge, profile?.moyen === MoyenTransport.MOTO && { backgroundColor: '#fef3c7' }]}>
                        <Text style={[styles.priceValue, profile?.moyen === MoyenTransport.MOTO && { color: '#d97706' }]}>
                            {profile?.moyen === MoyenTransport.MOTO
                                ? `${(grandeCommande.commandes?.length || 0) * 5} TND`
                                : `${grandeCommande.totalPrixLivraison} TND`}
                        </Text>
                    </View>
                </View>
            </LinearGradient>

            <View style={styles.content}>
                <Text style={styles.sectionTitle}>Liste des Commandes</Text>
                <FlatList
                    data={grandeCommande.commandes}
                    renderItem={renderOrder}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                />
            </View>

            {grandeCommande.statut === 'PENDING' && (
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => {
                            impact(Haptics.ImpactFeedbackStyle.Heavy);
                            // Handle accept from list? Or here?
                            // Usually, if they see details, they want to accept.
                            Alert.alert("Confirmer", "Voulez-vous accepter ce groupe de commandes ?", [
                                { text: "Annuler", style: "cancel" },
                                {
                                    text: "Accepter", onPress: async () => {
                                        try {
                                            await GrandeCommandeService.accepterGrandeCommande(grandeCommande.id, grandeCommande.livreurId);
                                            Alert.alert("Succès", "Groupe accepté !");
                                            navigation.goBack();
                                        } catch (e) {
                                            Alert.alert("Erreur", "Impossible d'accepter le groupe.");
                                        }
                                    }
                                }
                            ]);
                        }}
                    >
                        <Text style={styles.acceptBtnText}>ACCEPTER LE GROUPE</Text>
                    </TouchableOpacity>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { paddingBottom: 30, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    backButton: { padding: 8 },
    bundleInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 25 },
    bundleIcon: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 15 },
    bundleMeta: { marginLeft: 15, flex: 1 },
    bundleCode: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    bundleSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 },
    priceBadge: { backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    priceValue: { color: '#059669', fontWeight: 'bold', fontSize: 16 },
    content: { flex: 1, padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 15 },
    listContainer: { paddingBottom: 20 },
    orderCard: { backgroundColor: 'white', borderRadius: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
    orderCardContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    orderInfo: { flex: 1 },
    orderCode: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
    clientName: { fontSize: 15, color: '#475569', marginTop: 4 },
    addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    addressText: { fontSize: 13, color: '#64748b', marginLeft: 4 },
    footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    acceptBtn: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
    acceptBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
});
