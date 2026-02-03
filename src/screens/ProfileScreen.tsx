import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView, StatusBar, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { LivreurService } from '../services/LivreurService';
import { Livreur, MoyenTransport } from '../Types/auth';

export default function ProfileScreen() {
    const navigation = useNavigation();
    const { userId, logout } = useAuth();
    const [profile, setProfile] = useState<Livreur | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProfile();
    }, [userId]);

    const fetchProfile = async () => {
        if (!userId) return;
        try {
            const data = await LivreurService.getLivreurInfos(userId);
            setProfile(data);
        } catch (error) {
            console.error('Erreur fetch profile', error);
        } finally {
            setLoading(false);
        }
    };

    const getTransportIcon = (moyen: MoyenTransport) => {
        switch (moyen) {
            case MoyenTransport.VOITURE: return 'car';
            case MoyenTransport.MOTO: return 'bicycle';
            case MoyenTransport.VELO: return 'bicycle-outline';
            case MoyenTransport.CAMION: return 'bus';
            default: return 'help-circle';
        }
    };

    const getTransportLabel = (moyen: MoyenTransport) => {
        switch (moyen) {
            case MoyenTransport.VOITURE: return 'Voiture';
            case MoyenTransport.MOTO: return 'Moto';
            case MoyenTransport.VELO: return 'Vélo';
            case MoyenTransport.CAMION: return 'Camion';
            default: return 'Inconnu';
        }
    };

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#059669" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color="#1e293b" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Mon Profil</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile Avatar & Name */}
                <View style={styles.profileHero}>
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarInitial}>
                                {profile?.nom?.charAt(0)}{profile?.prenom?.charAt(0)}
                            </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: profile?.dispo ? '#10b981' : '#94a3b8' }]} />
                    </View>
                    <Text style={styles.profileName}>{profile?.prenom} {profile?.nom}</Text>
                    <Text style={styles.profileEmail}>{profile?.email}</Text>

                    <View style={styles.transportTag}>
                        <Ionicons name={getTransportIcon(profile?.moyen || MoyenTransport.MOTO) as any} size={16} color="#059669" />
                        <Text style={styles.transportTagText}>Livreur en {getTransportLabel(profile?.moyen || MoyenTransport.MOTO)}</Text>
                    </View>
                </View>

                <View style={styles.infoSection}>
                    <Text style={styles.sectionTitle}>Ma Caisse</Text>
                    <View style={styles.infoCard}>
                        <View style={styles.balanceHeader}>
                            <View style={styles.balanceInfo}>
                                <View style={[styles.iconContainer, { backgroundColor: '#ecfdf5' }]}>
                                    <Ionicons name="wallet-outline" size={20} color="#059669" />
                                </View>
                                <View>
                                    <Text style={styles.balanceLabel}>Solde Cash</Text>
                                    <Text style={styles.balanceValue}>{profile?.cashbalance?.toFixed(2) || '0.00'} <Text style={styles.currency}>TND</Text></Text>
                                </View>
                            </View>
                            <View style={styles.limitContainer}>
                                <Text style={styles.limitLabel}>Plafond</Text>
                                <Text style={styles.limitValue}>{profile?.plafond?.toFixed(2) || '0.00'} TND</Text>
                            </View>
                        </View>

                        <View style={styles.progressBarContainer}>
                            <View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        width: `${Math.min(((profile?.cashbalance || 0) / (profile?.plafond || 1)) * 100, 100)}%`,
                                        backgroundColor: ((profile?.cashbalance || 0) / (profile?.plafond || 1)) > 0.9 ? '#ef4444' :
                                            ((profile?.cashbalance || 0) / (profile?.plafond || 1)) > 0.7 ? '#f59e0b' : '#10b981'
                                    }
                                ]}
                            />
                        </View>

                        <View style={styles.percentageRow}>
                            <Text style={styles.percentageText}>
                                {Math.round(((profile?.cashbalance || 0) / (profile?.plafond || 1)) * 100)}% utilisé
                            </Text>
                            {((profile?.cashbalance || 0) / (profile?.plafond || 1)) > 0.9 && (
                                <View style={styles.warningBadge}>
                                    <Ionicons name="alert-circle" size={12} color="#fff" />
                                    <Text style={styles.warningText}>Attention</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* Info Sections */}
                <View style={styles.infoSection}>
                    <Text style={styles.sectionTitle}>Coordonnées</Text>

                    <View style={styles.infoCard}>
                        <View style={styles.infoRow}>
                            <View style={styles.infoIconBox}>
                                <Ionicons name="call-outline" size={20} color="#64748b" />
                            </View>
                            <View>
                                <Text style={styles.infoLabel}>Téléphone</Text>
                                <Text style={styles.infoValue}>{profile?.telephone}</Text>
                            </View>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.infoRow}>
                            <View style={styles.infoIconBox}>
                                <Ionicons name="location-outline" size={20} color="#64748b" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.infoLabel}>Adresse</Text>
                                <Text style={styles.infoValue}>
                                    {profile?.adresseLivraison ?
                                        `${profile.adresseLivraison.rue}, ${profile.adresseLivraison.delegation}, ${profile.adresseLivraison.gouvernerat}` :
                                        'Non renseignée'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.infoSection}>
                    <Text style={styles.sectionTitle}>États du service</Text>
                    <View style={styles.infoCard}>

                        <View style={styles.infoRow}>
                            <View style={styles.infoIconBox}>
                                <Ionicons name="checkmark-circle-outline" size={20} color={profile?.dispo ? "#10b981" : "#64748b"} />
                            </View>
                            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View>
                                    <Text style={styles.infoLabel}>Disponible pour missions</Text>
                                    <Text style={styles.infoValue}>{profile?.dispo ? 'Oui' : 'Non'}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Logout Button */}
                <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                    <Ionicons name="log-out-outline" size={20} color="#ef4444" />
                    <Text style={styles.logoutButtonText}>Se déconnecter</Text>
                </TouchableOpacity>

                <Text style={styles.versionText}>Application Livreur v1.0.0</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    scrollContent: {
        paddingBottom: 40,
    },
    profileHero: {
        alignItems: 'center',
        paddingVertical: 30,
        backgroundColor: '#ffffff',
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 15,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#ecfdf5',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#ffffff',
        elevation: 5,
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    avatarInitial: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#059669',
    },
    statusBadge: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 3,
        borderColor: '#ffffff',
    },
    profileName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    profileEmail: {
        fontSize: 14,
        color: '#64748b',
        marginTop: 4,
    },
    transportTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ecfdf5',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginTop: 15,
        gap: 6,
    },
    transportTagText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#059669',
    },
    infoSection: {
        paddingHorizontal: 24,
        marginTop: 25,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#475569',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    infoCard: {
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        elevation: 2,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    infoIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
        alignItems: 'center',
    },
    infoLabel: {
        fontSize: 12,
        color: '#94a3b8',
        fontWeight: '500',
    },
    infoValue: {
        fontSize: 15,
        color: '#1e293b',
        fontWeight: '600',
        marginTop: 2,
    },
    divider: {
        height: 1,
        backgroundColor: '#f1f5f9',
        marginVertical: 15,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff1f2',
        marginHorizontal: 24,
        marginTop: 40,
        paddingVertical: 15,
        borderRadius: 15,
        gap: 10,
    },
    logoutButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ef4444',
    },
    versionText: {
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: 12,
        marginTop: 20,
    },
    balanceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 15,
    },
    balanceInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    balanceLabel: {
        fontSize: 12,
        color: '#64748b',
        marginBottom: 2,
        fontWeight: '500',
    },
    balanceValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    currency: {
        fontSize: 12,
        color: '#94a3b8',
        fontWeight: '600',
    },
    limitContainer: {
        alignItems: 'flex-end',
    },
    limitLabel: {
        fontSize: 11,
        color: '#94a3b8',
        marginBottom: 2,
    },
    limitValue: {
        fontSize: 14,
        color: '#64748b',
        fontWeight: '600',
    },
    progressBarContainer: {
        height: 8,
        backgroundColor: '#f1f5f9',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 10,
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    percentageRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    percentageText: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '500',
    },
    warningBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: '#ef4444',
        gap: 4,
    },
    warningText: {
        fontSize: 10,
        color: '#fff',
        fontWeight: 'bold',
    }
});
