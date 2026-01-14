import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';


export class NotificationService {
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Notifications already initialized');
      return;
    }

    if (Capacitor.isNativePlatform()) {
      await this.initializeNative();
    } else {
      await this.initializeWeb();
    }

    this.isInitialized = true;
  }

  private static async initializeNative(): Promise<void> {
    console.log('🔔 Initializing native push notifications');

    try {
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        throw new Error('Push notification permission denied');
      }

      await PushNotifications.register();

      await PushNotifications.addListener('registration', (token: Token) => {
        console.log('✅ Push registration success, token: ' + token.value);
        localStorage.setItem('fcm_token', token.value);
      });

      await PushNotifications.addListener('registrationError', (error) => {
        console.error('❌ Push registration error:', error);
      });

      await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        console.log('📬 Push notification received:', notification);
      });

      await PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
        console.log('👆 Push notification action performed:', notification);
      });
    } catch (error) {
      console.error('Error initializing native push notifications:', error);
      throw error;
    }
  }

  private static async initializeWeb(): Promise<void> {
    console.log('🔔 Initializing web push notifications');

    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Workers are not supported in this browser');
    }

    if (!('PushManager' in window)) {
      throw new Error('Push notifications are not supported in this browser');
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });

    console.log('✅ Service worker registered:', registration);

    await navigator.serviceWorker.ready;
  }

  static async requestPermission(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      const permStatus = await PushNotifications.requestPermissions();
      return permStatus.receive === 'granted';
    } else {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
  }

  static async getSubscription(): Promise<PushSubscription | Token | null> {
    if (Capacitor.isNativePlatform()) {
      const token = localStorage.getItem('fcm_token');
      if (token) {
        return { value: token } as Token;
      }
      return null;
    } else {
      const registration = await navigator.serviceWorker.ready;
      return await registration.pushManager.getSubscription();
    }
  }

  static getFCMToken(): string | null {
    if (Capacitor.isNativePlatform()) {
      return localStorage.getItem('fcm_token');
    }
    return null;
  }


  static async subscribe(vapidPublicKey: string): Promise<PushSubscription | null> {
    if (Capacitor.isNativePlatform()) {
      await PushNotifications.register();
      return null;
    } else {
      const registration = await navigator.serviceWorker.ready;

      const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      return await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource
      });
    }
  }


  static isSupported(): boolean {
    if (Capacitor.isNativePlatform()) {
      return true;
    }
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  static async cleanup(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await PushNotifications.removeAllListeners();
    }
    this.isInitialized = false;
  }
}

