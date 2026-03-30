import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LivreurService } from '../services/LivreurService';

export default function QRScannerScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const navigation = useNavigation<any>();

    useEffect(() => {
        if (!permission) {
            requestPermission();
        }
    }, [permission]);

    if (!permission) {
        // Camera permissions are still loading.
        return <View />;
    }

    if (!permission.granted) {
        // Camera permissions are not granted yet.
        return (
            <View style={styles.container}>
                <Text style={styles.message}>Nous avons besoin de votre permission pour utiliser la caméra</Text>
                <TouchableOpacity onPress={requestPermission} style={styles.button}>
                    <Text style={styles.buttonText}>Accorder la permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const handleBarCodeScanned = async ({ data }: { data: string }) => {
        if (scanned) return;
        setScanned(true);

        try {
            // Le QR code contient le token
            const commande = await LivreurService.getCommandeByToken(data);
            if (commande && commande.id) {
                navigation.replace('CommandeDetails', { commandeId: commande.id });
            } else {
                throw new Error('Commande non trouvée');
            }
        } catch (error) {
            Alert.alert(
                "Erreur",
                "Code QR invalide ou commande introuvable.",
                [{ text: "Réessayer", onPress: () => setScanned(false) }]
            );
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="close" size={28} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Scanner la commande</Text>
            </View>

            <CameraView
                style={styles.camera}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{
                    barcodeTypes: ["qr"],
                }}
            >
                <View style={styles.overlay}>
                    <View style={styles.unfocusedContainer}></View>
                    <View style={styles.middleContainer}>
                        <View style={styles.unfocusedContainer}></View>
                        <View style={styles.focusedContainer}>
                            {/* Border corners can be added here for better UI */}
                        </View>
                        <View style={styles.unfocusedContainer}></View>
                    </View>
                    <View style={styles.unfocusedContainer}></View>
                </View>
            </CameraView>

            <View style={styles.footer}>
                <Text style={styles.footerText}>Placez le code QR dans le cadre pour le scanner</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    camera: {
        flex: 1,
    },
    message: {
        textAlign: 'center',
        paddingBottom: 10,
        color: 'white',
        fontSize: 16,
    },
    button: {
        backgroundColor: '#059669',
        padding: 15,
        borderRadius: 10,
        alignSelf: 'center',
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    header: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        marginLeft: 15,
    },
    footer: {
        position: 'absolute',
        bottom: 50,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    footerText: {
        color: 'white',
        fontSize: 14,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    unfocusedContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    middleContainer: {
        flexDirection: 'row',
        height: 250,
    },
    focusedContainer: {
        width: 250,
        borderWidth: 2,
        borderColor: '#059669',
        borderRadius: 20,
    },
});
