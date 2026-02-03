import 'react-native-gesture-handler'; // DOIT ÊTRE LA PREMIÈRE LIGNE
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';

import HomeScreen from './src/screens/HomeScreen';
import LivreurDashboard from './src/screens/Commandes/LivreurDashboard';
import HistoryScreen from './src/screens/Commandes/HistoryScreen';
import CommandeDetailsScreen from './src/screens/Commandes/CommandeDetailsScreen';
import LoginScreen from './src/screens/LoginScreen';
import MapScreen from './src/screens/Commandes/MapScreen';
import { useAuth, AuthProvider } from './src/context/AuthContext';
import DemandeDetailScreen from './src/screens/Demandes/DemandeDetailScreen';
import DemandesListScreen from './src/screens/Demandes/DemandeListScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import GrandeCommandeDetailScreen from './src/screens/Commandes/GrandeCommandeDetailScreen';
import { NotificationService } from './src/services/NotificationService';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const Stack = createStackNavigator();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  React.useEffect(() => {
    // Enregistrement des notifications
    NotificationService.registerForPushNotificationsAsync().then(token => {
      if (token) {
        console.log("TOKEN POUR TESTER:", token);
      }
    });

    // Listener quand l'app est ouverte
    const subscription = NotificationService.addNotificationReceivedListener(notification => {
      console.log("Notification reçue en direct:", notification);
    });

    // Listener quand on clique sur la notification
    const responseSubscription = NotificationService.addNotificationResponseReceivedListener(response => {
      console.log("Notification cliquée:", response);
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Dashboard" component={LivreurDashboard} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="CommandeDetails" component={CommandeDetailsScreen} />
          <Stack.Screen name="MapScreen" component={MapScreen} />
          <Stack.Screen name="DemandesList" component={DemandesListScreen} />
          <Stack.Screen name="DemandeDetail" component={DemandeDetailScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="GrandeCommandeDetail" component={GrandeCommandeDetailScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SafeAreaProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}