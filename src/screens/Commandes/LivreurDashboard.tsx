import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
  StatusBar, AppState, AppStateStatus, ActivityIndicator, Image, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio'; // Pour le son de notification

import { LivreurService } from '../../services/LivreurService';
import { WebSocketService } from '../../services/websocket';
import { Commande, Statut, GrandeCommande } from '../../Types/types';
import { useAuth } from '../../context/AuthContext';
import { MoyenTransport } from '../../Types/auth';
import { translateStatut, translateStatutDemande } from '../../utils/translations';
import { NotificationService } from '../../services/NotificationService';
import { useLivreur } from '../../hooks/useLivreur';
import { useCommandes } from '../../hooks/useCommandes';
import { useGrandeCommande } from '../../hooks/useGrandeCommande';
import { useHaptics } from '../../hooks/useHaptics';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';



export default function LivreurDashboard() {
  const navigation = useNavigation<any>();
  const { logout, userId } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [ignoredOrderIds, setIgnoredOrderIds] = useState<number[]>([]);
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});

  const { impact, notification: hapticNotification } = useHaptics();
  const { profile, isBlockedByTotal, isBlockedForCmd, refreshProfile, getDeliveryFee } = useLivreur();
  const [activeTab, setActiveTab] = useState<'SINGLE' | 'GROUPS'>('SINGLE');

  const {
    commandes: remoteCommandes,
    isLoading,
    isRefetching,
    refetch: refetchCommandes,
    accept,
    updateStatut
  } = useCommandes(selectedDate, activeTab === 'SINGLE');

  const {
    grandesCommandes,
    isLoading: isLoadingGroups,
    refetch: refetchGroups,
    accept: acceptGroup,
    isAccepting: isAcceptingGroup
  } = useGrandeCommande(activeTab === 'GROUPS');

  // Local state for real-time responsiveness
  const [commandes, setCommandes] = useState<Commande[]>([]);

  useEffect(() => {
    if (remoteCommandes) setCommandes(remoteCommandes);
  }, [remoteCommandes]);

  const player = useAudioPlayer(require('../../../assets/Notification.mp3'));

  const playNotificationSound = async () => {
    try {
      player.play();
    } catch (error) {
      console.log('Erreur son notification', error);
    }
  };

  const fetchDayCounts = async () => {
    const datesList = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      datesList.push(d.toISOString().split('T')[0]);
    }

    const counts: Record<string, number> = {};
    try {
      await Promise.all(datesList.map(async (date) => {
        try {
          const count = await LivreurService.countConfirmedCommandesByDate(date);
          counts[date] = count;
        } catch (e) { }
      }));
      setDayCounts(counts);
    } catch (e) {
      console.error("Error fetching day counts", e);
    }
  };

  useEffect(() => {
    fetchDayCounts();
  }, [selectedDate]);

  // WebSocket
  useEffect(() => {
    if (!userId) return;

    console.log('🔌 Initialisation WebSocket pour Livreur:', userId);
    const ws = new WebSocketService((msg) => {
      console.log('🔔 Dashboard WebSocket Callback:', msg.type);

      if (msg.type === 'NEW_ORDER') {
        const notif = msg.data;
        console.log('🆕 Nouvelle notification de commande reçue:', notif.entityId);

        playNotificationSound();
        NotificationService.presentLocalNotification(
          notif.title || "📦 Nouvelle Commande !",
          notif.message || `Une nouvelle commande (#${notif.entityId}) est disponible.`
        );
        Alert.alert(notif.title || "Nouvelle Commande", notif.message || `Commande #${notif.entityId} disponible !`);
        
        // Refresh orders from server to get full data
        refetchCommandes();

      } else if (msg.type === 'ORDER_ACCEPTED') {
        const notif = msg.data;
        console.log('✅ Commande acceptée via Notification:', notif.entityId);
        
        // Refresh to sync lists
        refetchCommandes();
        refreshProfile();

      } else if (msg.type === 'PERSONAL_NOTIFICATION') {
        const notif = msg.data;
        console.log('🔔 Notification personnelle reçue');
        playNotificationSound();
        NotificationService.presentLocalNotification(
          notif.title || "🔔 Notification",
          notif.message || "Message reçu"
        );
        Alert.alert(notif.title || "Notification", notif.message || "Message reçu");
        refetchCommandes();
        refreshProfile();
      } else if (msg.type === 'GRANDE_COMMANDE') {
        const notif = msg.data;
        console.log('📦 Notification GROUPE reçue:', notif.entityId);
        playNotificationSound();
        hapticNotification(Haptics.NotificationFeedbackType.Success);

        NotificationService.presentLocalNotification(
          notif.title || "📦 Nouveau Groupe !",
          notif.message || `Un nouveau groupe de commandes vous attend.`
        );

        Alert.alert(
          notif.title || "Nouveau Groupe",
          notif.message || `Un nouveau groupe de commandes vous attend.`,
          [
            { text: "Plus tard", style: "cancel" },
            { text: "Voir", onPress: () => navigation.navigate('GrandeCommandeDetail', { grandeCommandeId: notif.entityId }) }
          ]
        );

        refetchGroups();
      } else if (msg.type === 'NEW_DEMANDE') {
        const notif = msg.data;
        console.log('🚲 Notification DEMANDE reçue:', notif.entityId);
        
        playNotificationSound();
        NotificationService.presentLocalNotification(
          notif.title || "🚲 Nouvelle Demande !",
          notif.message || `Une nouvelle demande de livraison (#${notif.entityId}) est disponible.`
        );
        Alert.alert(notif.title || "Nouvelle Demande", notif.message || `Demande #${notif.entityId} disponible !`);
        
        // Refresh demandes
        refetchDemandes();
      }
    }, userId);

    // Écouter le changement d'état de l'app (Arrière-plan -> Premier plan)
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('App revenue au premier plan (Dashboard), rafraîchissement...');
        refetchCommandes();
        refetchGroups();
        refreshProfile();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    ws.activate();

    return () => {
      console.log('🔌 Nettoyage WebSocket et AppState');
      subscription.remove();
      ws.deactivate();
    };
  }, [userId]); // On ne dépend plus de selectedDate ici pour ne pas réinitialiser le WS inutilement

  const handleStatutChange = async (cmd: Commande, newStatut: Statut) => {
    impact(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await updateStatut({ cmdId: cmd.id, statut: newStatut });
      // WS and React Query will handle UI updates
    } catch (error) {
      console.error(error);
      Alert.alert('Erreur', 'Mise à jour échouée');
    }
  };




  const isBlockedForSingle = (cmd: Commande) => {
    if (!profile) return false;
    const fee = getDeliveryFee(cmd);
    const balance = profile.cashbalance || 0;
    const limit = (profile.plafond || 0) + 10;
    return balance + fee >= limit;
  };

  const handleAccept = async (cmd: Commande) => {
    if (!userId) return;

    if (isBlockedForSingle(cmd)) {
      hapticNotification(Haptics.NotificationFeedbackType.Warning);
      const fee = getDeliveryFee(cmd);
      Alert.alert(
        "Plafond atteint",
        `En acceptant cette commande (+${fee} TND de frais), vous dépasserez votre plafond de cash autorisé. Veuillez verser l'argent encaissé pour continuer.`,
        [{ text: "Compris" }]
      );
      return;
    }

    try {
      impact(Haptics.ImpactFeedbackStyle.Heavy);
      await accept(cmd.id);
      Alert.alert('Succès', 'Commande acceptée !');
      navigation.navigate('CommandeDetails', { commandeId: cmd.id });
    } catch (error: any) {
      if (error.response?.status === 409) {
        Alert.alert('Trop tard', 'Cette commande a déjà été prise.');
        refetchCommandes();
      } else {
        Alert.alert('Erreur', 'Impossible d\'accepter la commande');
      }
    }
  };

  const handleAcceptGroup = async (gc: GrandeCommande) => {
    try {
      impact(Haptics.ImpactFeedbackStyle.Heavy);
      await acceptGroup(gc.id);
      Alert.alert('Succès', 'Groupe accepté !');
      navigation.navigate('GrandeCommandeDetail', { grandeCommandeId: gc.id, initialData: gc });
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'accepter le groupe');
    }
  };

  const isBlockingForGroupSelection = (gc: GrandeCommande) => {
    const balance = profile?.cashbalance || 0;
    const limit = (profile?.plafond || 0) + 10;
    return balance + (gc.totalPrixLivraison || 0) >= limit;
  };

  const handleIgnore = (orderId: number) => {
    Alert.alert(
      "Ignorer la commande",
      "Voulez-vous masquer cette commande de votre liste ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Ignorer",
          style: "destructive",
          onPress: () => setIgnoredOrderIds(prev => [...prev, orderId])
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: Commande }) => {
    const isAssignedToMe = item.livreurId === userId;

    // Logique de badge identique Angular
    let badgeStyle = styles.badgeDefault;
    let textStyle = styles.badgeTextDefault;

    if (item.statut === Statut.CONFIRMED || item.statut === Statut.EN_COURS_DE_RETOUR) { badgeStyle = styles.badgePurple; textStyle = { color: '#6b21a8' } }
    else if (item.statut === Statut.SHIPPED) { badgeStyle = styles.badgeOrange; textStyle = { color: '#9a3412' } }
    else if (item.statut === Statut.DELIVERED) { badgeStyle = styles.badgeEmerald; textStyle = { color: '#065f46' } }
    else if (item.statut === Statut.EN_COURS_D_ECHANGE) { badgeStyle = styles.badgeIndigo; textStyle = { color: '#3730a3' } }

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => (navigation as any).navigate('CommandeDetails', { commandeId: item.id })}
      >
        {/* Header Carte */}
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>
            <Ionicons name="cube-outline" size={20} color="#059669" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.orderId}>#{item.id}</Text>
            {item.livreurId ? (
              <Text style={styles.assignedTo}>
                Assigné à: {isAssignedToMe ? 'Moi' : `Livreur ${item.livreurId}`}
              </Text>
            ) : (
              <Text style={{ fontSize: 10, color: '#d97706', marginTop: 2 }}>En attente d'acceptation</Text>
            )}
          </View>
          <View style={[styles.badge, badgeStyle]}>
            <Text style={[styles.badgeText, textStyle]}>{translateStatut(item.statut)}</Text>
          </View>
        </View>

        {/* Info Client */}
        <View style={styles.cardBody}>
          <View style={styles.row}>
            <Ionicons name="person-outline" size={14} color="gray" />
            <Text style={styles.infoText}>{item.nom} {item.prenom}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="location-outline" size={14} color="gray" />
            <Text style={styles.infoText}>{item.adresse?.rue}, {item.adresse?.delegation}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="call-outline" size={14} color="gray" />
            <Text style={styles.infoText}>{item.numTel}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.itemCount}>{item.produits?.length || 0} articles</Text>
            <Text style={styles.totalPrice}>{item.prixTotalAvecLivraison} TND</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.cardFooter}>
          {/* Bouton Accepter / Ignorer (Visible si CONFIRMED et pas encore assigné) */}
          {(item.statut === Statut.CONFIRMED && !isAssignedToMe) && (
            <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => handleIgnore(item.id)} style={styles.btnIgnore}>
                <Text style={styles.btnTextIgnore}>Ignorer</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleAccept(item)} style={styles.btnPrimary}>
                <Text style={styles.btnTextPrimary}>Accepter</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Actions si assigné à MOI */}
          {isAssignedToMe && (
            <>
              {item.statut === Statut.ACCEPTED && (
                <TouchableOpacity onPress={() => handleStatutChange(item, Statut.SHIPPED)} style={styles.btnOrange}>
                  <Text style={styles.btnTextWhite}>Commencer Livraison</Text>
                </TouchableOpacity>
              )}
              {item.statut === Statut.SHIPPED && (
                <TouchableOpacity onPress={() => handleStatutChange(item, Statut.DELIVERED)} style={styles.btnSuccess}>
                  <Text style={styles.btnTextWhite}>Livré</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const mergedItems = useMemo(() => {
    return commandes.filter(item => {
      if (ignoredOrderIds.includes(item.id)) return false;

      if (item.statut === Statut.CONFIRMED) return true;
      if (item.livreurId === userId) return true;
      return false;
    }).sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  }, [commandes, userId, ignoredOrderIds]);

  const dates = useMemo(() => {
    const list = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      list.push({
        full: d.toISOString().split('T')[0],
        dayName: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        dayNum: d.getDate(),
      });
    }
    return list;
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnWrapper}>
            <Ionicons name="chevron-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitleText}>Tableau de Bord</Text>
            <Text style={styles.headerSubtitleText}>
              {activeTab === 'SINGLE' ? `${mergedItems.length} livraisons` : `${grandesCommandes.length} groupes`}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={logout} style={styles.iconBtn}>
          <Ionicons name="log-out" size={22} color="#ef4444" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'SINGLE' && styles.tabBtnActive]}
            onPress={() => { impact(Haptics.ImpactFeedbackStyle.Light); setActiveTab('SINGLE'); }}
          >
            <Ionicons name="cube" size={18} color={activeTab === 'SINGLE' ? '#10b981' : '#94a3b8'} />
            <Text style={[styles.tabBtnText, activeTab === 'SINGLE' && styles.tabBtnTextActive]}>Individuelles</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'GROUPS' && styles.tabBtnActive]}
            onPress={() => { impact(Haptics.ImpactFeedbackStyle.Light); setActiveTab('GROUPS'); }}
          >
            <Ionicons name="layers" size={18} color={activeTab === 'GROUPS' ? '#10b981' : '#94a3b8'} />
            <Text style={[styles.tabBtnText, activeTab === 'GROUPS' && styles.tabBtnTextActive]}>Groupées</Text>
            {grandesCommandes.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{grandesCommandes.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Date filter container (only for single orders) */}
        {activeTab === 'SINGLE' && (
          <View style={styles.dateFilterOuter}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={dates}
              keyExtractor={(item) => item.full}
              contentContainerStyle={styles.dateList}
              renderItem={({ item }) => {
                const isSelected = item.full === selectedDate;
                const isToday = item.full === new Date().toISOString().split('T')[0];

                return (
                  <TouchableOpacity
                    onPress={() => setSelectedDate(item.full)}
                    style={[
                      styles.dateBtn,
                      isSelected && styles.dateBtnSelected,
                    ]}
                  >
                    <Text style={[styles.dateDayName, isSelected && styles.dateTextSelected]}>
                      {item.dayName.toUpperCase()}
                    </Text>
                    <Text style={[styles.dateDayNum, isSelected && styles.dateTextSelected]}>
                      {item.dayNum}
                    </Text>
                    {dayCounts[item.full] > 0 && (
                      <View style={[styles.miniBadgeBubble, isSelected ? { backgroundColor: '#ffffff' } : { backgroundColor: '#10b981' }]}>
                        <Text style={[styles.miniBadgeText, isSelected && { color: '#10b981' }]}>
                          {dayCounts[item.full]}
                        </Text>
                      </View>
                    )}
                    {isToday && !isSelected && <View style={styles.todayDotIndicator} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* Blocked Warning Banner */}
        {isBlockedByTotal && (
          <View style={styles.blockedBanner}>
            <View style={styles.blockedBannerIcon}>
              <Ionicons name="alert-circle" size={24} color="#ef4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.blockedBannerText}>Plafond dépassé</Text>
              <Text style={styles.blockedBannerSub}>Versez votre solde ({profile?.cashbalance} TND) pour continuer.</Text>
            </View>
          </View>
        )}

        {/* List */}
        {(isLoading || isLoadingGroups) && !isRefetching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.loadingText}>Chargement...</Text>
          </View>
        ) : activeTab === 'SINGLE' ? (
          <View style={styles.listContent}>
            {mergedItems.length === 0 ? (
              <View style={styles.emptyContent}>
                <Ionicons name="document-text-outline" size={64} color="#cbd5e1" />
                <Text style={styles.emptyLabelText}>Aucune livraison</Text>
                <Text style={styles.emptySubLabelText}>Il n'y a pas de livraisons pour cette date.</Text>
              </View>
            ) : (
              mergedItems.map((item) => {
                const isAssignedToMe = item.livreurId === userId;
                let revenue = item.prixTotalAvecLivraison;
                let badgeStyle = styles.badgeDefault;
                let textStyle = styles.badgeTextDefault;
                let displayStatut = translateStatut(item.statut);

                if (item.statut === Statut.CONFIRMED || item.statut === Statut.EN_COURS_DE_RETOUR) { badgeStyle = styles.badgePurple; textStyle = { color: '#6b21a8' } }
                else if (item.statut === Statut.SHIPPED) { badgeStyle = styles.badgeOrange; textStyle = { color: '#9a3412' } }
                else if (item.statut === Statut.DELIVERED) { badgeStyle = styles.badgeEmerald; textStyle = { color: '#065f46' } }
                else if (item.statut === Statut.EN_COURS_D_ECHANGE) { badgeStyle = styles.badgeIndigo; textStyle = { color: '#3730a3' } }

                return (
                  <TouchableOpacity
                    key={`COMMANDE-${item.id}`}
                    style={styles.card}
                    activeOpacity={0.9}
                    onPress={() => {
                      navigation.navigate('CommandeDetails', { commandeId: item.id });
                    }}
                  >
                    <View style={styles.cardHeader}>
                      <View style={[styles.cardIconBox, { backgroundColor: '#ecfdf5' }]}>
                        <Ionicons name="cube" size={20} color="#059669" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.orderId}>CMD #{item.id}</Text>
                        <Text style={styles.assignedTo} numberOfLines={1}>
                          {item.nom} {item.prenom}
                        </Text>
                      </View>
                      <View style={[styles.badge, badgeStyle]}>
                        <Text style={[styles.badgeText, textStyle]}>{displayStatut.toUpperCase()}</Text>
                      </View>
                    </View>

                    <View style={styles.cardBody}>
                      <View style={styles.row}>
                        <Ionicons name="location" size={14} color="#64748b" />
                        <Text style={styles.infoText} numberOfLines={1}>
                          {item.adresse?.rue}, {item.adresse?.delegation}
                        </Text>
                      </View>
                      <View style={styles.totalRow}>
                        <View style={styles.priceTag}>
                          <Text style={styles.priceTagText}>{revenue?.toFixed(2)} TND</Text>
                        </View>
                        <Text style={styles.itemCount}>{item.produits?.length || 0} articles</Text>
                      </View>
                    </View>

                    <View style={styles.cardFooter}>
                      {(item.statut === Statut.CONFIRMED && !isAssignedToMe) ? (
                        <View style={styles.dualActions}>
                          <TouchableOpacity onPress={() => handleIgnore(item.id)} style={styles.btnIgnore}>
                            <Text style={styles.btnTextIgnore}>Ignorer</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleAccept(item)}
                            style={[styles.btnPrimary, isBlockedForSingle(item) && styles.btnDisabled]}
                            disabled={isBlockedForSingle(item)}
                          >
                            <Text style={styles.btnTextPrimary}>{isBlockedForSingle(item) ? 'Bloqué' : 'Accepter'}</Text>
                          </TouchableOpacity>
                        </View>
                      ) : isAssignedToMe && (
                        <View style={{ width: '100%' }}>
                          {(item.statut === Statut.ACCEPTED) && (
                            <TouchableOpacity
                              onPress={() => handleStatutChange(item, Statut.SHIPPED)}
                              style={styles.primaryActionButton}
                            >
                              <Text style={styles.primaryActionButtonText}>Lancer la Livraison</Text>
                            </TouchableOpacity>
                          )}
                          {(item.statut === Statut.SHIPPED) && (
                            <TouchableOpacity
                              onPress={() => handleStatutChange(item, Statut.DELIVERED)}
                              style={[styles.primaryActionButton, { backgroundColor: '#10b981' }]}
                            >
                              <Text style={styles.primaryActionButtonText}>Marquer comme Livré</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        ) : (
          <View style={styles.listContent}>
            {grandesCommandes.length === 0 ? (
              <View style={styles.emptyContent}>
                <Ionicons name="layers-outline" size={64} color="#cbd5e1" />
                <Text style={styles.emptyLabelText}>Aucun groupe</Text>
                <Text style={styles.emptySubLabelText}>Aucun groupe de livraison disponible.</Text>
              </View>
            ) : (
              grandesCommandes.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.card}
                  activeOpacity={0.9}
                  onPress={() => navigation.navigate('GrandeCommandeDetail', { grandeCommandeId: item.id, initialData: item })}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.cardIconBox, { backgroundColor: '#ecfdf5' }]}>
                      <Ionicons name="layers" size={20} color="#10b981" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.orderId}>Groupe {item.code}</Text>
                      <Text style={styles.assignedTo}>{item.commandes?.length || 0} commandes groupées</Text>
                    </View>
                    <View style={[styles.badge, (item.statut === Statut.ACCEPTED || item.statut === Statut.CONFIRMED) ? styles.badgeEmerald : styles.badgeDefault]}>
                      <Text style={[styles.badgeText, (item.statut === Statut.ACCEPTED || item.statut === Statut.CONFIRMED) ? { color: '#065f46' } : { color: '#64748b' }]}>
                        {translateStatut(item.statut as Statut).toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.totalRow}>
                    <View style={[styles.priceTag, profile?.moyen === MoyenTransport.MOTO && { backgroundColor: '#fffbeb' }]}>
                      <Text style={[styles.priceTagText, profile?.moyen === MoyenTransport.MOTO && { color: '#d97706' }]}>
                        {profile?.moyen === MoyenTransport.MOTO
                          ? `${(item.commandes?.length || 0) * 5} TND`
                          : `${item.totalPrixLivraison} TND`}
                      </Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {(item.statut === 'PENDING' || item.statut === 'CONFIRMED') && !item.livreurId ? (
                        <TouchableOpacity
                          style={styles.viewDetailBtn}
                          onPress={() => handleAcceptGroup(item)}
                          disabled={isBlockingForGroupSelection(item)}
                        >
                          <Text style={styles.viewDetailText}>Accepter</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.viewDetailBtn}
                          onPress={() => navigation.navigate('GrandeCommandeDetail', { grandeCommandeId: item.id, initialData: item })}
                        >
                          <Text style={styles.viewDetailText}>Voir Détails</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  backBtnWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerTitleText: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  headerSubtitleText: { fontSize: 13, color: '#64748b', fontWeight: '600', marginTop: 1 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 15,
    paddingBottom: 5,
    gap: 12
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    gap: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  tabBtnActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981'
  },
  tabBtnText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  tabBtnTextActive: { color: '#059669' },
  tabBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4
  },
  tabBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  dateFilterOuter: {
    backgroundColor: 'white',
    paddingVertical: 15,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 4,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10
  },
  dateList: { paddingHorizontal: 20, gap: 12 },
  dateBtn: {
    width: 60,
    height: 75,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  dateBtnSelected: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
    elevation: 6,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  dateDayName: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold', marginBottom: 4 },
  dateDayNum: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  dateTextSelected: { color: 'white' },
  todayDotIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#10b981',
    marginTop: 4
  },
  listContent: { padding: 20, paddingTop: 10 },
  card: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center'
  },
  orderId: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' },
  assignedTo: { fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  cardBody: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 14, color: '#475569', fontWeight: '500', flex: 1 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  priceTag: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1fae5'
  },
  priceTagText: { fontSize: 16, fontWeight: 'bold', color: '#059669' },
  itemCount: { fontSize: 13, color: '#94a3b8', fontWeight: '700' },
  cardFooter: { marginTop: 15 },
  dualActions: { flexDirection: 'row', gap: 10 },
  btnIgnore: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center'
  },
  btnTextIgnore: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  btnPrimary: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8
  },
  btnTextPrimary: { fontSize: 14, fontWeight: '700', color: 'white' },
  btnDisabled: { backgroundColor: '#cbd5e1', shadowOpacity: 0 },
  primaryActionButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8
  },
  primaryActionButtonText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  btnOrange: { backgroundColor: '#f97316', paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  btnSuccess: { backgroundColor: '#10b981', paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  btnTextWhite: { color: 'white', fontWeight: 'bold' },
  iconContainer: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  totalPrice: { fontSize: 16, fontWeight: 'bold', color: '#059669' },
  // Badges
  badgeDefault: { backgroundColor: '#f1f5f9' },
  badgeTextDefault: { color: '#64748b' },
  badgePurple: { backgroundColor: '#f3e8ff' },
  badgeOrange: { backgroundColor: '#ffedd5' },
  badgeEmerald: { backgroundColor: '#d1fae5' },
  badgeIndigo: { backgroundColor: '#e0e7ff' },
  // Date filter mini bubble
  miniBadgeBubble: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'white'
  },
  miniBadgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
  // Banner
  blockedBanner: {
    flexDirection: 'row',
    backgroundColor: '#fef2f2',
    margin: 20,
    marginTop: 0,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fee2e2',
    alignItems: 'center',
    gap: 12
  },
  blockedBannerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' },
  blockedBannerText: { fontSize: 15, fontWeight: 'bold', color: '#991b1b' },
  blockedBannerSub: { fontSize: 13, color: '#ef4444', marginTop: 1 },
  // Loading & Empty
  loadingContainer: { flex: 1, padding: 40, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: '#64748b', fontWeight: '600' },
  emptyContent: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyLabelText: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginTop: 16 },
  emptySubLabelText: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8 },
  viewDetailBtn: { backgroundColor: '#10b981', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  viewDetailText: { color: 'white', fontWeight: 'bold', fontSize: 13 }
});