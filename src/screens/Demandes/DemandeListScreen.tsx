import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, StatusBar, AppState, AppStateStatus, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av'; // Pour le son

import { DemandeLivraison, StatutDemande } from '../../Types/DemandeLivraison';
import { DemandeLivraisonService, DemandeWebSocketService } from '../../services/DemandeLivraisonService';
import { useAuth } from '../../context/AuthContext';
import { translateStatutDemande } from '../../utils/translations';

const DemandesListScreen = () => {
  const navigation = useNavigation<any>();
  const { userId } = useAuth();

  const [disponibles, setDisponibles] = useState<DemandeLivraison[]>([]);
  const [mesLivraisons, setMesLivraisons] = useState<DemandeLivraison[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'OFFRES' | 'MES_COURSES'>('OFFRES');

  // Date filtering
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [ignoredDemandeIds, setIgnoredDemandeIds] = useState<number[]>([]);

  const wsService = useRef<DemandeWebSocketService | null>(null);

  // Pour le son de notification
  const playNotificationSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/Notification.mp3')
      );
      await sound.playAsync();
    } catch (error) {
      console.log('Erreur son notification', error);
    }
  };

  useEffect(() => {
    loadInitialData();

    wsService.current = new DemandeWebSocketService(
      (newDemande) => handleNewDemande(newDemande),
      (acceptedDemande) => handleDemandeTaken(acceptedDemande),
      userId
    );
    wsService.current.activate();

    // Écouter le changement d'état de l'app (Arrière-plan -> Premier plan)
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('App revenue au premier plan (Demandes), rafraîchissement...');
        loadInitialData();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      wsService.current?.deactivate();
      subscription.remove();
    };
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const dispo = await DemandeLivraisonService.getDemandesAcceptees(userId || undefined);
      setDisponibles(dispo.filter(d => d.statut === StatutDemande.CONFIRMEE));

      if (userId) {
        const mes = await DemandeLivraisonService.getMesLivraisons(userId);
        setMesLivraisons(mes);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleNewDemande = (demande: DemandeLivraison) => {
    // 1. Gestion de la liste "Nouvelles Offres" (Disponibles)
    if (demande.statut === StatutDemande.CONFIRMEE) {
      setDisponibles(prev => {
        if (prev.find(d => d.id === demande.id)) return prev;

        // Nouvelle demande : ALERTE et SON
        playNotificationSound();
        Alert.alert(
          "🚲 Nouvelle Demande",
          `Une nouvelle livraison spéciale vers ${demande.villeDestinataire} est disponible !`,
          [{ text: "OK" }]
        );

        return [demande, ...prev];
      });
    } else {
      // Si elle n'est plus confirmée (donc acceptée, en cours, etc.), on la retire des offres
      setDisponibles(prev => prev.filter(d => d.id !== demande.id));
    }

    // 2. Gestion de la liste "Mes Courses"
    if (demande.livreurId === userId) {
      setMesLivraisons(prev => {
        const exists = prev.find(d => d.id === demande.id);
        if (exists) {
          // Mise à jour si existe déjà
          return prev.map(d => d.id === demande.id ? demande : d);
        }
        // Ajout si nouvelle pour moi
        return [demande, ...prev];
      });
    }
  };

  const handleDemandeTaken = (demande: DemandeLivraison) => {
    // WebSocket: Une demande a été prise (par moi ou qqn d'autre)
    // On la retire TOUJOURS des offres disponibles
    setDisponibles(prev => prev.filter(d => d.id !== demande.id));

    // Si c'est moi qui l'ai prise, je l'ajoute à mes courses
    if (demande.livreurId === userId) {
      setMesLivraisons(prev => {
        // Évite doublons
        if (prev.find(d => d.id === demande.id)) return prev.map(d => d.id === demande.id ? demande : d);
        return [demande, ...prev];
      });
    }
  };

  // Effect pour recharger quand la date change
  useEffect(() => {
    if (activeTab === 'OFFRES') {
      loadInitialData();
    }
  }, [selectedDate, userId]);

  // Filtrage par date
  const filteredList = useMemo(() => {
    if (activeTab === 'MES_COURSES') {
      return mesLivraisons.filter(d => !ignoredDemandeIds.includes(d.id));
    }

    return disponibles.filter(item => {
      if (ignoredDemandeIds.includes(item.id)) return false;
      // On compare la date de livraison prévue avec la date sélectionnée
      // Attention: item.dateLivraison peut être une string ISO complète ou YYYY-MM-DD
      const itemDate = new Date(item.dateLivraison).toISOString().split('T')[0];
      return itemDate === selectedDate;
    });
  }, [disponibles, mesLivraisons, activeTab, selectedDate]);


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

  const handlePressDemande = (demande: DemandeLivraison) => {
    navigation.navigate('DemandeDetail', { demandeId: demande.id, isMyDelivery: activeTab === 'MES_COURSES' });
  };

  const handleIgnore = (id: number) => {
    Alert.alert(
      "Ignorer la demande",
      "Voulez-vous masquer cette demande ?",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Ignorer", style: "destructive", onPress: () => setIgnoredDemandeIds(prev => [...prev, id]) }
      ]
    );
  };

  const handleAccept = async (demande: DemandeLivraison) => {
    if (!userId) return;
    try {
      await DemandeLivraisonService.accepterDemande(demande.id, userId);
      Alert.alert('Succès', 'Course acceptée !');
      // On recharge les données
      loadInitialData();
    } catch (e) {
      Alert.alert('Erreur', 'Cette demande n\'est plus disponible.');
      loadInitialData();
    }
  };

  const renderItem = ({ item }: { item: DemandeLivraison }) => (
    <TouchableOpacity style={styles.card} onPress={() => handlePressDemande(item)} activeOpacity={0.9}>
      <View style={styles.cardHeader}>
        <View style={styles.iconBox}>
          <Image source={require('../../../assets/Delivery.png')} style={styles.demandeIconImg} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.routeText}>{item.ville} <Ionicons name="arrow-forward" /> {item.villeDestinataire}</Text>
          <Text style={styles.clientText}>Client: {item.prenom} {item.nom}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: getStatusColor(item.statut) }]}>
          <Text style={styles.badgeText}>{translateStatutDemande(item.statut)}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color="#6b7280" />
          <Text style={styles.infoText}>{item.dateLivraison}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="pricetag-outline" size={16} color="#6b7280" />
          <Text style={styles.infoText}>{item.typeArticle || 'Colis standard'}</Text>
        </View>

        {activeTab === 'OFFRES' && (
          <View style={styles.actionRowCard}>
            <TouchableOpacity
              style={styles.btnIgnoreSm}
              onPress={(e) => { handleIgnore(item.id); }}
            >
              <Text style={styles.btnTextIgnoreSm}>Ignorer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnAcceptSm}
              onPress={(e) => { handleAccept(item); }}
            >
              <Text style={styles.btnTextAcceptSm}>Accepter</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

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
            <Text style={styles.headerTitleText}>Demandes</Text>
            <Text style={styles.headerSubtitleText}>
              {activeTab === 'OFFRES' ? 'Offres de livraison' : 'Vos courses acceptées'}
            </Text>
          </View>
        </View>
      </View>

      {/* Tabs Layout */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'OFFRES' && styles.activeTab]}
          onPress={() => setActiveTab('OFFRES')}>
          <View style={styles.tabContentRow}>
            <Text style={[styles.tabText, activeTab === 'OFFRES' && styles.activeTabText]}>
              Nouvelles Offres
            </Text>
            {disponibles.length > 0 && (
              <View style={[styles.tabBadge, activeTab === 'OFFRES' ? { backgroundColor: '#3b82f6' } : { backgroundColor: '#94a3b8' }]}>
                <Text style={styles.tabBadgeText}>{disponibles.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'MES_COURSES' && styles.activeTab]}
          onPress={() => setActiveTab('MES_COURSES')}>
          <View style={styles.tabContentRow}>
            <Text style={[styles.tabText, activeTab === 'MES_COURSES' && styles.activeTabText]}>
              Mes Courses
            </Text>
            {mesLivraisons.length > 0 && (
              <View style={[styles.tabBadge, activeTab === 'MES_COURSES' ? { backgroundColor: '#3b82f6' } : { backgroundColor: '#94a3b8' }]}>
                <Text style={styles.tabBadgeText}>{mesLivraisons.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Date Filter - Restricted to Offers */}
      {activeTab === 'OFFRES' && (
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
                  {isToday && !isSelected && <View style={styles.todayDotIndicator} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Main List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Mise à jour...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, activeTab === 'MES_COURSES' && { paddingTop: 20 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadInitialData(); }}
              colors={['#3b82f6']}
              tintColor="#3b82f6"
            />
          }
          initialNumToRender={5}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true}
          ListEmptyComponent={
            <View style={styles.emptyContent}>
              <Ionicons
                name={activeTab === 'OFFRES' ? "map-outline" : "bicycle-outline"}
                size={64}
                color="#cbd5e1"
              />
              <Text style={styles.emptyLabelText}>
                {activeTab === 'OFFRES' ? "Pas d'offres dispos" : "Aucune course"}
              </Text>
              <Text style={styles.emptySubLabelText}>
                {activeTab === 'OFFRES'
                  ? "Revenez plus tard ou changez de date."
                  : "Vous n'avez pas encore accepté de demandes."}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const getStatusColor = (statut: StatutDemande) => {
  switch (statut) {
    case StatutDemande.CONFIRMEE: return '#22c55e';
    case StatutDemande.EN_COURS: return '#f59e0b';
    case StatutDemande.LIVREE: return '#3b82f6';
    case StatutDemande.RETOUR: return '#ef4444';
    default: return '#64748b';
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 15,
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

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent'
  },
  activeTab: { borderBottomColor: '#3b82f6' },
  tabContentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabText: { fontWeight: '600', color: '#94a3b8', fontSize: 14 },
  activeTabText: { color: '#1e293b' },
  tabBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tabBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

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
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    elevation: 6,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  dateDayName: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold', marginBottom: 4 },
  dateDayNum: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  dateTextSelected: { color: '#ffffff' },
  todayDotIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3b82f6',
    marginTop: 4
  },

  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    marginBottom: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 4,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden'
  },
  demandeIconImg: {
    width: 24,
    height: 24,
    resizeMode: 'contain'
  },
  routeText: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', flex: 1, marginLeft: 12 },
  clientText: { fontSize: 12, color: '#64748b', marginTop: 2, marginLeft: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

  cardBody: { gap: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { color: '#475569', fontSize: 14, fontWeight: '500' },

  actionRowCard: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 15
  },
  btnIgnoreSm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center'
  },
  btnAcceptSm: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    elevation: 2
  },
  btnTextIgnoreSm: { color: '#64748b', fontWeight: 'bold', fontSize: 14 },
  btnTextAcceptSm: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  emptyContent: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyLabelText: { fontSize: 18, fontWeight: 'bold', color: '#475569', marginTop: 15 },
  emptySubLabelText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 20 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 },
  loadingText: { color: '#3b82f6', fontSize: 14, fontWeight: '500' }
});

export default DemandesListScreen;
