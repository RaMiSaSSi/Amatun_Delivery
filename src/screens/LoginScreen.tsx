import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image, Animated, Easing, Dimensions, ImageBackground
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import api from '../services/LivreurService';
import { AuthenticationResponse } from '../Types/auth';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, Eye, EyeOff, ChevronRight } from 'lucide-react-native';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

const FloatingItem = ({ source, delay = 0, style }: { source: any; delay?: number; style?: any }) => {
    const translateY = useRef(new Animated.Value(0)).current;
    const rotate = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const floatAnimation = Animated.loop(
            Animated.sequence([
                Animated.timing(translateY, {
                    toValue: -20,
                    duration: 2500,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: 0,
                    duration: 2500,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );

        const rotateAnimation = Animated.loop(
            Animated.sequence([
                Animated.timing(rotate, {
                    toValue: 1,
                    duration: 4000,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(rotate, {
                    toValue: -1,
                    duration: 4000,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );

        const timeout = setTimeout(() => {
            floatAnimation.start();
            rotateAnimation.start();
        }, delay);

        return () => {
            clearTimeout(timeout);
            floatAnimation.stop();
            rotateAnimation.stop();
        };
    }, []);

    const interpolatedRotate = rotate.interpolate({
        inputRange: [-1, 1],
        outputRange: ['-10deg', '10deg'],
    });

    return (
        <Animated.Image
            source={source}
            style={[
                style,
                {
                    transform: [
                        { translateY },
                        { rotate: interpolatedRotate }
                    ]
                }
            ]}
            resizeMode="contain"
        />
    );
};

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { login } = useAuth();

    // Form animation
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 800,
                easing: Easing.out(Easing.back(1.5)),
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Erreur', 'Veuillez remplir tous les champs');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post<AuthenticationResponse>('/auth/login', { email, password });
            await login(response.data, email);
        } catch (error: any) {
            console.error(error);
            const msg = error.message === 'Accès réservé aux livreurs'
                ? error.message
                : (error.response?.status === 403 ? 'Identifiants incorrects' : 'Erreur de connexion');
            Alert.alert('Echec connexion', msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Background Layer 1: Gradient */}
            <LinearGradient
                colors={['#059669', '#065f46', '#064e3b']}
                style={StyleSheet.absoluteFill}
            />

            {/* Background Layer 2: Texture */}
            <ImageBackground
                source={require('../../assets/textures/noise.png')}
                style={StyleSheet.absoluteFill}
                imageStyle={{ opacity: 0.1, resizeMode: 'repeat' }}
            />

            {/* Background Layer 3: Floating Images */}
            <FloatingItem
                source={require('../../assets/deliveryPackages/deliverybike.png')}
                style={styles.floatingBike}
                delay={0}
            />
            <FloatingItem
                source={require('../../assets/deliveryPackages/deliveryvan.png')}
                style={styles.floatingVan}
                delay={500}
            />
            <FloatingItem
                source={require('../../assets/deliveryPackages/deliverybox.png')}
                style={styles.floatingBox}
                delay={1000}
            />
            <FloatingItem
                source={require('../../assets/deliveryPackages/deliverysachet.png')}
                style={styles.floatingSachet}
                delay={1500}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardView}
            >
                <Animated.View style={[
                    styles.contentContainer,
                    { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
                ]}>
                    <View style={styles.logoContainer}>
                        <View style={styles.logoWrapper}>
                            <Image source={require('../../assets/logo.png')} style={styles.logoImage} />
                        </View>
                        <Text style={styles.title}>Amatun Delivery</Text>
                        <Text style={styles.subtitle}>Connectez-vous pour livrer</Text>
                    </View>

                    <BlurView intensity={40} tint="light" style={styles.glassContainer}>
                        <View style={styles.formContent}>
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Email professionnel</Text>
                                <View style={styles.inputWrapper}>
                                    <Mail size={20} color="#059669" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="votre@email.com"
                                        placeholderTextColor="#9ca3af"
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Mot de passe</Text>
                                <View style={styles.inputWrapper}>
                                    <Lock size={20} color="#059669" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="••••••••"
                                        placeholderTextColor="#9ca3af"
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPassword}
                                    />
                                    <TouchableOpacity
                                        onPress={() => setShowPassword(!showPassword)}
                                        style={styles.eyeIcon}
                                    >
                                        {showPassword ? (
                                            <EyeOff size={20} color="#9ca3af" />
                                        ) : (
                                            <Eye size={20} color="#9ca3af" />
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={handleLogin}
                                disabled={loading}
                                style={[styles.loginBtn, loading && styles.disabledBtn]}
                            >
                                <LinearGradient
                                    colors={['#10b981', '#059669']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.btnGradient}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Text style={styles.loginBtnText}>Se Connecter</Text>
                                            <ChevronRight size={20} color="white" style={styles.chevron} />
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                                <Text style={styles.forgotText}>Amatun© 2026</Text>
                        </View>
                    </BlurView>
                </Animated.View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#064e3b' },
    keyboardView: { flex: 1, justifyContent: 'center', padding: 24 },
    contentContainer: { width: '100%' },

    // Floating Items
    floatingBike: {
        position: 'absolute', top: '10%', right: -20, width: 140, height: 140, opacity: 0.3
    },
    floatingVan: {
        position: 'absolute', bottom: '15%', left: -50, width: 180, height: 180, opacity: 0.2
    },
    floatingBox: {
        position: 'absolute', top: '25%', left: 20, width: 80, height: 80, opacity: 0.3
    },
    floatingSachet: {
        position: 'absolute', bottom: '25%', right: 40, width: 100, height: 100, opacity: 0.25
    },

    logoContainer: { alignItems: 'center', marginBottom: 30 },
    logoWrapper: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        padding: 15,
        borderRadius: 30,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)'
    },
    logoImage: { width: 80, height: 80, resizeMode: 'contain' },
    title: { fontSize: 32, fontWeight: 'bold', color: 'white', letterSpacing: 1 },
    subtitle: { fontSize: 16, color: '#a7f3d0', fontWeight: '500', marginTop: 4, letterSpacing: 0.5 },

    glassContainer: {
        borderRadius: 32,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.4)',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
    },
    formContent: { padding: 24 },

    inputGroup: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: '#1f2937', marginBottom: 8, marginLeft: 4 },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 16,
        paddingHorizontal: 12,
        height: 56,
    },
    inputIcon: { marginRight: 10 },
    input: {
        flex: 1,
        fontSize: 16,
        color: '#111827',
        height: '100%',
    },
    eyeIcon: { padding: 8 },

    loginBtn: {
        marginTop: 10,
        borderRadius: 16,
        overflow: 'hidden',
    },
    btnGradient: {
        flexDirection: 'row',
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabledBtn: { opacity: 0.7 },
    loginBtnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    chevron: { marginLeft: 8 },

    forgotPass: { marginTop: 20, alignItems: 'center' },
    forgotText: { color: '#000000ff', fontWeight: '600', fontSize: 12 , marginTop: 10, alignContent: 'center', alignItems: 'center', justifyContent: 'center' }
});