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
      try {
        await this.initializeNative();
      } catch (error) {
        console.warn('⚠️ Native push notifications unavailable:', error);
      }
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

      await PushNotifications.addListener('registration', (token: Token) => {
        console.log('✅ Push registration success, token: ' + token.value);
        localStorage.setItem('fcm_token', token.value);
      });

      await PushNotifications.addListener('registrationError', (error) => {
        console.error('❌ Push registration error:', error);
        localStorage.setItem('fcm_error', JSON.stringify(error));
      });

      await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        console.log('📬 Push notification received:', notification);
      });

      await PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
        console.log('👆 Push notification action performed:', notification);
      });

      console.log('Registering for push notifications...');

      try {
        await PushNotifications.register();
        await this.waitForFCMToken();
      } catch (registerError: any) {
        console.error('Push notification registration failed:', registerError);

        localStorage.setItem('fcm_unavailable', 'true');

        if (registerError?.code === 'FIREBASE_NOT_CONFIGURED' ||
            registerError?.message?.includes('Firebase not configured')) {
          console.warn('⚠️ Firebase not configured - push notifications will be unavailable');
          return;
        }

        const errorStr = JSON.stringify(registerError);
        if (errorStr.includes('FirebaseApp') || errorStr.includes('google-services')) {
          console.warn('⚠️ Firebase not available - continuing without push notifications');
          return;
        }

        console.warn('⚠️ Push registration error (continuing anyway):', registerError);
        return;
      }

    } catch (error) {
      console.error('Error initializing native push notifications:', error);
      localStorage.setItem('fcm_unavailable', 'true');
    }
  }

  private static async waitForFCMToken(maxWaitMs: number = 5000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const token = localStorage.getItem('fcm_token');
      if (token) {
        console.log('✅ FCM token ready:', token.substring(0, 20) + '...');
        return;
      }

      const error = localStorage.getItem('fcm_error');
      if (error) {
        localStorage.removeItem('fcm_error');
        console.error('FCM registration error detected:', error);

        const errorStr = error.toLowerCase();

        if (errorStr.includes('api key') || errorStr.includes('apikey')) {
          throw new Error('Firebase not properly configured. Please set up a real Firebase project:\n\n1. Go to https://console.firebase.google.com/\n2. Create a project\n3. Add Android app (package: com.iceout.app)\n4. Download google-services.json\n5. Replace android/app/google-services.json\n6. Rebuild the app');
        }

        if (errorStr.includes('firebaseapp') || errorStr.includes('google-services')) {
          throw new Error('Firebase not configured. To enable push notifications, add google-services.json from Firebase Console to android/app/ directory.');
        }

        throw new Error('FCM registration failed: ' + error);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Timeout waiting for FCM token. Firebase may not be properly configured.');
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

  static createDummySubscription(): PushSubscription {
    const deviceId = this.getOrCreateDeviceId();

    return {
      endpoint: `dummy://device/${deviceId}`,
      expirationTime: null,
      keys: {
        p256dh: 'dummy-p256dh-key',
        auth: 'dummy-auth-key'
      },
      toJSON: () => ({
        endpoint: `dummy://device/${deviceId}`,
        expirationTime: null,
        keys: {
          p256dh: 'dummy-p256dh-key',
          auth: 'dummy-auth-key'
        }
      })
    } as unknown as PushSubscription;
  }

  private static getOrCreateDeviceId(): string {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
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

