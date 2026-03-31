import { Client } from '@stomp/stompjs';
import { TextEncoder, TextDecoder } from 'text-encoding';

// Polyfill nécessaire pour React Native
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

import { API_BASE_URL } from '../config/api';

import { StorageService } from './storage';

// Utilisation du tunnel Dev pour les WebSockets (wss:// au lieu de ws://)
const WS_URL = API_BASE_URL.replace('https', 'wss') + '/ws/websocket';

export class WebSocketService {
  private client: Client;
  private onMessageCallback: (msg: any) => void;

  constructor(onMessage: (msg: any) => void, livreurId?: number) {
    this.onMessageCallback = onMessage;

    this.client = new Client({
      brokerURL: WS_URL,
      forceBinaryWSFrames: true,
      appendMissingNULLonIncoming: true,
      onConnect: () => {
        // S'abonner aux notifications personnelles
        if (livreurId) {
          this.client.subscribe(`/topic/livreur/${livreurId}/notifications`, (message) => {
            if (message.body) {
              const notification = JSON.parse(message.body);
              this.handleNotification(notification);
            }
          });
        }

        // S'abonner aux notifications broadcast
        this.client.subscribe('/topic/livreur/notifications', (message) => {
          if (message.body) {
            const notification = JSON.parse(message.body);
            this.handleNotification(notification);
          }
        });
      },
      onStompError: (frame) => {
        console.error('Erreur Broker: ' + frame.headers['message']);
      },
    });
  }

  private handleNotification(notification: any) {
    console.log('📬 Notification reçue:', notification.entityType);
    
    if (notification.entityType === 'COMMANDE') {
      this.onMessageCallback({ type: 'NEW_ORDER', data: notification });
    } else if (notification.entityType === 'GRANDE_COMMANDE') {
      this.onMessageCallback({ type: 'GRANDE_COMMANDE', data: notification });
    } else if (notification.entityType === 'DEMANDE_LIVRAISON') {
      this.onMessageCallback({ type: 'NEW_DEMANDE', data: notification });
    } else {
      // Fallback notification text
      this.onMessageCallback({
        type: 'PERSONAL_NOTIFICATION',
        data: notification.message || notification.title
      });
    }
  }

  async activate() {
    const token = await StorageService.getItem('jwt');
    if (token) {
      this.client.connectHeaders = {
        'Authorization': `Bearer ${token}`
      };
    }
    this.client.activate();
  }

  deactivate() {
    this.client.deactivate();
  }
}