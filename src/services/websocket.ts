import { Client } from '@stomp/stompjs';
import { TextEncoder, TextDecoder } from 'text-encoding';

// Polyfill nécessaire pour React Native
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const WS_URL = 'ws://192.168.1.50:8085/ws/websocket';

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
        // S'abonner aux nouvelles notifications (Boutiques et Demandes Particulières)
        this.client.subscribe('/topic/livreurs', (message) => {
          if (message.body) {
            const data = JSON.parse(message.body);
            // On distingue selon la structure (DemandeLivraison a 'typeArticle', Commande a 'produits')
            if (data.typeArticle) {
              this.onMessageCallback({ type: 'NEW_DEMANDE', data });
            } else {
              this.onMessageCallback({ type: 'NEW_ORDER', data });
            }
          }
        });

        // S'abonner aux acceptations
        this.client.subscribe('/topic/commande-accepted', (message) => {
          if (message.body) {
            const data = JSON.parse(message.body);
            this.onMessageCallback({ type: 'ORDER_ACCEPTED', data });
          }
        });

        // S'abonner aux nouvelles demandes de livraison (Colis particuliers)
        this.client.subscribe('/topic/demandes', (message) => {
          if (message.body) {
            const data = JSON.parse(message.body);
            this.onMessageCallback({ type: 'NEW_DEMANDE', data });
          }
        });

        // S'abonner aux notifications personnelles
        if (livreurId) {
          this.client.subscribe(`/topic/livreur/${livreurId}`, (message) => {
            if (message.body) {
              // Si c'est juste un string comme "Nouvelle livraison acceptée"
              this.onMessageCallback({ type: 'PERSONAL_NOTIFICATION', data: message.body });
            }
          });
        }
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