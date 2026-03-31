import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, StatusBar, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LivreurService } from '../../services/LivreurService';
import { GrandeCommande, Commande, Statut } from '../../Types/types';
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
            const data = await LivreurService.getGrandeCommandeById(grandeCommandeId);
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
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

            {/* Modern Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnWrapper}>
                    <Ionicons name="chevron-back" size={24} color="#1e293b" />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>Groupe de Livraison</Text>
                    <Text style={styles.headerSubtitle}>{grandeCommande.commandes?.length || 0} commandes groupées</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <LinearGradient
                    colors={['#10b981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.bundleCard}
                >
                    <View style={styles.bundleInfo}>
                        <View style={styles.bundleIcon}>
                            <Ionicons name="layers" size={30} color="white" />
                        </View>
                        <View style={styles.bundleMeta}>
                            <Text style={styles.bundleCode}>{grandeCommande.code}</Text>
                            <Text style={styles.bundleStatus}>Statut: {translateStatut(grandeCommande.statut as Statut).toUpperCase()}</Text>
                        </View>
                        <View style={[styles.priceBadge, profile?.moyen === MoyenTransport.MOTO && { backgroundColor: 'white' }]}>
                            <Text style={[styles.priceValue, profile?.moyen === MoyenTransport.MOTO && { color: '#059669' }]}>
                                {profile?.moyen === MoyenTransport.MOTO
                                    ? `${(grandeCommande.commandes?.length || 0) * 5} TND`
                                    : `${grandeCommande.totalPrixLivraison} TND`}
                            </Text>
                        </View>
                    </View>
                </LinearGradient>

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Liste des Commandes</Text>
                </View>

                {grandeCommande.commandes?.map((item) => (
                    <View key={item?.id?.toString() || Math.random().toString()}>
                        {renderOrder({ item })}
                    </View>
                ))}
            </ScrollView>

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
                                            await LivreurService.acceptGrandeCommande(grandeCommande.id, grandeCommande.livreurId || 0);
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
    header: {
        backgroundColor: '#f8fafc',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 15,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3
    },
    backBtnWrapper: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15
    },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
    headerSubtitle: { fontSize: 13, color: '#64748b', fontWeight: '600', marginTop: 1 },
    scrollContent: { padding: 20, paddingBottom: 100 },
    bundleCard: {
        borderRadius: 24,
        padding: 24,
        marginBottom: 25,
        elevation: 8,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 12
    },
    bundleInfo: { flexDirection: 'row', alignItems: 'center' },
    bundleIcon: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 15 },
    bundleMeta: { marginLeft: 15, flex: 1 },
    bundleCode: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    bundleStatus: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4, fontWeight: '700' },
    priceBadge: { backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    priceValue: { color: '#059669', fontWeight: 'bold', fontSize: 16 },
    sectionHeader: { marginBottom: 15 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
    orderCard: { backgroundColor: 'white', borderRadius: 20, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, borderWidth: 1, borderColor: '#f1f5f9' },
    orderCardContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    orderInfo: { flex: 1 },
    orderCode: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
    clientName: { fontSize: 15, color: '#64748b', marginTop: 4, fontWeight: '600' },
    addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    addressText: { fontSize: 13, color: '#94a3b8', marginLeft: 4, fontWeight: '500' },
    footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    acceptBtn: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
    acceptBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
});
