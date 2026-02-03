import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { DemandeLivraison, StatutDemande } from '../../Types/DemandeLivraison';
import { DemandeLivraisonService } from '../../services/DemandeLivraisonService';
import { BASE_URL, LivreurService } from '../../services/LivreurService';

import { useAuth } from '../../context/AuthContext';
import { translateStatutDemande, translatePaiement } from '../../utils/translations';
import { useLivreur } from '../../hooks/useLivreur';
import { useHaptics } from '../../hooks/useHaptics';
import * as Haptics from 'expo-haptics';

const DemandeDetailScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { userId } = useAuth();
  const { demandeId } = route.params;

  const { impact, notification: hapticNotification } = useHaptics();
  const { profile, isBlockedByTotal, refreshProfile } = useLivreur();

  const [demande, setDemande] = useState<DemandeLivraison | null>(null);
  const [loading, setLoading] = useState(false);


  useEffect(() => {
    fetchDetail();
  }, [demandeId]);

  const fetchDetail = async () => {
    try {
      const data = await DemandeLivraisonService.getDemandeById(demandeId);
      setDemande(data);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de charger la demande');
      navigation.goBack();
    }
  };

  // Ouvrir la map (Google Maps ou Waze ou Apple Maps)
  // Ouvrir la map (Google Maps)
  const openMap = async (adresse: string) => {
    const query = encodeURIComponent(adresse);

    // Tentative d'ouverture via Google Maps Navigation directement
    const appUrl = Platform.select({
      ios: `comgooglemaps://?q=${query}&directionsmode=driving`,
      android: `google.navigation:q=${query}`
    });

    if (appUrl) {
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        Linking.openURL(appUrl);
        return;
      }
    }

    // Fallback: Si Google Maps n'est pas installé, on ouvre le lien web (ou Apple Maps via https)
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}&travelmode=driving`;
    Linking.openURL(webUrl);
  };

  // Action : Accepter la demande
  const handleAccept = async () => {
    if (!userId || !demande) return;

    if (isBlockedByTotal) {
      hapticNotification(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Plafond atteint",
        "Vous avez dépassé votre plafond de cash autorisé. Veuillez verser l'argent encaissé pour pouvoir accepter de nouvelles commandes.",
        [{ text: "Compris" }]
      );
      return;
    }

    setLoading(true);
    try {
      impact(Haptics.ImpactFeedbackStyle.Heavy);
      await DemandeLivraisonService.accepterDemande(demande.id, userId);
      Alert.alert('Succès', 'Vous avez accepté la course !');
      fetchDetail();
      refreshProfile();
    } catch (error) {
      Alert.alert('Erreur', 'Cette demande a probablement déjà été prise par un autre livreur.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  // Action : Changer statut (En cours, Livrée, Retour)
  const handleChangeStatus = async (newStatut: StatutDemande) => {
    setLoading(true);
    impact(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await DemandeLivraisonService.updateStatut(demande!.id, newStatut);
      if (newStatut === StatutDemande.LIVREE) {
        Alert.alert('Félicitations', 'Course terminée !');
        refreshProfile();
        navigation.goBack();
      } else {
        fetchDetail();
      }
    } catch (error) {
      Alert.alert('Erreur', 'Mise à jour échouée');
    } finally {
      setLoading(false);
    }
  };

  if (!demande) return (
    <View style={styles.center}>
      <Text>Chargement...</Text>
    </View>
  );

  const isMine = demande.livreurId === userId;
  const statusInfo = getStatusColor(demande.statut);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnWrapper}>
          <Ionicons name="chevron-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Détails Course</Text>
          <Text style={styles.headerSubtitle}>#{demande.id}</Text>
        </View>
        <View style={{ flex: 1 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Status Section */}
        <View style={styles.statusSection}>
          <View style={[styles.statusBadgeLarge, { backgroundColor: statusInfo.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusInfo.text }]} />
            <Text style={[styles.statusBadgeText, { color: statusInfo.text }]}>
              {translateStatutDemande(demande.statut).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.creationDate}>
            Déposée le {new Date(demande.createdAt).toLocaleDateString('fr-FR')} à {new Date(demande.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        {/* Itinerary Timeline */}
        <View style={styles.itineraryCard}>
          <Text style={styles.cardMainTitle}>Itinéraire</Text>

          {/* PICKUP */}
          <View style={styles.stepContainer}>
            <View style={styles.stepIndicator}>
              <View style={[styles.stepIcon, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="cube" size={18} color="#3b82f6" />
              </View>
              <View style={styles.stepLine} />
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTag}>DÉPART (RAMASSAGE)</Text>
              <Text style={styles.personName}>{demande.prenom} {demande.nom}</Text>
              <Text style={styles.addressLine}>{demande.adresseCourte}, {demande.quartier}</Text>
              <Text style={styles.cityLine}>{demande.ville}</Text>

              <View style={styles.miniActions}>
                <TouchableOpacity style={styles.miniBtn} onPress={() => Linking.openURL(`tel:${demande.telephone}`)}>
                  <Ionicons name="call" size={14} color="#3b82f6" />
                  <Text style={styles.miniBtnText}>Appeler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.miniBtn} onPress={() => openMap(`${demande.adresseCourte}, ${demande.ville}`)}>
                  <Ionicons name="location" size={14} color="#3b82f6" />
                  <Text style={styles.miniBtnText}>Itinéraire</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* DROP OFF */}
          <View style={styles.stepContainer}>
            <View style={styles.stepIndicator}>
              <View style={[styles.stepIcon, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="location" size={18} color="#10b981" />
              </View>
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTag, { color: '#10b981' }]}>ARRIVÉE (DESTINATION)</Text>
              <Text style={styles.personName}>{demande.prenomDestinataire} {demande.nomDestinataire}</Text>
              <Text style={styles.addressLine}>{demande.adresseCourteDestinataire}, {demande.quartierDestinataire}</Text>
              <Text style={styles.cityLine}>{demande.villeDestinataire}</Text>

              <View style={styles.miniActions}>
                <TouchableOpacity style={styles.miniBtn} onPress={() => Linking.openURL(`tel:${demande.telephoneDestinataire}`)}>
                  <Ionicons name="call" size={14} color="#10b981" />
                  <Text style={[styles.miniBtnText, { color: '#10b981' }]}>Appeler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.miniBtn} onPress={() => openMap(`${demande.adresseCourteDestinataire}, ${demande.villeDestinataire}`)}>
                  <Ionicons name="location" size={14} color="#10b981" />
                  <Text style={[styles.miniBtnText, { color: '#10b981' }]}>Itinéraire</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Details Grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <View style={styles.infoIconWrapper}>
              <Ionicons name="calendar" size={20} color="#64748b" />
            </View>
            <Text style={styles.infoLabel}>Date prévue</Text>
            <Text style={styles.infoValue}>{demande.dateLivraison}</Text>
            {demande.creneau && <Text style={styles.infoSubValue}>{demande.creneau}</Text>}
          </View>

          <View style={styles.infoBox}>
            <View style={styles.infoIconWrapper}>
              <Ionicons name="layers" size={20} color="#64748b" />
            </View>
            <Text style={styles.infoLabel}>Colis</Text>
            <Text style={styles.infoValue}>{demande.typeArticle || 'Standard'}</Text>
          </View>

          <View style={styles.infoBox}>
            <View style={styles.infoIconWrapper}>
              <Ionicons name="wallet" size={20} color="#64748b" />
            </View>
            <Text style={styles.infoLabel}>Paiement</Text>
            <Text style={styles.infoValue}>{translatePaiement(demande.methodePaiement || 'CASH')}</Text>
          </View>
        </View>

        {/* Action Bottom Section */}
        <View style={styles.bottomSection}>
          {demande.statut === StatutDemande.CONFIRMEE && (
            <View style={{ width: '100%' }}>
              {isBlockedByTotal && (
                <View style={[styles.warningContainer, { marginBottom: 15, backgroundColor: '#fee2e2', borderColor: '#fecaca' }]}>
                  <Ionicons name="alert-circle" size={18} color="#ef4444" />
                  <Text style={[styles.warningMsg, { color: '#991b1b' }]}>
                    Plafond dépassé ({profile?.cashbalance} TND). Versez votre solde pour accepter.
                  </Text>
                </View>
              )}
              <View style={styles.dualBtnRow}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => navigation.goBack()}
                >
                  <Text style={styles.btnSecondaryText}>IGNORER</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, isBlockedByTotal && { backgroundColor: '#94a3b8', elevation: 0 }]}
                  onPress={handleAccept}
                  disabled={loading || isBlockedByTotal}
                >
                  <Text style={styles.btnPrimaryText}>{isBlockedByTotal ? 'BLOQUÉ' : (loading ? 'Traitement...' : 'ACCEPTER COURSE')}</Text>
                  {!isBlockedByTotal && <Ionicons name="arrow-forward" size={20} color="white" />}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {isMine && (
            <View style={{ width: '100%' }}>
              {demande.statut === StatutDemande.ACCEPTEE && (
                <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: '#3b82f6' }]} onPress={() => handleChangeStatus(StatutDemande.EN_COURS)} disabled={loading}>
                  <Ionicons name="bicycle" size={22} color="white" />
                  <Text style={styles.btnPrimaryText}>DÉMARRER LA COURSE</Text>
                </TouchableOpacity>
              )}

              {demande.statut === StatutDemande.EN_COURS && (
                <View style={{ gap: 12 }}>
                  <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: '#10b981' }]} onPress={() => handleChangeStatus(StatutDemande.LIVREE)} disabled={loading}>
                    <Ionicons name="checkmark-done-circle" size={24} color="white" />
                    <Text style={styles.btnPrimaryText}>CONFIRMER LA LIVRAISON</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnOutlineRed} onPress={() => handleChangeStatus(StatutDemande.RETOUR)} disabled={loading}>
                    <Text style={styles.btnOutlineRedText}>SIGNALER UN RETOUR</Text>
                  </TouchableOpacity>
                </View>
              )}

              {demande.statut === StatutDemande.LIVREE && (
                <View style={styles.successPanel}>
                  <View style={styles.successCircle}>
                    <Ionicons name="checkmark" size={30} color="white" />
                  </View>
                  <Text style={styles.successTitle}>Course terminée</Text>
                  <Text style={styles.successSub}>Le colis a bien été livré.</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />

      </ScrollView>
    </SafeAreaView>
  );
};

const getStatusColor = (status: StatutDemande) => {
  switch (status) {
    case StatutDemande.CONFIRMEE: return { bg: '#faf5ff', text: '#a855f7' };
    case StatutDemande.ACCEPTEE: return { bg: '#fff7ed', text: '#ea580c' };
    case StatutDemande.EN_COURS: return { bg: '#eff6ff', text: '#3b82f6' };
    case StatutDemande.LIVREE: return { bg: '#f0fdf4', text: '#10b981' };
    case StatutDemande.RETOUR: return { bg: '#fff1f2', text: '#e11d48' };
    default: return { bg: '#f8fafc', text: '#64748b' };
  }
};

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
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  headerSubtitle: { fontSize: 13, color: '#64748b', fontWeight: '500' },

  scrollContent: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statusSection: { alignItems: 'center', marginBottom: 25 },
  statusBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusBadgeText: { fontSize: 14, fontWeight: 'bold' },
  creationDate: { fontSize: 12, color: '#94a3b8', marginTop: 10, fontWeight: '500' },

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
    shadowRadius: 10,
    marginBottom: 20
  },
  cardMainTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 20 },

  stepContainer: { flexDirection: 'row' },
  stepIndicator: { alignItems: 'center', width: 40, marginRight: 15 },
  stepIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', zIndex: 2, overflow: 'hidden' },
  detailIconImg: { width: 20, height: 20, resizeMode: 'contain' },
  stepLine: { flex: 1, width: 2, backgroundColor: '#f1f5f9', marginVertical: 4 },
  stepContent: { flex: 1, paddingBottom: 25 },
  stepTag: { fontSize: 10, color: '#3b82f6', fontWeight: '800', marginBottom: 6 },
  personName: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  addressLine: { fontSize: 14, color: '#475569', marginTop: 3 },
  cityLine: { fontSize: 14, color: '#94a3b8', marginTop: 1 },

  miniActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  miniBtnText: { fontSize: 12, fontWeight: '700', color: '#3b82f6' },

  infoGrid: { flexDirection: 'row', gap: 12, marginBottom: 25 },
  infoBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  infoIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  infoLabel: { fontSize: 11, color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  infoValue: { fontSize: 13, fontWeight: 'bold', color: '#1e293b', textAlign: 'center' },
  infoSubValue: { fontSize: 10, color: '#3b82f6', fontWeight: 'bold', marginTop: 2 },

  bottomSection: { marginTop: 10 },
  dualBtnRow: { flexDirection: 'row', gap: 12 },
  btnSecondary: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center'
  },
  btnSecondaryText: { color: '#64748b', fontWeight: 'bold', fontSize: 14 },
  btnPrimary: {
    flex: 2,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    elevation: 4,
    shadowColor: '#1e293b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5
  },
  btnPrimaryText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },

  btnOutlineRed: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff1f2'
  },
  btnOutlineRedText: { color: '#ef4444', fontWeight: 'bold', fontSize: 14 },

  successPanel: {
    backgroundColor: '#f0fdf4',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dcfce7'
  },
  successCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    elevation: 3
  },
  successTitle: { fontSize: 20, fontWeight: 'bold', color: '#166534' },
  successSub: { fontSize: 14, color: '#15803d', marginTop: 5 },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fef3c7'
  },
  warningMsg: { fontSize: 13, color: '#b45309', fontWeight: '600' },
});

export default DemandeDetailScreen;
