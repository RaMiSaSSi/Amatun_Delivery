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
    const [boutique, setBoutique] = useState<Boutique | null>(null);
    const [boutiqueAddress, setBoutiqueAddress] = useState<Adresse | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSingleBoutique, setIsSingleBoutique] = useState(false);
    const [driverLocation, setDriverLocation] = useState<Location.LocationObject | null>(null);
    const [distances, setDistances] = useState({ toBoutique: 0, toClient: 0 });
    const mapRef = React.useRef<MapView | null>(null);
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

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371; // Radius of the earth in km
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
            ;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in km
        return d;
    };

    const deg2rad = (deg: number) => {
        return deg * (Math.PI / 180);
    };

    useEffect(() => {
        loadDetails();
    }, [commandeId]);

    useEffect(() => {
        if (!boutiqueAddress || !commande) return;

        let distToBout = 0;
        let distToClient = 0;

        if (driverLocation && boutiqueAddress.latitude && boutiqueAddress.longitude) {
            distToBout = calculateDistance(
                driverLocation.coords.latitude,
                driverLocation.coords.longitude,
                boutiqueAddress.latitude,
                boutiqueAddress.longitude
            );
        }

        if (boutiqueAddress.latitude && boutiqueAddress.longitude && commande.adresse?.latitude && commande.adresse?.longitude) {
            distToClient = calculateDistance(
                boutiqueAddress.latitude,
                boutiqueAddress.longitude,
                commande.adresse.latitude,
                commande.adresse.longitude
            );
        }

        setDistances({ toBoutique: distToBout, toClient: distToClient });

        // Auto-center map to show all relevant points
        if (mapRef.current) {
            const coordinates = [];
            if (driverLocation) coordinates.push({ latitude: driverLocation.coords.latitude, longitude: driverLocation.coords.longitude });
            if (boutiqueAddress.latitude && boutiqueAddress.longitude) coordinates.push({ latitude: boutiqueAddress.latitude, longitude: boutiqueAddress.longitude });
            if (commande.adresse?.latitude && commande.adresse?.longitude) coordinates.push({ latitude: commande.adresse.latitude, longitude: commande.adresse.longitude });

            if (coordinates.length > 0) {
                mapRef.current.fitToCoordinates(coordinates, {
                    edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
                    animated: true,
                });
            }
        }
    }, [driverLocation, boutiqueAddress, commande]);

    const loadDetails = async () => {
        try {
            const data = await LivreurService.getCommandeDetails(commandeId);
            setCommande(data);

            if (data && data.produits && data.produits.length > 0) {
                // Fetch details for all products
                const prodPromises = data.produits.map((p: any) => LivreurService.getProduitById(p.produitId));
                const prods = await Promise.all(prodPromises);
                setProductsDetails(prods);

                // Check if all products are from the same boutique
                const boutiqueIds = prods.map(p => p.boutiqueId);
                const uniqueBoutiqueIds = [...new Set(boutiqueIds)];
                const isSingle = uniqueBoutiqueIds.length === 1 && uniqueBoutiqueIds[0] != null;
                setIsSingleBoutique(isSingle);

                if (isSingle) {
                    const boutId = uniqueBoutiqueIds[0];
                    const bout = await LivreurService.getBoutiqueById(boutId);
                    setBoutique(bout);

                    // Retrieve full address if we have an address ID
                    if (bout.adresseId) {
                        const addr = await LivreurService.getAdresseById(bout.adresseId);
                        setBoutiqueAddress(addr);
                    }
                } else {
                    // Reset boutique info if multiple shops (not handled yet for navigation)
                    setBoutique(null);
                    setBoutiqueAddress(null);
                }
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
        try {
            await LivreurService.acceptCommande(commande.id, userId);
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
        try {
            await LivreurService.updateStatut(commande.id, Statut.SHIPPED);
            Alert.alert("Livraison commencée", "Vous allez être redirigé vers l'adresse du client.");

            // Redirect to user address IF single boutique (as requested)
            if (isSingleBoutique && commande.adresse) {
                openMap(
                    `${commande.adresse.rue}, ${commande.adresse.delegation}, ${commande.adresse.gouvernerat}, Tunisia`,
                    commande.adresse.latitude,
                    commande.adresse.longitude
                );
            }

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

                {/* Boutique info */}
                {boutique && (
                    <View style={styles.premiumCard}>
                        <View style={styles.cardHeaderSmall}>
                            <Ionicons name="storefront" size={20} color="#10b981" />
                            <Text style={styles.premiumCardTitle}>Boutique</Text>
                        </View>

                        <View style={styles.premiumCardBody}>
                            <Text style={styles.shopName}>{boutique.nom}</Text>
                            <View style={styles.infoLine}>
                                <Ionicons name="call-outline" size={14} color="#64748b" />
                                <Text style={styles.infoLineText}>{boutique.telephone}</Text>
                            </View>

                            {boutiqueAddress && (
                                <View style={styles.addressBox}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.addressText}>
                                            {boutiqueAddress.rue}, {boutiqueAddress.delegation}, {boutiqueAddress.gouvernerat}
                                        </Text>
                                        {distances.toBoutique > 0 && (
                                            <Text style={styles.distanceInfo}>
                                                <Ionicons name="navigate" size={12} /> À {distances.toBoutique.toFixed(1)} km
                                            </Text>
                                        )}
                                    </View>
                                    <View style={styles.actionButtons}>
                                        <TouchableOpacity
                                            onPress={() => openMap(
                                                `${boutiqueAddress.rue}, ${boutiqueAddress.delegation}, ${boutiqueAddress.gouvernerat}, Tunisia`,
                                                boutiqueAddress.latitude,
                                                boutiqueAddress.longitude
                                            )}
                                            style={styles.circleActionBtn}
                                        >
                                            <Ionicons name="location" size={22} color="#3b82f6" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => boutiqueAddress.latitude && boutiqueAddress.longitude && showNavigationInApp(boutiqueAddress.latitude, boutiqueAddress.longitude, boutique.nom)}
                                            style={[styles.circleActionBtn, { backgroundColor: '#ecfdf5' }]}
                                        >
                                            <Ionicons name="map" size={22} color="#10b981" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>
                )}

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
                                    <Image source={require('../../../assets/Delivery.png')} style={styles.placeholderImg} />
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
                        <View style={styles.dualActions}>
                            <TouchableOpacity
                                onPress={() => navigation.goBack()}
                                style={styles.ignoreButton}
                            >
                                <Text style={styles.ignoreButtonText}>IGNORER</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleAccept} style={styles.acceptButton}>
                                <Text style={styles.acceptButtonText}>ACCEPTER</Text>
                            </TouchableOpacity>
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
                                <TouchableOpacity onPress={handleMarkAsDelivered} style={[styles.primaryActionButton, { backgroundColor: '#10b981' }]}>
                                    <Ionicons name="checkmark-done" size={22} color="white" />
                                    <Text style={styles.primaryActionButtonText}>MARQUER COMME LIVRÉ</Text>
                                </TouchableOpacity>
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
