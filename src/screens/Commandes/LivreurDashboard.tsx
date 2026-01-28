import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl,
  StatusBar, AppState, AppStateStatus, ActivityIndicator, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av'; // Pour le son de notification

import { LivreurService } from '../../services/LivreurService';
import { WebSocketService } from '../../services/websocket';
import { Commande, Statut } from '../../Types/types';
import { useAuth } from '../../context/AuthContext';
import { translateStatut } from '../../utils/translations';


export default function LivreurDashboard() {
  const navigation = useNavigation();
  const { logout, userId } = useAuth();
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [ignoredOrderIds, setIgnoredOrderIds] = useState<number[]>([]);
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});

  // Réf pour accéder à l'état actuel dans le callback WebSocket (évite les problèmes de closure)
  const commandesRef = useRef<Commande[]>([]);

  // Mettre à jour la ref quand l'état change
  useEffect(() => {
    commandesRef.current = commandes;
  }, [commandes]);

  // Jouer le son de notification
  const playNotificationSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/Notification.mp3') // Assurez-vous d'avoir un fichier son
      );
      await sound.playAsync();
    } catch (error) {
      console.log('Erreur son notification', error);
    }
  };



  const fetchCommandes = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await LivreurService.getCommandesByDay(selectedDate, userId);
      setCommandes(data || []);
    } catch (error) {
      console.error(error);
      Alert.alert('Erreur', 'Impossible de charger les commandes');
    } finally {
      setLoading(false);
      setRefreshing(false);
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
        } catch (e) {
          // ignore error for single date
        }
      }));
      setDayCounts(counts);
    } catch (e) {
      console.error("Error fetching day counts", e);
    }
  };

  // Initialisation et Chargement des données quand la date change
  useEffect(() => {
    fetchCommandes();
    fetchDayCounts();
  }, [selectedDate, userId]);

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

      } else if (msg.type === 'PERSONAL_NOTIFICATION') {
        console.log('dring dring dring notifiication perso');
        playNotificationSound();
        Alert.alert("Notification Personnelle", msg.data);
        fetchCommandes(); // Pour être sûr d'avoir les dernières données
      }
    }, userId);

    // Écouter le changement d'état de l'app (Arrière-plan -> Premier plan)
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('App revenue au premier plan (Dashboard), rafraîchissement...');
        fetchCommandes();
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
    try {
      // Optimistic Update: Mise à jour immédiate de l'UI avant la réponse serveur
      setCommandes(prev => prev.map(c => c.id === cmd.id ? { ...c, statut: newStatut } : c));

      await LivreurService.updateStatut(cmd.id, newStatut);
      // Pas besoin de refetch, l'optimistic update suffit, ou le WS confirmera
    } catch (error) {
      console.error(error);
      Alert.alert('Erreur', 'Mise à jour échouée');
      fetchCommandes(); // Revert en cas d'erreur
    }
  };

  const handleAccept = async (cmd: Commande) => {
    if (!userId) return;
    try {
      // Appel API
      await LivreurService.acceptCommande(cmd.id, userId);
      // La mise à jour de l'UI se fera via le WebSocket 'ORDER_ACCEPTED'
      // ou on peut faire un update optimiste ici aussi
      Alert.alert('Succès', 'Commande acceptée !');
      // Navigate to details after acceptance
      (navigation as any).navigate('CommandeDetails', { commandeId: cmd.id });
    } catch (error: any) {
      if (error.response?.status === 409) {
        Alert.alert('Trop tard', 'Cette commande a déjà été prise.');
        fetchCommandes();
      } else {
        Alert.alert('Erreur', 'Impossible d\'accepter la commande');
      }
    }
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
            <Image source={require('../../../assets/Delivery.png')} style={styles.dashIconImg} />
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
            <Text style={styles.headerTitleText}>Commandes</Text>
            <Text style={styles.headerSubtitleText}>{displayedCommandes.length} livraisons trouvées</Text>
          </View>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutHeaderBtn}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* Date filter container */}
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

      {/* List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>Mise à jour des commandes...</Text>
        </View>
      ) : (
        <FlatList
          data={displayedCommandes}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCommandes(); }} />}
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
  emptySubLabelText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 20 }
});
