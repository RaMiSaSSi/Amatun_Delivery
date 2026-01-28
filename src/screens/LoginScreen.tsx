import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import api from '../services/LivreurService';
import { AuthenticationResponse } from '../Types/auth'; // Importez l'interface créée étape 1

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Erreur', 'Veuillez remplir tous les champs');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post<AuthenticationResponse>('/auth/login', { email, password });

            // La logique de rôle est gérée dans le contexte (Guard)
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
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardView}
            >
                <View style={styles.logoContainer}>
                    <Image source={require('../../assets/Delivery.png')} style={styles.logoImage} />
                    <Text style={styles.title}>Espace Livreur</Text>
                    <Text style={styles.subtitle}>Connectez-vous pour livrer</Text>
                </View>

                <View style={styles.formContainer}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email</Text>
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

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Mot de passe</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="••••••••"
                            placeholderTextColor="#9ca3af"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                    </View>

                    <TouchableOpacity
                        onPress={handleLogin}
                        disabled={loading}
                        style={[styles.loginBtn, loading && styles.disabledBtn]}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.loginBtnText}>Se Connecter</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}
// ... styles ...

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0fdf4' }, // Emerald-50 background like web
    keyboardView: { flex: 1, justifyContent: 'center', padding: 24 },

    logoContainer: { alignItems: 'center', marginBottom: 40 },
    logoImage: {
        width: 120,
        height: 120,
        resizeMode: 'contain',
        marginBottom: 10
    },
    title: { fontSize: 28, fontWeight: 'bold', color: '#111827' },
    subtitle: { fontSize: 16, color: '#059669', fontWeight: '600', marginTop: 4, letterSpacing: 1 },

    formContainer: {
        backgroundColor: 'white', padding: 24, borderRadius: 24,
        shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05, shadowRadius: 10, elevation: 3
    },
    inputGroup: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginLeft: 4 },
    input: {
        backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
        borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#111827'
    },

    loginBtn: {
        backgroundColor: '#059669', borderRadius: 14, paddingVertical: 16,
        marginTop: 10, alignItems: 'center', shadowColor: "#059669",
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, elevation: 6
    },
    disabledBtn: { opacity: 0.7 },
    loginBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});