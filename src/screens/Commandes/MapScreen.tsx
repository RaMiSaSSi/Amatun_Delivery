import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, SafeAreaView, StatusBar, Platform, Linking, Alert, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Location from 'expo-location';
import polyline from '@mapbox/polyline';

type RootStackParamList = {
    MapScreen: {
        targetLat: number;
        targetLng: number;
        targetTitle: string;
        driverLat?: number;
        driverLng?: number;
    };
};

type MapScreenRouteProp = RouteProp<RootStackParamList, 'MapScreen'>;

export default function MapScreen() {
    const navigation = useNavigation();
    const route = useRoute<MapScreenRouteProp>();
    const { targetLat, targetLng, targetTitle, driverLat, driverLng } = route.params;

    const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(
        driverLat && driverLng ? { latitude: driverLat, longitude: driverLng } : null
    );
    const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
    const [loadingRoute, setLoadingRoute] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);
    const [heading, setHeading] = useState(0);
    const mapRef = useRef<MapView | null>(null);
    const locationSubscription = useRef<Location.LocationSubscription | null>(null);

    useEffect(() => {
        if (!driverLat || !driverLng) {
            getCurrentLocation();
        }
        return () => {
            if (locationSubscription.current) {
                locationSubscription.current.remove();
            }
        };
    }, []);

    useEffect(() => {
        if (currentLocation) {
            fetchRoute();
        }
    }, [currentLocation]);

    const getCurrentLocation = async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        let location = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
        });
    };

    const fetchRoute = async () => {
        if (!currentLocation) return;

        setLoadingRoute(true);
        try {
            // OSRM (Open Source Routing Machine) public demo server
            const url = `https://router.project-osrm.org/route/v1/driving/${currentLocation.longitude},${currentLocation.latitude};${targetLng},${targetLat}?overview=full&geometries=polyline`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                const points = polyline.decode(data.routes[0].geometry);
                const coords = points.map((point: [number, number]) => ({
                    latitude: point[0],
                    longitude: point[1],
                }));
                setRouteCoords(coords);

                // Fit map to show the entire route
                if (mapRef.current) {
                    mapRef.current.fitToCoordinates(coords, {
                        edgePadding: { top: 100, right: 100, bottom: 100, left: 100 },
                        animated: true,
                    });
                }
            }
        } catch (error) {
            console.error('Erreur lors de la récupération de l\'itinéraire:', error);
            // Fallback: direct line if road route fails
            setRouteCoords([currentLocation, { latitude: targetLat, longitude: targetLng }]);
        } finally {
            setLoadingRoute(false);
        }
    };

    const startNavigation = async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert("Permission refusée", "L'accès à la localisation est nécessaire pour la navigation.");
            return;
        }

        setIsNavigating(true);

        locationSubscription.current = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.BestForNavigation,
                timeInterval: 1000,
                distanceInterval: 1,
            },
            (location) => {
                const newPos = {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                };
                setCurrentLocation(newPos);
                if (location.coords.heading !== null) {
                    setHeading(location.coords.heading);
                }

                if (mapRef.current) {
                    mapRef.current.animateCamera({
                        center: newPos,
                        pitch: 45,
                        heading: location.coords.heading || 0,
                        altitude: 1000,
                        zoom: 18,
                    }, { duration: 1000 });
                }
            }
        );
    };

    const stopNavigation = () => {
        setIsNavigating(false);
        if (locationSubscription.current) {
            locationSubscription.current.remove();
            locationSubscription.current = null;
        }
        // Reset camera view
        if (mapRef.current && routeCoords.length > 0) {
            mapRef.current.fitToCoordinates(routeCoords, {
                edgePadding: { top: 100, right: 100, bottom: 100, left: 100 },
                animated: true,
            });
        }
    };

    const openExternalMap = async () => {
        const url = Platform.select({
            ios: `comgooglemaps://?q=${targetLat},${targetLng}&center=${targetLat},${targetLng}&zoom=14&views=traffic`,
            android: `google.navigation:q=${targetLat},${targetLng}`
        });

        if (url) {
            const canOpen = await Linking.canOpenURL(url);
            if (canOpen) {
                Linking.openURL(url);
            } else {
                // Fallback to web link which usually suggests Google Maps or opens in browser
                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLng}`);
            }
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isNavigating ? "light-content" : "dark-content"} />

            <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                showsUserLocation={isNavigating}
                followsUserLocation={isNavigating}
                showsCompass={true}
                initialRegion={{
                    latitude: targetLat,
                    longitude: targetLng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                }}
            >
                <Marker
                    coordinate={{ latitude: targetLat, longitude: targetLng }}
                    title={targetTitle}
                    pinColor="red"
                >
                    <View style={styles.destinationMarker}>
                        <Ionicons name="flag" size={20} color="white" />
                    </View>
                </Marker>

                {currentLocation && !isNavigating && (
                    <Marker
                        coordinate={currentLocation}
                        title="Ma position"
                        pinColor="blue"
                    />
                )}

                {routeCoords.length > 0 && (
                    <Polyline
                        coordinates={routeCoords}
                        strokeColor="#3b82f6"
                        strokeWidth={5}
                    />
                )}
            </MapView>

            {/* Overlay Header */}
            {!isNavigating && (
                <View style={styles.headerWrapper}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.premiumBackBtn}>
                        <Ionicons name="chevron-back" size={24} color="#1e293b" />
                    </TouchableOpacity>
                    <View style={styles.titleFloater}>
                        <Text style={styles.floaterLabel}>Destination</Text>
                        <Text style={styles.floaterTitle} numberOfLines={1}>{targetTitle}</Text>
                    </View>
                </View>
            )}

            {isNavigating && (
                <View style={styles.navHeader}>
                    <View style={styles.navHeaderIcon}>
                        <Ionicons name="navigate" size={28} color="white" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 15 }}>
                        <Text style={styles.navHeaderSubtitle}>EN NAVIGATION VERS</Text>
                        <Text style={styles.navHeaderMainTitle} numberOfLines={1}>{targetTitle}</Text>
                    </View>
                    <TouchableOpacity onPress={stopNavigation} style={styles.closeNavBtn}>
                        <Ionicons name="close" size={24} color="white" />
                    </TouchableOpacity>
                </View>
            )}

            {/* Bottom Actions */}
            {!isNavigating && (
                <View style={styles.bottomActions}>
                    <TouchableOpacity
                        style={styles.mainStartBtn}
                        onPress={startNavigation}
                    >
                        <Ionicons name="play-circle" size={24} color="white" />
                        <Text style={styles.mainStartBtnText}>DÉMARRER L'ITINÉRAIRE</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.externalGpsBtn}
                        onPress={openExternalMap}
                    >
                        <Ionicons name="map-outline" size={20} color="#1e293b" />
                        <Text style={styles.externalGpsBtnText}>Ouvrir avec Google Maps</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },
    map: { ...StyleSheet.absoluteFillObject },

    headerWrapper: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 40,
        left: 20,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12
    },
    premiumBackBtn: {
        width: 50,
        height: 50,
        borderRadius: 15,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8
    },
    titleFloater: {
        backgroundColor: 'white',
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 15,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        flex: 1
    },
    floaterLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 },
    floaterTitle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },

    bottomActions: {
        position: 'absolute',
        bottom: 30,
        left: 20,
        right: 20,
        gap: 12
    },
    mainStartBtn: {
        backgroundColor: '#1e293b',
        height: 60,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        elevation: 10,
        shadowColor: '#1e293b',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 8
    },
    mainStartBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    externalGpsBtn: {
        backgroundColor: 'white',
        height: 54,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        borderWidth: 1,
        borderColor: '#f1f5f9'
    },
    externalGpsBtnText: { color: '#1e293b', fontWeight: 'bold', fontSize: 14 },

    navHeader: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        backgroundColor: '#1e293b',
        padding: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        elevation: 15,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 10
    },
    navHeaderIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    navHeaderSubtitle: { color: '#94a3b8', fontSize: 10, fontWeight: '800' },
    navHeaderMainTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
    closeNavBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        justifyContent: 'center', alignItems: 'center'
    },
    destinationMarker: {
        backgroundColor: '#ef4444',
        padding: 8,
        borderRadius: 20,
        borderWidth: 3,
        borderColor: 'white',
        elevation: 8,
        shadowColor: '#ef4444',
        shadowOpacity: 0.3,
        shadowRadius: 5
    }
});
