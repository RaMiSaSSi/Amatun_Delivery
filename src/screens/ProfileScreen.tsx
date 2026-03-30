import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
    StatusBar, Image, Dimensions, ImageBackground
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
    ChevronLeft, Wallet, Phone, MapPin, CheckCircle2,
    LogOut, User, Briefcase, Settings, CreditCard,
    ShieldCheck, Bell, MessageSquare, Info
} from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { LivreurService } from '../services/LivreurService';
import { Livreur, MoyenTransport } from '../Types/auth';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
    const navigation = useNavigation<any>();
    const { userId, logout } = useAuth();
    const [profile, setProfile] = useState<Livreur | null>(null);
    const [isOnline, setIsOnline] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingStatus, setLoadingStatus] = useState(false);

    useEffect(() => {
        fetchProfile();
    }, [userId]);

    const fetchProfile = async () => {
        if (!userId) return;
        try {
            const data = await LivreurService.getLivreurInfos(userId);
            setProfile(data);
            setIsOnline(data.online);
        } catch (error) {
            console.error('Erreur fetch profile', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStatus = async () => {
        if (!userId || !profile) return;
        setLoadingStatus(true);
        const newValue = !isOnline;
        try {
            const updated = await LivreurService.updateStatus(userId, newValue);
            setIsOnline(updated.online);
        } catch (error) {
            console.error("Error updating status", error);
        } finally {
            setLoadingStatus(false);
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

    const walletUsage = (profile?.cashbalance || 0) / (profile?.plafond || 1);
    const isWalletCritical = walletUsage > 0.9;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            
            {/* Background Layers */}
            <LinearGradient
                colors={['#064e3b', '#065f46', '#f8fafc']}
                locations={[0, 0.3, 0.5]}
                style={StyleSheet.absoluteFill}
            />
            <ImageBackground
                source={require('../../assets/textures/noise.png')}
                style={StyleSheet.absoluteFill}
                imageStyle={{ opacity: 0.05, resizeMode: 'repeat' }}
            />

            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                {/* Custom Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <BlurView intensity={30} tint="light" style={styles.backBtnBlur}>
                            <ChevronLeft size={24} color="white" />
                        </BlurView>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Profil</Text>
                    <TouchableOpacity style={styles.settingsBtn}>
                        <BlurView intensity={30} tint="light" style={styles.backBtnBlur}>
                            <Settings size={22} color="white" />
                        </BlurView>
                    </TouchableOpacity>
                </View>

                <ScrollView 
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Hero Section */}
                    <View style={styles.heroSection}>
                        <View style={styles.avatarWrapper}>
                            <View style={styles.avatarContainer}>
                                <View style={styles.avatarPlaceholder}>
                                    <Text style={styles.avatarInitial}>
                                        {profile?.nom?.charAt(0)}{profile?.prenom?.charAt(0)}
                                    </Text>
                                </View>
                            </View>
                            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10b981' : '#94a3b8' }]} />
                        </View>
                        
                        <Text style={styles.profileName}>{profile?.prenom} {profile?.nom}</Text>
                        
                        <TouchableOpacity 
                            style={[styles.statusBadge, !isOnline && styles.statusBadgeOffline]} 
                            onPress={handleToggleStatus}
                            disabled={loadingStatus}
                        >
                            <View style={[styles.statusDotSmall, !isOnline && styles.statusDotOffline]} />
                            <Text style={[styles.statusText, !isOnline && styles.statusTextOffline]}>
                                {isOnline ? 'EN LIGNE' : 'HORS LIGNE'}
                            </Text>
                            {loadingStatus && <ActivityIndicator size="small" color={isOnline ? "#059669" : "#64748b"} style={{marginLeft: 5}} />}
                        </TouchableOpacity>

                        <View style={styles.roleTag}>
                            <Briefcase size={12} color="#a7f3d0" />
                            <Text style={styles.roleText}>LIVREUR AMATUN • {getTransportLabel(profile?.moyen || MoyenTransport.MOTO)}</Text>
                        </View>
                    </View>

                   
                    {/* Wallet Section */}
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Portefeuille & Plafond</Text>
                        <View style={styles.walletCard}>
                            <LinearGradient
                                colors={['#ffffff', '#f8fafc']}
                                style={styles.walletContent}
                            >
                                <View style={styles.walletHeader}>
                                    <View style={styles.walletInfo}>
                                        <View style={[styles.walletIconBox, { backgroundColor: '#ecfdf5' }]}>
                                            <Wallet size={20} color="#059669" />
                                        </View>
                                        <View>
                                            <Text style={styles.labelSmall}>Solde Cash</Text>
                                            <Text style={styles.balanceValue}>{profile?.cashbalance?.toFixed(2) || '0.00'} <Text style={styles.currency}>TND</Text></Text>
                                        </View>
                                    </View>
                                    <View style={styles.limitBox}>
                                        <Text style={styles.limitLabel}>Limite: {profile?.plafond?.toFixed(0)} TND</Text>
                                    </View>
                                </View>

                                <View style={styles.progressContainer}>
                                    <View style={styles.progressBarBg}>
                                        <LinearGradient
                                            colors={isWalletCritical ? ['#ef4444', '#dc2626'] : ['#10b981', '#059669']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={[styles.progressBarFill, { width: `${Math.min(walletUsage * 100, 100)}%` }]}
                                        />
                                    </View>
                                    <View style={styles.progressLabels}>
                                        <Text style={styles.progressText}>{Math.round(walletUsage * 100)}% du plafond atteint</Text>
                                        {isWalletCritical && <Text style={styles.criticalText}>Versement requis</Text>}
                                    </View>
                                </View>
                            </LinearGradient>
                        </View>
                    </View>

                    {/* Personal Info */}
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Informations Personnelles</Text>
                        <View style={styles.optionsList}>
                            <TouchableOpacity style={styles.optionItem}>
                                <View style={styles.optionIconBox}>
                                    <Phone size={20} color="#64748b" />
                                </View>
                                <View style={styles.optionTextContent}>
                                    <Text style={styles.optionLabel}>Téléphone</Text>
                                    <Text style={styles.optionValue}>{profile?.telephone}</Text>
                                </View>
                            </TouchableOpacity>
                            <View style={styles.optionDivider} />
                            
                            <TouchableOpacity style={styles.optionItem}>
                                <View style={styles.optionIconBox}>
                                    <MapPin size={20} color="#64748b" />
                                </View>
                                <View style={styles.optionTextContent}>
                                    <Text style={styles.optionLabel}>Zone de livraison</Text>
                                    <Text style={styles.optionValue}>
                                        {profile?.adresseLivraison ? 
                                            `${profile.adresseLivraison.delegation}, ${profile.adresseLivraison.gouvernerat}` : 
                                            'Non définie'}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                            <View style={styles.optionDivider} />

                            <TouchableOpacity style={styles.optionItem}>
                                <View style={styles.optionIconBox}>
                                    <ShieldCheck size={20} color="#64748b" />
                                </View>
                                <View style={styles.optionTextContent}>
                                    <Text style={styles.optionLabel}>Vérification</Text>
                                    <View style={styles.verifiedRow}>
                                        <Text style={[styles.optionValue, { color: '#059669' }]}>Profil vérifié</Text>
                                        <CheckCircle2 size={14} color="#059669" style={{ marginLeft: 5 }} />
                                    </View>
                                </View>
                            </TouchableOpacity>
                            <View style={styles.optionDivider} />

                            <TouchableOpacity style={styles.optionItem}>
                                <View style={styles.optionIconBox}>
                                    <Briefcase size={20} color="#64748b" />
                                </View>
                                <View style={styles.optionTextContent}>
                                    <Text style={styles.optionLabel}>Disponibilité</Text>
                                    <Text style={styles.optionValue}>{profile?.dispo || 'Non définie'}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>

                    
                    <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
                        <LinearGradient
                            colors={['#fee2e2', '#fecaca']}
                            style={styles.logoutGradient}
                        >
                            <LogOut size={20} color="#ef4444" />
                            <Text style={styles.logoutText}>Déconnexion</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <Text style={styles.footerVersion}>Amatun Delivery • Version 2.1.0 • 2026</Text>
                    <View style={{ height: 40 }} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
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
        height: 70,
        paddingTop: 10,
    },
    backBtnBlur: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    backBtn: {},
    settingsBtn: {},
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: 'white',
        letterSpacing: 0.5,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    heroSection: {
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 25,
    },
    avatarWrapper: {
        position: 'relative',
        marginBottom: 15,
    },
    avatarContainer: {
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    avatarPlaceholder: {
        flex: 1,
        borderRadius: 50,
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
    },
    avatarInitial: {
        fontSize: 36,
        fontWeight: '900',
        color: '#059669',
    },
    statusDot: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 4,
        borderColor: '#065f46',
    },
    profileName: {
        fontSize: 26,
        fontWeight: '900',
        color: 'white',
        textShadowColor: 'rgba(0,0,0,0.1)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    roleTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginTop: 8,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    roleText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#a7f3d0',
        letterSpacing: 0.5,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 25,
    },
    statCard: {
        flex: 1,
        borderRadius: 20,
        paddingVertical: 15,
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '900',
        color: '#1e293b',
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#64748b',
        textTransform: 'uppercase',
        marginTop: 2,
    },
    sectionContainer: {
        marginBottom: 25,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#64748b',
        marginBottom: 12,
        marginLeft: 4,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    walletCard: {
        backgroundColor: 'white',
        borderRadius: 24,
        overflow: 'hidden',
        elevation: 4,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    walletContent: {
        padding: 20,
    },
    walletHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    walletInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    walletIconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    labelSmall: {
        fontSize: 11,
        fontWeight: '700',
        color: '#94a3b8',
        marginBottom: 2,
    },
    balanceValue: {
        fontSize: 22,
        fontWeight: '900',
        color: '#1e293b',
    },
    currency: {
        fontSize: 14,
        color: '#94a3b8',
    },
    limitBox: {
        backgroundColor: '#f8fafc',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    limitLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748b',
    },
    progressContainer: {
        marginTop: 5,
    },
    progressBarBg: {
        height: 10,
        backgroundColor: '#f1f5f9',
        borderRadius: 5,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 5,
    },
    progressLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    progressText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#94a3b8',
    },
    criticalText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#ef4444',
    },
    optionsList: {
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        elevation: 2,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 5,
    },
    optionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
        paddingVertical: 10,
    },
    optionIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionTextContent: {
        flex: 1,
    },
    optionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#94a3b8',
        marginBottom: 2,
    },
    optionValue: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1e293b',
    },
    verifiedRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    optionDivider: {
        height: 1,
        backgroundColor: '#f1f5f9',
        marginVertical: 10,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    menuIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    menuLabel: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: '#1e293b',
    },
    logoutBtn: {
        marginTop: 10,
        borderRadius: 20,
        overflow: 'hidden',
        elevation: 4,
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    logoutGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 12,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: '900',
        color: '#ef4444',
        letterSpacing: 0.5,
    },
    footerVersion: {
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '600',
        color: '#cbd5e1',
        marginTop: 30,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ecfdf5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#10b981',
    },
    statusBadgeOffline: {
        backgroundColor: '#f1f5f9',
        borderColor: '#94a3b8',
    },
    statusDotSmall: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10b981',
        marginRight: 6,
    },
    statusDotOffline: {
        backgroundColor: '#94a3b8',
    },
    statusText: {
        fontSize: 10,
        fontWeight: '900',
        color: '#059669',
        letterSpacing: 0.5,
    },
    statusTextOffline: {
        color: '#64748b',
    },
});
