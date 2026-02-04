import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
  StatusBar, AppState, AppStateStatus, ActivityIndicator, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio'; // Pour le son de notification

import { LivreurService } from '../../services/LivreurService';
import { WebSocketService } from '../../services/websocket';
import { Commande, Statut } from '../../Types/types';
import { useAuth } from '../../context/AuthContext';
import { MoyenTransport } from '../../Types/auth';
import { translateStatut } from '../../utils/translations';
import { NotificationService } from '../../services/NotificationService';
import { useLivreur } from '../../hooks/useLivreur';
import { useCommandes } from '../../hooks/useCommandes';
import { useGrandeCommande } from '../../hooks/useGrandeCommande';
import { useHaptics } from '../../hooks/useHaptics';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { GrandeCommande } from '../../Types/GrandeCommande.model';


export default function LivreurDashboard() {
  const navigation = useNavigation<any>();
  const { logout, userId } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [ignoredOrderIds, setIgnoredOrderIds] = useState<number[]>([]);
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});

  const { impact, notification: hapticNotification } = useHaptics();
  const { profile, isBlockedByTotal, isBlockedForCmd, refreshProfile, getDeliveryFee } = useLivreur();
  const {
    commandes: remoteCommandes,
    isLoading,
    isRefetching,
    refetch: refetchCommandes,
    accept,
    updateStatut
  } = useCommandes(selectedDate);

  const {
    grandesCommandes,
    isLoading: isLoadingGroups,
    refetch: refetchGroups,
    accept: acceptGroup,
    isAccepting: isAcceptingGroup
  } = useGrandeCommande();

  const [activeTab, setActiveTab] = useState<'SINGLE' | 'GROUPS'>('SINGLE');

  // Local state for real-time responsiveness if needed, but we can rely on React Query
  // For now, let's keep a local list that merges server data + WS updates
  const [commandes, setCommandes] = useState<Commande[]>([]);

  useEffect(() => {
    if (remoteCommandes) {
      setCommandes(remoteCommandes);
    }
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
        const newCmd = msg.data;
        console.log('🆕 Nouvelle commande reçue via WS:', newCmd.id);

        setCommandes(prev => {
          // Utilisation de .some() pour une vérification plus claire
          if (prev.some(c => c.id === newCmd.id)) {
            console.log('⚠️ Commande déjà présente, ignorée.');
            return prev;
          }
          console.log('✅ Ajout de la commande à la liste.');
          playNotificationSound();
          NotificationService.presentLocalNotification(
            "📦 Nouvelle Commande !",
            `La commande #${newCmd.id} est maintenant disponible.`
          );
          Alert.alert("Nouvelle Commande", `Commande #${newCmd.id} disponible !`);
          // Ajout en haut de la liste, en gardant le tri existant
          return [newCmd, ...prev].sort((a, b) => b.id - a.id);
        });

      } else if (msg.type === 'ORDER_ACCEPTED') {
        const acceptedCmd = msg.data;
        console.log('✅ Commande acceptée via WS:', acceptedCmd.id, 'par livreur:', acceptedCmd.livreurId);

        setCommandes(prev => {
          const isMyCommand = acceptedCmd.livreurId === userId;

          if (isMyCommand) {
            // Si c'est à moi, je mets à jour le statut
            return prev.map(c => c.id === acceptedCmd.id ? {
              ...c,
              statut: Statut.ACCEPTED,
              livreurId: userId
            } : c);
          } else {
            // Si c'est à quelqu'un d'autre, je l'enlève de ma liste
            return prev.filter(c => c.id !== acceptedCmd.id);
          }
        });

        // Recharger le profil pour mettre à jour la balance si c'est moi
        if (acceptedCmd.livreurId === userId) {
          refreshProfile();
        }

      } else if (msg.type === 'PERSONAL_NOTIFICATION') {
        console.log('🔔 Notification personnelle reçue');
        playNotificationSound();
        NotificationService.presentLocalNotification(
          "🔔 Notification",
          msg.data
        );
        Alert.alert("Notification Personnelle", msg.data);
        refetchCommandes(); // Pour être sûr d'avoir les dernières données
        refreshProfile();
      } else if (msg.type === 'GRANDE_COMMANDE') {
        const gc: GrandeCommande = msg.data;
        console.log('📦 Nouveau GROUPE reçu via WS:', gc.id);
        playNotificationSound();
        hapticNotification(Haptics.NotificationFeedbackType.Success);

        NotificationService.presentLocalNotification(
          "📦 Nouveau Groupe !",
          `Un groupe de ${gc.commandes?.length} commandes vous a été assigné.`
        );

        Alert.alert(
          "Nouveau Groupe",
          `Un groupe de ${gc.commandes?.length} commandes vous attend.`,
          [
            { text: "Plus tard", style: "cancel" },
            { text: "Voir", onPress: () => navigation.navigate('GrandeCommandeDetail', { grandeCommandeId: gc.id, initialData: gc }) }
          ]
        );

        refetchGroups();
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



  const handleAccept = async (cmd: Commande) => {
    if (!userId) return;

    if (isBlockedForCmd(cmd)) {
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

    if (item.statut === Statut.CONFIRMED) { badgeStyle = styles.badgePurple; textStyle = { color: '#6b21a8' } }
    else if (item.statut === Statut.SHIPPED) { badgeStyle = styles.badgeOrange; textStyle = { color: '#9a3412' } }
    else if (item.statut === Statut.DELIVERED) { badgeStyle = styles.badgeEmerald; textStyle = { color: '#065f46' } }

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

  // Filtrage pour ne montrer que:
  // 1. Les commandes CONFIRMED (disponibles pour tous)
  // 2. Les commandes qui ME sont assignées (ACCEPTED, SHIPPED, DELIVERED...)
  const displayedCommandes = useMemo(() => {
    return commandes.filter(c => {
      if (ignoredOrderIds.includes(c.id)) return false; // Masquer si ignorée
      if (c.statut === Statut.CONFIRMED) return true; // Visible par tout le monde
      if (c.livreurId === userId) return true; // Mes commandes
      return false; // Les commandes des autres sont masquées
    }).sort((a, b) => b.id - a.id); // Plus récent en haut
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
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitleText}>Tableau de Bord</Text>
            <Text style={styles.headerSubtitleText}>
              {activeTab === 'SINGLE' ? `${displayedCommandes.length} livraisons` : `${grandesCommandes.length} groupes`}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutHeaderBtn}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'SINGLE' && styles.tabBtnActive]}
          onPress={() => { impact(Haptics.ImpactFeedbackStyle.Light); setActiveTab('SINGLE'); }}
        >
          <Ionicons name="cube-outline" size={18} color={activeTab === 'SINGLE' ? '#10b981' : '#64748b'} />
          <Text style={[styles.tabBtnText, activeTab === 'SINGLE' && styles.tabBtnTextActive]}>Individuelles</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'GROUPS' && styles.tabBtnActive]}
          onPress={() => { impact(Haptics.ImpactFeedbackStyle.Light); setActiveTab('GROUPS'); }}
        >
          <Ionicons name="layers-outline" size={18} color={activeTab === 'GROUPS' ? '#10b981' : '#64748b'} />
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
            <Text style={styles.blockedBannerSub}>Versez votre solde cash ({profile?.cashbalance} TND) pour continuer.</Text>
          </View>
        </View>
      )}

      {/* List */}
      {(isLoading || isLoadingGroups) && !isRefetching ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>Mise à jour...</Text>
        </View>
      ) : activeTab === 'SINGLE' ? (
        <FlatList
          data={displayedCommandes}
          renderItem={({ item }) => {
            const isAssignedToMe = item.livreurId === userId;

            // Logique de badge identique Angular
            let badgeStyle = styles.badgeDefault;
            let textStyle = styles.badgeTextDefault;

            if (item.statut === Statut.CONFIRMED) { badgeStyle = styles.badgePurple; textStyle = { color: '#6b21a8' } }
            else if (item.statut === Statut.SHIPPED) { badgeStyle = styles.badgeOrange; textStyle = { color: '#9a3412' } }
            else if (item.statut === Statut.DELIVERED) { badgeStyle = styles.badgeEmerald; textStyle = { color: '#065f46' } }

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
                      <TouchableOpacity
                        onPress={() => handleAccept(item)}
                        style={[styles.btnPrimary, isBlockedForCmd(item) && styles.btnDisabled]}
                        disabled={isBlockedForCmd(item)}
                      >
                        <Text style={styles.btnTextPrimary}>{isBlockedForCmd(item) ? 'Bloqué' : 'Accepter'}</Text>
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
          }}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetchCommandes();
                refetchGroups();
                refreshProfile();
                fetchDayCounts();
              }}
              colors={['#10b981']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContent}>
              <Ionicons name="document-text-outline" size={64} color="#cbd5e1" />
              <Text style={styles.emptyLabelText}>Aucune commande</Text>
              <Text style={styles.emptySubLabelText}>Il n'y a pas de commandes prévues pour cette date.</Text>
            </View>
          }
          initialNumToRender={5}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true}
        />
      ) : (
        <FlatList
          data={grandesCommandes}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.groupCard}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('GrandeCommandeDetail', { grandeCommandeId: item.id, initialData: item })}
            >
              <View style={styles.groupCardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: '#ecfdf5' }]}>
                  <Ionicons name="layers-outline" size={20} color="#10b981" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.orderId}>{item.code}</Text>
                  <Text style={styles.groupSubText}>{item.commandes?.length || 0} commandes groupées</Text>
                </View>
                <View style={[styles.badge, item.statut === 'ACCEPTED' ? styles.badgeEmerald : styles.badgeDefault]}>
                  <Text style={[styles.badgeText, item.statut === 'ACCEPTED' ? { color: '#065f46' } : { color: '#64748b' }]}>
                    {item.statut === 'ACCEPTED' ? 'Accepté' : 'En attente'}
                  </Text>
                </View>
              </View>

              <View style={styles.groupCardFooter}>
                <View style={[styles.priceTag, profile?.moyen === MoyenTransport.MOTO && { backgroundColor: '#fef3c7' }]}>
                  <Text style={[styles.priceTagText, profile?.moyen === MoyenTransport.MOTO && { color: '#d97706' }]}>
                    {profile?.moyen === MoyenTransport.MOTO
                      ? `${(item.commandes?.length || 0) * 5} TND`
                      : `${item.totalPrixLivraison} TND`}
                  </Text>
                </View>
                {item.statut === 'PENDING' ? (
                  <TouchableOpacity
                    style={styles.btnGroupAccept}
                    onPress={() => handleAcceptGroup(item)}
                    disabled={isBlockingForGroupSelection(item)}
                  >
                    <Text style={styles.btnTextWhite}>Accepter le Groupe</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.btnGroupView}
                    onPress={() => navigation.navigate('GrandeCommandeDetail', { grandeCommandeId: item.id, initialData: item })}
                  >
                    <Text style={styles.btnTextPrimary}>Détails du Groupe</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetchCommandes();
                refetchGroups();
                refreshProfile();
              }}
              colors={['#10b981']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContent}>
              <Ionicons name="layers-outline" size={64} color="#cbd5e1" />
              <Text style={styles.emptyLabelText}>Aucun groupe</Text>
              <Text style={styles.emptySubLabelText}>Aucun bundle de commandes groupées n'est disponible.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerTitleText: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  headerSubtitleText: { fontSize: 13, color: '#64748b' },
  logoutHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff1f2',
    justifyContent: 'center',
    alignItems: 'center'
  },

  dateFilterOuter: {
    backgroundColor: '#ffffff',
    paddingVertical: 15,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    marginBottom: 10
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
  dateTextSelected: { color: '#ffffff' },
  miniBadgeBubble: {
    position: 'absolute',
    top: -5,
    right: -5,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#ffffff'
  },
  miniBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  todayDotIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#10b981',
    marginTop: 4
  },

  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 12
  },
  blockedBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center'
  },
  blockedBannerText: { fontSize: 14, fontWeight: 'bold', color: '#991b1b' },
  blockedBannerSub: { fontSize: 12, color: '#b91c1c', marginTop: 2 },

  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    marginBottom: 20,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc'
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden'
  },
  dashIconImg: {
    width: 24,
    height: 24,
    resizeMode: 'contain'
  },
  orderId: { fontWeight: 'bold', fontSize: 17, color: '#1e293b' },
  assignedTo: { fontSize: 11, color: '#10b981', marginTop: 2, fontWeight: '500' },

  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 0 },
  badgeDefault: { backgroundColor: '#f1f5f9' },
  badgePurple: { backgroundColor: '#f3e8ff' },
  badgeOrange: { backgroundColor: '#ffedd5' },
  badgeEmerald: { backgroundColor: '#d1fae5' },
  badgeText: { fontSize: 11, fontWeight: 'bold' },
  badgeTextDefault: { color: '#64748b' },

  cardBody: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 14, color: '#475569', flex: 1, lineHeight: 20 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  itemCount: { fontSize: 13, color: '#94a3b8', fontWeight: '500' },
  totalPrice: { fontSize: 18, fontWeight: 'bold', color: '#059669' },

  cardFooter: {
    padding: 12,
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    gap: 10
  },
  btnPrimary: {
    flex: 2,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2
  },
  btnDisabled: {
    backgroundColor: '#94a3b8',
    elevation: 0
  },
  btnIgnore: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  btnOrange: {
    flex: 1,
    backgroundColor: '#f97316',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnSuccess: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnTextPrimary: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  btnTextIgnore: { color: '#64748b', fontWeight: 'bold', fontSize: 14 },
  btnTextWhite: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 },
  loadingText: { color: '#64748b', fontSize: 14, fontWeight: '500' },

  emptyContent: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyLabelText: { fontSize: 18, fontWeight: 'bold', color: '#475569', marginTop: 15 },
  emptySubLabelText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 20 },

  // New Tab & Group Styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 15,
    padding: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  tabBtnActive: {
    backgroundColor: '#ecfdf5',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748b',
  },
  tabBtnTextActive: {
    color: '#10b981',
  },
  tabBadge: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tabBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  groupCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
  },
  groupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  groupSubText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  groupCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  priceTag: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  priceTagText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
  },
  btnGroupAccept: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnGroupView: {
    flex: 1,
    backgroundColor: 'white',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10b981',
  }
});
