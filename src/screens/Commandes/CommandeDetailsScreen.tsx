import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, StatusBar, Image, Linking, Platform, Dimensions } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LivreurService, BASE_URL } from '../../services/LivreurService';
import { Commande, Statut, Adresse } from '../../Types/types';
import { Boutique } from '../../Types/Boutique';
import { Produit } from '../../Types/Produit';
import { useAuth } from '../../context/AuthContext';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
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
    const mapRef = React.useRef<MapView | null>(null);
    const { impact, notification: hapticNotification } = useHaptics();
    const { profile, isBlockedForCmd, getDeliveryFee, refreshProfile } = useLivreur();
    const { accept, updateStatut } = useCommandes('');
    const { userId } = useAuth();


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

        // Calculate distance to client (last leg)
        // Note: For boutiques, we calculate distance individually in render or a separate effect if needed.
        // But mainly we want to center the map.

        let distToClient = 0;

        // Find the last boutique address if possible? 
        // Logic: if we have boutiquesList, we can check distance from last boutique to client
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

        // Auto-center map to show all relevant points
        if (mapRef.current) {
            const coordinates = [];
            if (driverLocation) coordinates.push({ latitude: driverLocation.coords.latitude, longitude: driverLocation.coords.longitude });

            boutiquesList.forEach(b => {
                if (b.address?.latitude && b.address?.longitude) {
                    coordinates.push({ latitude: b.address.latitude, longitude: b.address.longitude });
                }
            });

            if (commande.adresse?.latitude && commande.adresse?.longitude) coordinates.push({ latitude: commande.adresse.latitude, longitude: commande.adresse.longitude });

            if (coordinates.length > 0) {
                mapRef.current.fitToCoordinates(coordinates, {
                    edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
                    animated: true,
                });
            }
        }
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
        if (!commande) return;
        try {
            await LivreurService.updateStatut(commande.id, Statut.RETURNED);
            Alert.alert("Succès", "Commande marquée comme retournée !"); // "Commande marked as returned!"
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

    const showNavigationInApp = (targetLat: number, targetLng: number, title: string) => {
        (navigation as any).navigate('MapScreen', {
            targetLat,
            targetLng,
            targetTitle: title,
            driverLat: driverLocation?.coords.latitude,
            driverLng: driverLocation?.coords.longitude,
        });
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
                    <Text style={styles.headerSubtitle}>#{commande.id}</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Status Section */}
                <View style={styles.statusRow}>
                    <Text style={styles.sectionLabel}>Statut actuel</Text>
                    <View style={[styles.statusBadge, { backgroundColor: badgeInfo.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badgeInfo.text }]}>
                            {translateStatut(commande.statut).toUpperCase()}
                        </Text>
                    </View>
                </View>

                {/* Boutiques info */}
                {boutiquesList.map((item, index) => {
                    const { boutique, address } = item;
                    // Calculate distance from driver to THIS boutique (optional visual aid)
                    let distText = '';
                    if (driverLocation && address?.latitude && address?.longitude) {
                        const d = calculateDistance(driverLocation.coords.latitude, driverLocation.coords.longitude, address.latitude, address.longitude);
                        distText = `${d.toFixed(1)} km`;
                    }

                    return (
                        <View key={boutique.id} style={[styles.premiumCard, { marginBottom: 15 }]}>
                            <View style={styles.cardHeaderSmall}>
                                <Ionicons name="storefront" size={20} color="#10b981" />
                                <Text style={styles.premiumCardTitle}>
                                    {boutiquesList.length > 1 ? `Boutique ${index + 1}` : 'Boutique'}
                                </Text>
                            </View>

                            <View style={styles.premiumCardBody}>
                                <Text style={styles.shopName}>{boutique.nom}</Text>
                                <View style={styles.infoLine}>
                                    <Ionicons name="call-outline" size={14} color="#64748b" />
                                    <Text style={styles.infoLineText}>{boutique.telephone}</Text>
                                </View>

                                {address && (
                                    <View style={styles.addressBox}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.addressText}>
                                                {address.rue}, {address.delegation}, {address.gouvernerat}
                                            </Text>
                                            {distText ? (
                                                <Text style={styles.distanceInfo}>
                                                    <Ionicons name="navigate" size={12} /> À {distText} de vous
                                                </Text>
                                            ) : null}
                                        </View>
                                        <View style={styles.actionButtons}>
                                            <TouchableOpacity
                                                onPress={() => openMap(
                                                    `${address.rue}, ${address.delegation}, ${address.gouvernerat}, Tunisia`,
                                                    address.latitude,
                                                    address.longitude
                                                )}
                                                style={styles.circleActionBtn}
                                            >
                                                <Ionicons name="location" size={22} color="#3b82f6" />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => address.latitude && address.longitude && showNavigationInApp(address.latitude, address.longitude, boutique.nom)}
                                                style={[styles.circleActionBtn, { backgroundColor: '#ecfdf5' }]}
                                            >
                                                <Ionicons name="map" size={22} color="#10b981" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </View>
                        </View>
                    );
                })}

                {/* Client info */}
                <View style={[styles.premiumCard, { marginTop: 15 }]}>
                    <View style={styles.cardHeaderSmall}>
                        <Ionicons name="person" size={20} color="#10b981" />
                        <Text style={styles.premiumCardTitle}>Client</Text>
                    </View>

                    <View style={styles.premiumCardBody}>
                        <Text style={styles.shopName}>{commande.nom} {commande.prenom}</Text>
                        <TouchableOpacity
                            style={styles.infoLine}
                            onPress={() => Linking.openURL(`tel:${commande.numTel}`)}
                        >
                            <Ionicons name="call-outline" size={14} color="#64748b" />
                            <Text style={[styles.infoLineText, { color: '#3b82f6', textDecorationLine: 'underline' }]}>
                                {commande.numTel}
                            </Text>
                        </TouchableOpacity>

                        <View style={styles.addressBox}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.addressText}>
                                    {commande.adresse?.rue}, {commande.adresse?.delegation}, {commande.adresse?.gouvernerat}
                                </Text>
                                {distances.toClient > 0 && (
                                    <Text style={styles.distanceInfo}>
                                        <Ionicons name="swap-horizontal" size={12} /> {distances.toClient.toFixed(1)} km de la boutique
                                    </Text>
                                )}
                            </View>
                            <View style={styles.actionButtons}>
                                <TouchableOpacity
                                    onPress={() => openMap(
                                        `${commande.adresse?.rue}, ${commande.adresse?.delegation}, ${commande.adresse?.gouvernerat}, Tunisia`,
                                        commande.adresse?.latitude,
                                        commande.adresse?.longitude
                                    )}
                                    style={styles.circleActionBtn}
                                >
                                    <Ionicons name="location" size={22} color="#3b82f6" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => commande.adresse?.latitude && commande.adresse?.longitude && showNavigationInApp(commande.adresse.latitude, commande.adresse.longitude, "Client")}
                                    style={[styles.circleActionBtn, { backgroundColor: '#ecfdf5' }]}
                                >
                                    <Ionicons name="map" size={22} color="#10b981" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>

                {/* More Details */}
                <View style={styles.detailsGrid}>
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

                {/* Products */}
                <Text style={styles.itemTitle}>Articles commandés</Text>
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
                                        <Ionicons name="cube-outline" size={24} color="#94a3b8" />
                                    </View>
                                )}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.prodName}>{fullProd ? fullProd.nom : `Produit #${prodItem.produitId}`}</Text>
                                <Text style={styles.prodQty}>Quantité : {prodItem.quantite}</Text>
                            </View>
                            <Text style={styles.prodPrice}>{fullProd ? `${fullProd.prix} TND` : '-'}</Text>
                        </View>
                    );
                })}

                {/* Total Summary */}
                <View style={styles.totalPanel}>
                    <View style={styles.totalRowLine}>
                        <Text style={styles.totalRowLabel}>Articles</Text>
                        <Text style={styles.totalRowValue}>{commande.prixTotalSansLivraison} TND</Text>
                    </View>
                    <View style={styles.totalRowLine}>
                        <Text style={styles.totalRowLabel}>Frais livraison</Text>
                        <Text style={styles.totalRowValue}>{(commande.prixTotalAvecLivraison - commande.prixTotalSansLivraison).toFixed(2)} TND</Text>
                    </View>

                    {/* Revenue Display */}
                    <View style={[styles.totalRowLine, { marginTop: 5 }]}>
                        <Text style={[styles.totalRowLabel, { color: '#fbbf24' }]}>Votre commission (est.)</Text>
                        <Text style={[styles.totalRowValue, { color: '#fbbf24' }]}>
                            {driverRevenue > 0 ? `${driverRevenue.toFixed(2)} TND` : 'Calcul...'}
                        </Text>
                    </View>

                    <View style={styles.grandTotalBorder} />
                    <View style={styles.totalRowLine}>
                        <Text style={styles.totalMainLabel}>Total à encaisser</Text>
                        <Text style={styles.totalMainValue}>{commande.prixTotalAvecLivraison} TND</Text>
                    </View>
                </View>

                {/* Warnings */}
                {!isSingleBoutique && (
                    <View style={styles.warningContainer}>
                        <Ionicons name="warning" size={18} color="#f59e0b" />
                        <Text style={styles.warningMsg}>Plusieurs boutiques impliquées.</Text>
                    </View>
                )}

                {/* Action Buttons */}
                <View style={styles.bottomActions}>
                    {(commande.statut === Statut.CONFIRMED && !commande.livreurId) && (
                        <View style={{ width: '100%' }}>
                            {isBlockedForCmd(commande) && (
                                <View style={[styles.warningContainer, { marginBottom: 15, backgroundColor: '#fee2e2', borderColor: '#fecaca' }]}>
                                    <Ionicons name="alert-circle" size={18} color="#ef4444" />
                                    <Text style={[styles.warningMsg, { color: '#991b1b' }]}>
                                        Plafond dépassé (+{getDeliveryFee(commande)} TND frais). Versez votre solde pour accepter.
                                    </Text>
                                </View>
                            )}
                            <View style={styles.dualActions}>
                                <TouchableOpacity
                                    onPress={() => navigation.goBack()}
                                    style={styles.ignoreButton}
                                >
                                    <Text style={styles.ignoreButtonText}>IGNORER</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleAccept}
                                    style={[styles.acceptButton, isBlockedForCmd(commande) && { backgroundColor: '#94a3b8', elevation: 0 }]}
                                    disabled={isBlockedForCmd(commande)}
                                >
                                    <Text style={styles.acceptButtonText}>{isBlockedForCmd(commande) ? 'BLOQUÉ' : 'ACCEPTER'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {commande.livreurId === userId && (
                        <>
                            {commande.statut === Statut.ACCEPTED && (
                                <TouchableOpacity onPress={handleStartDelivery} style={styles.primaryActionButton}>
                                    <Ionicons name="bicycle" size={22} color="white" />
                                    <Text style={styles.primaryActionButtonText}>COMMENCER LA LIVRAISON</Text>
                                </TouchableOpacity>
                            )}
                            {commande.statut === Statut.SHIPPED && (
                                <View style={styles.dualActions}>
                                    <TouchableOpacity
                                        onPress={handleMarkAsReturned}
                                        style={[styles.ignoreButton, { borderColor: '#ef4444', backgroundColor: '#fff1f2' }]}
                                    >
                                        <Text style={[styles.ignoreButtonText, { color: '#ef4444' }]}>RETOUR</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={handleMarkAsDelivered} style={[styles.acceptButton, { backgroundColor: '#10b981' }]}>
                                        <Text style={styles.acceptButtonText}>MARQUER COMME LIVRÉ</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function getStatusBadge(statut: Statut) {
    switch (statut) {
        case Statut.DELIVERED: return { bg: '#ecfdf5', text: '#10b981' };
        case Statut.RETURNED: return { bg: '#fff1f2', text: '#ef4444' };
        case Statut.SHIPPED: return { bg: '#fff7ed', text: '#f97316' };
        case Statut.CONFIRMED: return { bg: '#faf5ff', text: '#a855f7' };
        case Statut.ACCEPTED: return { bg: '#eff6ff', text: '#3b82f6' };
        default: return { bg: '#f8fafc', text: '#64748b' };
    }
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
    headerSubtitle: { fontSize: 13, color: '#64748b', fontWeight: '500' },

    scrollContent: { padding: 20, paddingBottom: 50 },

    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    sectionLabel: { fontSize: 14, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase' },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    statusBadgeText: { fontSize: 12, fontWeight: 'bold' },

    premiumCard: {
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        elevation: 3,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8
    },
    cardHeaderSmall: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
    premiumCardTitle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b', textTransform: 'uppercase' },

    premiumCardBody: { marginTop: 5 },

    shopName: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 5 },
    infoLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    infoLineText: { fontSize: 14, color: '#64748b', fontWeight: '500' },

    addressBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        padding: 12,
        borderRadius: 15,
        marginTop: 5
    },
    addressText: { fontSize: 14, color: '#1e293b', lineHeight: 20, fontWeight: '500' },
    distanceInfo: { fontSize: 12, color: '#10b981', fontWeight: '700', marginTop: 4 },

    actionButtons: { flexDirection: 'row', gap: 10, marginLeft: 10 },
    circleActionBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#eff6ff',
        justifyContent: 'center',
        alignItems: 'center'
    },

    detailsGrid: {
        flexDirection: 'row',
        gap: 15,
        marginTop: 15,
        marginBottom: 25
    },
    detailBox: {
        flex: 1,
        backgroundColor: '#f8fafc',
        padding: 15,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#f1f5f9'
    },
    detailLabel: { fontSize: 12, color: '#94a3b8', fontWeight: 'bold', marginBottom: 4 },
    detailValue: { fontSize: 14, color: '#1e293b', fontWeight: 'bold' },

    itemTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 15 },
    productItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        padding: 12,
        borderRadius: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#f1f5f9'
    },
    productThumbContainer: {
        width: 50,
        height: 50,
        borderRadius: 10,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        overflow: 'hidden'
    },
    productThumb: { width: '100%', height: '100%' },
    placeholderImg: { width: 24, height: 24, resizeMode: 'contain' },
    prodName: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
    prodQty: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
    prodPrice: { fontSize: 15, fontWeight: 'bold', color: '#10b981' },

    totalPanel: {
        backgroundColor: '#1e293b',
        borderRadius: 20,
        padding: 20,
        marginTop: 20,
        elevation: 5
    },
    totalRowLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    totalRowLabel: { fontSize: 14, color: '#94a3b8' },
    totalRowValue: { fontSize: 14, color: '#ffffff', fontWeight: 'bold' },
    grandTotalBorder: { height: 1, backgroundColor: '#334155', marginVertical: 10 },
    totalMainLabel: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
    totalMainValue: { fontSize: 20, fontWeight: 'bold', color: '#10b981' },

    warningContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#fffbeb',
        padding: 12,
        borderRadius: 12,
        marginTop: 15,
        borderWidth: 1,
        borderColor: '#fef3c7'
    },
    warningMsg: { fontSize: 13, color: '#b45309', fontWeight: '600' },

    bottomActions: { marginTop: 30 },
    dualActions: { flexDirection: 'row', gap: 12 },
    ignoreButton: {
        flex: 1,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        justifyContent: 'center',
        alignItems: 'center'
    },
    ignoreButtonText: { color: '#64748b', fontWeight: 'bold', fontSize: 14 },
    acceptButton: {
        flex: 2,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4
    },
    acceptButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },

    primaryActionButton: {
        height: 60,
        borderRadius: 18,
        backgroundColor: '#388e3c',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 4
    },
    primaryActionButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});
