import { Client } from '@stomp/stompjs';
import { TextEncoder, TextDecoder } from 'text-encoding';

// Polyfill nécessaire pour React Native
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Utilisation du tunnel Dev pour les WebSockets (wss:// au lieu de ws://)
const WS_URL = 'wss://lpvq76hs-8085.uks1.devtunnels.ms/ws/websocket';

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
        // S'abonner aux notifications personnelles (Ciblées par le backend selon l'état online)
        if (livreurId) {
          this.client.subscribe(`/topic/livreurs/${livreurId}`, (message) => {
            if (message.body) {
              console.log('📬 WS Message Received on personal topic:', message.body);
              const data = JSON.parse(message.body);

              // 1. Check for Grande Commande (Bundle of orders)
              if (data.commandes && Array.isArray(data.commandes)) {
                console.log('📦 Identified as GRANDE_COMMANDE');
                this.onMessageCallback({ type: 'GRANDE_COMMANDE', data });
              }
              // 2. Check for Demande Livraison (Special requests)
              else if (data.typeArticle) {
                console.log('🚲 Identified as NEW_DEMANDE');
                this.onMessageCallback({ type: 'NEW_DEMANDE', data });
              }
              // 3. Check for Personal Message / Notification (Text)
              else if (typeof data === 'string' || data.message || data.notification) {
                console.log('🔔 Identified as PERSONAL_NOTIFICATION');
                this.onMessageCallback({
                  type: 'PERSONAL_NOTIFICATION',
                  data: typeof data === 'string' ? data : (data.message || data.notification)
                });
              }
              // 4. Default to single Order
              else {
                console.log('📦 Identified as NEW_ORDER');
                this.onMessageCallback({ type: 'NEW_ORDER', data });
              }
            }
          });
        }

        // S'abonner aux acceptations (Global pour mettre à jour les listes de tous les livreurs)
        this.client.subscribe('/topic/commande-accepted', (message) => {
          if (message.body) {
            const data = JSON.parse(message.body);
            this.onMessageCallback({ type: 'ORDER_ACCEPTED', data });
          }
        });
      },
      onStompError: (frame) => {
        console.error('Erreur Broker: ' + frame.headers['message']);
      },
    });
  }

  activate() {
    this.client.activate();
  }

  deactivate() {
    this.client.deactivate();
  }
}