import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, StatusBar, Image, Linking, Platform, Dimensions, Modal, Pressable } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LivreurService, BASE_URL } from '../../services/LivreurService';
import { Commande, Statut, Adresse } from '../../Types/types';
import { Boutique } from '../../Types/Boutique';
import { Produit } from '../../Types/Produit';
import { useAuth } from '../../context/AuthContext';

import * as Location from 'expo-location';
import { translateStatut, translateType, translatePaiement } from '../../utils/translations';
import { calculateDistance, calculateDriverRevenue } from '../../utils/revenueCalculator';
import { useLivreur } from '../../hooks/useLivreur';
import { useCommandes } from '../../hooks/useCommandes';
import { useHaptics } from '../../hooks/useHaptics';
import * as Haptics from 'expo-haptics';

// Define the route params type
type RootStackParamList = {
    CommandeDetails: { commandeId: number };
};

type CommandeDetailsRouteProp = RouteProp<RootStackParamList, 'CommandeDetails'>;

export default function CommandeDetailsScreen() {
    const route = useRoute<CommandeDetailsRouteProp>();
    const navigation = useNavigation();
    const { commandeId } = route.params;

    const [commande, setCommande] = useState<Commande | null>(null);
    const [productsDetails, setProductsDetails] = useState<Produit[]>([]);
    const [boutiquesList, setBoutiquesList] = useState<{ boutique: Boutique, address: Adresse | null }[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSingleBoutique, setIsSingleBoutique] = useState(false);
    const [driverLocation, setDriverLocation] = useState<Location.LocationObject | null>(null);
    const [distances, setDistances] = useState({ toClient: 0 }); // toBoutique is now dynamic per boutique
    const [driverRevenue, setDriverRevenue] = useState<number>(0);
    const { impact, notification: hapticNotification } = useHaptics();
    const { profile, isBlockedForCmd, getDeliveryFee, refreshProfile } = useLivreur();
    const { accept, updateStatut } = useCommandes('');
    const { userId } = useAuth();
    const [isReturnModalVisible, setIsReturnModalVisible] = useState(false);

    const RAISONS_RETOUR = [
        { label: 'Injoignable', value: 'INJOURNABLE' },
        { label: 'Ne répond pas', value: 'NE_REPOND_PAS' },
        { label: 'Adresse incorrecte', value: 'ADRESSE_INCORRECTE' },
        { label: 'Numéro invalide', value: 'NUMERO_INVALIDE' },
        { label: 'Rendez-vous indisponible', value: 'RENDEZ_VOUS_INDISPONIBLE' },
        { label: 'Annulation client', value: 'ANNULATION_CLIENT' },
        { label: 'Client non sérieux', value: 'CLIENT_NON_SERIEUX' },
        { label: 'Colis non conforme', value: 'COLIS_NON_CONFORME' },
        { label: 'Livreur mis à la liste noire', value: 'LIVREUR_MIS_A_LA_LISTE_NOIRE' },
        { label: 'Montant incorrect', value: 'MONTANT_INCORRECT' },
        { label: 'Demande ouverture colis', value: 'DEMANDE_OUVERTURE_COLIS' }
    ];


    useEffect(() => {
        requestLocation();
    }, []);

    const requestLocation = async () => {
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.log('Permission rejected');
                return;
            }
            let location = await Location.getCurrentPositionAsync({});
            setDriverLocation(location);
        } catch (error) {
            console.log('Error getting location', error);
        }
    };

    useEffect(() => {
        loadDetails();
    }, [commandeId]);

    useEffect(() => {
        if (!commande) return;

        let distToClient = 0;

        if (boutiquesList.length > 0 && commande.adresse?.latitude && commande.adresse?.longitude) {
            const lastBoutique = boutiquesList[boutiquesList.length - 1];
            if (lastBoutique.address?.latitude && lastBoutique.address?.longitude) {
                distToClient = calculateDistance(
                    lastBoutique.address.latitude,
                    lastBoutique.address.longitude,
                    commande.adresse.latitude,
                    commande.adresse.longitude
                );
            }
        }

        setDistances(prev => ({ ...prev, toClient: distToClient }));
    }, [driverLocation, boutiquesList, commande]);

    const loadDetails = async () => {
        try {
            const data = await LivreurService.getCommandeDetails(commandeId);
            setCommande(data);

            // Calculate Revenue
            if (data && userId) {
                try {
                    const revenue = await calculateDriverRevenue(data, profile?.moyen);
                    setDriverRevenue(revenue);
                } catch (e) {
                    console.error("Error fetching revenue", e);
                    const revenue = await calculateDriverRevenue(data);
                    setDriverRevenue(revenue);
                }
            }

            if (data && data.produits && data.produits.length > 0) {
                // Fetch details for all products
                const prodPromises = data.produits.map((p: any) => LivreurService.getProduitById(p.produitId));
                const prods = await Promise.all(prodPromises);
                setProductsDetails(prods);

                // Get unique Boutique IDs
                const boutiqueIds = [...new Set(prods.map(p => p.boutiqueId))];
                setIsSingleBoutique(boutiqueIds.length === 1);

                // Fetch details for ALL unique boutiques
                const boutiquesData: { boutique: Boutique, address: Adresse | null }[] = [];

                for (const bId of boutiqueIds) {
                    if (bId != null) {
                        try {
                            const b = await LivreurService.getBoutiqueById(bId);
                            let addr = null;
                            if (b.adresseId) {
                                addr = await LivreurService.getAdresseById(b.adresseId);
                            }
                            boutiquesData.push({ boutique: b, address: addr });
                        } catch (err) {
                            console.error(`Failed to load info for boutique ${bId}`, err);
                        }
                    }
                }
                setBoutiquesList(boutiquesData);
            }
        } catch (error) {
            console.error("Erreur chargement détails", error);
            Alert.alert("Erreur", "Impossible de charger les détails de la commande.");
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const openMap = async (address: string, lat?: number, lng?: number) => {
        if (lat && lng) {
            const url = Platform.select({
                ios: `comgooglemaps://?q=${lat},${lng}&center=${lat},${lng}&zoom=14`,
                android: `google.navigation:q=${lat},${lng}`
            });

            if (url) {
                const canOpen = await Linking.canOpenURL(url);
                if (canOpen) {
                    Linking.openURL(url);
                    return;
                }
            }
            // Fallback for coordinates if Google Maps app is not installed
            const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
            Linking.openURL(webUrl);
            return;
        }

        // Fallback for text address
        const query = encodeURIComponent(address);
        const webUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
        Linking.openURL(webUrl);
    };

    const handleAccept = async () => {
        if (!userId || !commande) return;

        if (isBlockedForCmd(commande)) {
            hapticNotification(Haptics.NotificationFeedbackType.Warning);
            const fee = getDeliveryFee(commande);
            Alert.alert(
                "Plafond atteint",
                `En acceptant cette commande (+${fee} TND de frais), vous dépasserez votre plafond de cash autorisé. Veuillez verser l'argent encaissé pour continuer.`,
                [{ text: "Compris" }]
            );
            return;
        }

        try {
            impact(Haptics.ImpactFeedbackStyle.Heavy);
            await accept(commande.id);
            Alert.alert("Succès", "Commande acceptée !");
            loadDetails();
        } catch (error: any) {
            if (error.response?.status === 409) {
                Alert.alert('Trop tard', 'Cette commande a déjà été prise.');
                navigation.goBack();
            } else {
                Alert.alert("Erreur", "Impossible d'accepter la commande.");
            }
        }
    };

    const handleStartDelivery = async () => {
        if (!commande) return;
        impact(Haptics.ImpactFeedbackStyle.Medium);
        try {
            await updateStatut({ cmdId: commande.id, statut: Statut.SHIPPED });
            Alert.alert("Livraison commencée", "Vous allez être redirigé vers l'adresse du client.");

            if (boutiquesList.length > 0 && boutiquesList[0].address) {
                const firstAddr = boutiquesList[0].address;
                openMap(
                    `${firstAddr.rue}, ${firstAddr.delegation}, ${firstAddr.gouvernerat}, Tunisia`,
                    firstAddr.latitude,
                    firstAddr.longitude
                );
            }

            loadDetails();
        } catch (error) {
            Alert.alert("Erreur", "Impossible de mettre à jour le statut.");
        }
    };

    const handleMarkAsReturned = async () => {
        setIsReturnModalVisible(true);
    };

    const handleSelectReason = async (reasonValue: string) => {
        if (!commande) return;
        setIsReturnModalVisible(false);
        try {
            await LivreurService.updateStatut(commande.id, Statut.RETURNED, reasonValue);
            Alert.alert("Succès", "Commande marquée comme retournée !");
            loadDetails();
        } catch (error) {
            Alert.alert("Erreur", "Impossible de mettre à jour le statut.");
        }
    };

    const handleMarkAsDelivered = async () => {
        if (!commande) return;
        try {
            await LivreurService.updateStatut(commande.id, Statut.DELIVERED);
            Alert.alert("Succès", "Commande marquée comme livrée !");
            loadDetails();
        } catch (error) {
            Alert.alert("Erreur", "Impossible de mettre à jour le statut.");
        }
    };



    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#059669" />
            </View>
        );
    }

    if (!commande) {
        return (
            <View style={styles.centerContainer}>
                <Text>Commande introuvable.</Text>
            </View>
        );
    }

    const badgeInfo = getStatusBadge(commande.statut);
    const isMine = commande.livreurId === userId;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnWrapper}>
                    <Ionicons name="chevron-back" size={24} color="#1e293b" />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>Détails Commande</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.headerSubtitle}>#{commande.id}</Text>
                        {commande.code && (
                            <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#fcd34d' }}>
                                <Text style={{ color: '#92400e', fontSize: 10, fontWeight: 'bold' }}>{commande.code}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Status Section */}
                <View style={styles.statusSection}>
                    <View style={[styles.statusBadgeLarge, { backgroundColor: badgeInfo.bg }]}>
                        <View style={[styles.statusDot, { backgroundColor: badgeInfo.text }]} />
                        <Text style={[styles.statusBadgeText, { color: badgeInfo.text }]}>
                            {translateStatut(commande.statut).toUpperCase()}
                        </Text>
                    </View>
                    <Text style={styles.creationDate}>
                        Commandée le {new Date(commande.date).toLocaleDateString('fr-FR')}
                    </Text>
                </View>

                {/* Itinerary Timeline */}
                <View style={styles.itineraryCard}>
                    <Text style={styles.cardMainTitle}>Parcours de livraison</Text>

                    {/* PICKUP(S) */}
                    {boutiquesList.map((item, index) => {
                        const { boutique, address } = item;
                        let distText = '';
                        if (driverLocation && address?.latitude && address?.longitude) {
                            const d = calculateDistance(driverLocation.coords.latitude, driverLocation.coords.longitude, address.latitude, address.longitude);
                            distText = `${d.toFixed(1)} km de vous`;
                        }

                        return (
                            <View key={boutique.id} style={styles.stepContainer}>
                                <View style={styles.stepIndicator}>
                                    <View style={[styles.stepIcon, { backgroundColor: '#eff6ff' }]}>
                                        <Ionicons name="storefront" size={18} color="#3b82f6" />
                                    </View>
                                    <View style={styles.stepLine} />
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={[styles.stepTag, { color: '#3b82f6' }]}>POINT DE COLLECTE {boutiquesList.length > 1 ? `#${index + 1}` : ''}</Text>
                                    <Text style={styles.shopNameText}>{boutique.nom}</Text>
                                    <Text style={styles.addressLine}>{address?.rue}, {address?.delegation}</Text>
                                    <Text style={styles.cityLine}>{distText || 'Tunisie'}</Text>

                                    <View style={styles.miniActions}>
                                        <TouchableOpacity style={styles.miniBtn} onPress={() => Linking.openURL(`tel:${boutique.telephone}`)}>
                                            <Ionicons name="call" size={14} color="#3b82f6" />
                                            <Text style={[styles.miniBtnText, { color: '#3b82f6' }]}>Appeler</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.miniBtn} onPress={() => openMap(`${address?.rue}, ${address?.delegation}`, address?.latitude, address?.longitude)}>
                                            <Ionicons name="location" size={14} color="#3b82f6" />
                                            <Text style={[styles.miniBtnText, { color: '#3b82f6' }]}>Y aller</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        );
                    })}

                    {/* DROP OFF */}
                    <View style={styles.stepContainer}>
                        <View style={styles.stepIndicator}>
                            <View style={[styles.stepIcon, { backgroundColor: '#f0fdf4' }]}>
                                <Ionicons name="person" size={18} color="#10b981" />
                            </View>
                        </View>
                        <View style={styles.stepContent}>
                            <Text style={[styles.stepTag, { color: '#10b981' }]}>DESTINATION CLIENT</Text>
                            <Text style={styles.personName}>{commande.nom} {commande.prenom}</Text>
                            <Text style={styles.addressLine}>{commande.adresse?.rue}, {commande.adresse?.delegation}</Text>
                            {distances.toClient > 0 && (
                                <Text style={styles.cityLine}>{distances.toClient.toFixed(1)} km du dernier point</Text>
                            )}

                            <View style={styles.miniActions}>
                                <TouchableOpacity style={styles.miniBtn} onPress={() => Linking.openURL(`tel:${commande.numTel}`)}>
                                    <Ionicons name="call" size={14} color="#10b981" />
                                    <Text style={[styles.miniBtnText, { color: '#10b981' }]}>Appeler</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.miniBtn} onPress={() => openMap(`${commande.adresse?.rue}, ${commande.adresse?.delegation}`, commande.adresse?.latitude, commande.adresse?.longitude)}>
                                    <Ionicons name="location" size={14} color="#10b981" />
                                    <Text style={[styles.miniBtnText, { color: '#10b981' }]}>Y aller</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Logistics Info Grid */}
                <View style={styles.detailRow}>
                    <View style={styles.detailBox}>
                        <Text style={styles.detailLabel}>Type</Text>
                        <Text style={[styles.detailValue, { color: commande.type === 'EXPRESS' ? '#ef4444' : '#1e293b' }]}>
                            {translateType(commande.type)}
                        </Text>
                    </View>
                    <View style={styles.detailBox}>
                        <Text style={styles.detailLabel}>Paiement</Text>
                        <Text style={styles.detailValue}>{translatePaiement(commande.methodePaiement)}</Text>
                    </View>
                </View>

                {/* Articles */}
                <View style={styles.articlesHeader}>
                    <Text style={styles.itemTitle}>Articles à livrer</Text>
                    <View style={styles.itemCountBadge}>
                        <Text style={styles.itemCountText}>{commande.produits?.length || 0} items</Text>
                    </View>
                </View>

                {commande.produits?.map((prodItem, index) => {
                    const fullProd = productsDetails.find(p => p.id === prodItem.produitId);
                    const getImageUrl = (path: string) => {
                        if (!path) return null;
                        if (path.startsWith('http')) return path;
                        const normalizedPath = path.replace(/\\/g, '/');
                        return `${BASE_URL.replace(/\/+$/, '')}/${normalizedPath.replace(/^\/+/, '')}`;
                    };

                    return (
                        <View key={index} style={styles.productItem}>
                            <View style={styles.productThumbContainer}>
                                {fullProd?.imagePaths && fullProd.imagePaths.length > 0 ? (
                                    <Image
                                        source={{ uri: getImageUrl(fullProd.imagePaths[0]) || '' }}
                                        style={styles.productThumb}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View style={styles.placeholderImg}>
                                        <Ionicons name="cube-outline" size={30} color="#cbd5e1" />
                                    </View>
                                )}
                            </View>
                            <View style={styles.prodContent}>
                                <Text style={styles.prodName}>{fullProd ? fullProd.nom : `Produit #${prodItem.produitId}`}</Text>
                                <Text style={styles.prodQty}>Qté : {prodItem.quantite}</Text>
                            </View>
                            <Text style={styles.prodPrice}>{fullProd ? `${fullProd.prix} TND` : '-'}</Text>
                        </View>
                    );
                })}

                {/* Total Panel */}
                <View style={styles.totalPanel}>
                    <View style={styles.totalRowLine}>
                        <Text style={styles.totalRowLabel}>Sous-total articles</Text>
                        <Text style={styles.totalRowValue}>{commande.prixTotalSansLivraison} TND</Text>
                    </View>
                    <View style={styles.totalRowLine}>
                        <Text style={styles.totalRowLabel}>Frais de livraison</Text>
                        <Text style={styles.totalRowValue}>{(commande.prixTotalAvecLivraison - commande.prixTotalSansLivraison).toFixed(2)} TND</Text>
                    </View>

                    <View style={styles.revenueHighlight}>
                        <View style={styles.totalRowLine}>
                            <Text style={[styles.totalRowLabel, { color: '#fbbf24', fontWeight: 'bold' }]}>Votre commission estimée</Text>
                            <Text style={[styles.totalRowValue, { color: '#fbbf24', fontSize: 16 }]}>
                                {driverRevenue > 0 ? `${driverRevenue.toFixed(2)} TND` : '...'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.grandTotalBorder} />
                    <View style={styles.totalRowLine}>
                        <Text style={styles.totalMainLabel}>TOTAL À ENCAISSER</Text>
                        <Text style={styles.totalMainValue}>{commande.prixTotalAvecLivraison} TND</Text>
                    </View>
                </View>

                {/* Multiple Boutiques Warning */}
                {!isSingleBoutique && (
                    <View style={styles.warningContainer}>
                        <Ionicons name="information-circle" size={24} color="#f59e0b" />
                        <Text style={styles.warningMsg}>Cette commande contient des articles de plusieurs boutiques différentes.</Text>
                    </View>
                )}

                {/* Bottom Actions */}
                <View style={styles.bottomActions}>
                    {(commande.statut === Statut.CONFIRMED && !commande.livreurId) && (
                        <View style={{ width: '100%' }}>
                            {isBlockedForCmd(commande) && (
                                <View style={[styles.warningContainer, { marginBottom: 20, backgroundColor: '#fee2e2', borderColor: '#fecaca' }]}>
                                    <Ionicons name="alert-circle" size={24} color="#ef4444" />
                                    <Text style={[styles.warningMsg, { color: '#991b1b' }]}>
                                        Votre plafond est atteint. Versez votre solde ({profile?.cashbalance} TND) pour accepter de nouvelles commandes.
                                    </Text>
                                </View>
                            )}
                            <View style={styles.dualActions}>
                                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.ignoreButton}>
                                    <Text style={styles.ignoreButtonText}>IGNORER</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleAccept}
                                    style={[styles.acceptButton, isBlockedForCmd(commande) && { backgroundColor: '#94a3b8', elevation: 0 }]}
                                    disabled={isBlockedForCmd(commande)}
                                >
                                    <Text style={styles.acceptButtonText}>{isBlockedForCmd(commande) ? 'BLOQUÉ' : 'ACCEPTER'}</Text>
                                    {!isBlockedForCmd(commande) && <Ionicons name="arrow-forward" size={20} color="white" />}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {isMine && (
                        <View style={{ width: '100%' }}>
                            {commande.statut === Statut.ACCEPTED && (
                                <TouchableOpacity onPress={handleStartDelivery} style={styles.primaryActionButton}>
                                    <Ionicons name="bicycle" size={24} color="white" />
                                    <Text style={styles.primaryActionButtonText}>LANCER LA LIVRAISON</Text>
                                </TouchableOpacity>
                            )}

                            {commande.statut === Statut.SHIPPED && (
                                <View style={styles.dualActions}>
                                    <TouchableOpacity onPress={handleMarkAsReturned} style={[styles.ignoreButton, styles.returnedButton]}>
                                        <Text style={[styles.ignoreButtonText, { color: '#ef4444' }]}>RETOUR</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={handleMarkAsDelivered} style={[styles.acceptButton, styles.shippedButton]}>
                                        <Ionicons name="checkmark-done" size={22} color="white" />
                                        <Text style={styles.acceptButtonText}>LIVRÉ</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {(commande.statut === Statut.DELIVERED || commande.statut === Statut.RETURNED) && (
                                <View style={[styles.warningContainer, { backgroundColor: '#f0fdf4', borderColor: '#dcfce7' }]}>
                                    <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                                    <Text style={[styles.warningMsg, { color: '#15803d' }]}>Cette course est terminée.</Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>

            </ScrollView>

            {/* Modal Raison de Retour */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={isReturnModalVisible}
                onRequestClose={() => setIsReturnModalVisible(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setIsReturnModalVisible(false)}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Raison du retour</Text>
                            <TouchableOpacity onPress={() => setIsReturnModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalSubtitle}>Sélectionnez la raison pour laquelle cette commande est retournée.</Text>

                        {RAISONS_RETOUR.map((raison) => (
                            <TouchableOpacity
                                key={raison.value}
                                style={styles.reasonOption}
                                onPress={() => handleSelectReason(raison.value)}
                            >
                                <Text style={styles.reasonText}>{raison.label}</Text>
                                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                            </TouchableOpacity>
                        ))}
                    </View>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

function getStatusBadge(statut: Statut) {
    switch (statut) {
        case Statut.DELIVERED: return { bg: '#f0fdf4', text: '#10b981' };
        case Statut.RETURNED: return { bg: '#fff1f2', text: '#ef4444' };
        case Statut.SHIPPED: return { bg: '#fff7ed', text: '#f97316' };
        case Statut.CONFIRMED: return { bg: '#faf5ff', text: '#a855f7' };
        case Statut.ACCEPTED: return { bg: '#eff6ff', text: '#3b82f6' };
        case Statut.EN_COURS_DE_RETOUR: return { bg: '#f3e8ff', text: '#a855f7' };
        case Statut.EN_COURS_D_ECHANGE: return { bg: '#e0e7ff', text: '#6366f1' };
        default: return { bg: '#f8fafc', text: '#64748b' };
    }
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

    header: {
        backgroundColor: '#ffffff',
        paddingHorizontal: 20,
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10
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

    scrollContent: { padding: 16, paddingBottom: 100 },

    // Status Section
    statusSection: {
        alignItems: 'center',
        marginBottom: 25,
        marginTop: 5
    },
    statusBadgeLarge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 25,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)'
    },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
    statusBadgeText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
    creationDate: { fontSize: 12, color: '#94a3b8', marginTop: 10, fontWeight: '500' },

    // Itinerary Section (Timeline)
    itineraryCard: {
        backgroundColor: '#ffffff',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        elevation: 4,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        marginBottom: 20
    },
    cardMainTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 20 },

    stepContainer: { flexDirection: 'row' },
    stepIndicator: { alignItems: 'center', width: 40, marginRight: 15 },
    stepIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
    stepLine: { flex: 1, width: 2, backgroundColor: '#f1f5f9', marginVertical: 4 },
    stepContent: { flex: 1, paddingBottom: 25 },
    stepTag: { fontSize: 10, fontWeight: '900', marginBottom: 6, letterSpacing: 0.5 },
    personName: { fontSize: 16, fontWeight: '900', color: '#1e293b' },
    shopNameText: { fontSize: 16, fontWeight: '900', color: '#1e293b' },
    addressLine: { fontSize: 14, color: '#475569', marginTop: 4, lineHeight: 20 },
    cityLine: { fontSize: 14, color: '#94a3b8', marginTop: 2, fontWeight: '500' },

    miniActions: { flexDirection: 'row', gap: 10, marginTop: 15 },
    miniBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#f1f5f9'
    },
    miniBtnText: { fontSize: 12, fontWeight: '800' },

    // Article Section
    articlesHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
        marginTop: 10,
        paddingHorizontal: 4
    },
    itemTitle: { fontSize: 17, fontWeight: '900', color: '#1e293b' },
    itemCountBadge: {
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10
    },
    itemCountText: { fontSize: 12, fontWeight: 'bold', color: '#64748b' },

    productItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        padding: 14,
        borderRadius: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5
    },
    productThumbContainer: {
        width: 60,
        height: 60,
        borderRadius: 14,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#edf2f7'
    },
    productThumb: { width: '100%', height: '100%' },
    placeholderImg: { width: 30, height: 30 },
    prodContent: { flex: 1 },
    prodName: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' },
    prodQty: { fontSize: 13, color: '#94a3b8', marginTop: 4, fontWeight: '600' },
    prodPrice: { fontSize: 16, fontWeight: '900', color: '#10b981' },

    // Summary Receipt
    totalPanel: {
        backgroundColor: '#1e293b',
        borderRadius: 24,
        padding: 24,
        marginTop: 25,
        elevation: 8,
        shadowColor: '#1e293b',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 15
    },
    totalRowLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    totalRowLabel: { fontSize: 14, color: '#94a3b8', fontWeight: '500' },
    totalRowValue: { fontSize: 14, color: '#ffffff', fontWeight: '700' },
    grandTotalBorder: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 15 },
    totalMainLabel: { fontSize: 18, fontWeight: '900', color: '#ffffff' },
    totalMainValue: { fontSize: 24, fontWeight: '900', color: '#10b981' },

    revenueHighlight: {
        marginTop: 5,
        paddingVertical: 10,
        paddingHorizontal: 15,
        backgroundColor: 'rgba(251, 191, 36, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.2)'
    },

    // Extras
    detailRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 5,
        marginBottom: 20
    },
    detailBox: {
        flex: 1,
        backgroundColor: '#ffffff',
        padding: 15,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        alignItems: 'center'
    },
    detailLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '900', textTransform: 'uppercase', marginBottom: 6 },
    detailValue: { fontSize: 14, color: '#1e293b', fontWeight: 'bold' },

    warningContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#fffbeb',
        padding: 16,
        borderRadius: 18,
        marginTop: 15,
        borderWidth: 1,
        borderColor: '#fef3c7'
    },
    warningMsg: { fontSize: 13, color: '#b45309', fontWeight: '700', flex: 1 },

    // Actions
    bottomActions: {
        marginTop: 30,
        paddingBottom: 20
    },
    dualActions: { flexDirection: 'row', gap: 12 },
    ignoreButton: {
        flex: 1,
        height: 60,
        borderRadius: 18,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 1
    },
    ignoreButtonText: { color: '#64748b', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
    acceptButton: {
        flex: 2,
        height: 60,
        borderRadius: 18,
        backgroundColor: '#10b981',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        elevation: 6,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8
    },
    acceptButtonText: { color: '#ffffff', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },

    primaryActionButton: {
        height: 64,
        borderRadius: 20,
        backgroundColor: '#1e293b',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        elevation: 8,
        shadowColor: '#1e293b',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10
    },
    primaryActionButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
    shippedButton: { backgroundColor: '#10b981', shadowColor: '#10b981' },
    returnedButton: { backgroundColor: '#fff1f2', borderColor: '#fee2e2', borderWidth: 1 },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: 24,
        padding: 24,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1e293b'
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 20,
        lineHeight: 20
    },
    reasonOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9'
    },
    reasonText: {
        fontSize: 16,
        color: '#334155',
        fontWeight: '600'
    }
});