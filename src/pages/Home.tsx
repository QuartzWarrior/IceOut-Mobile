import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonFab,
  IonFabButton,
  IonIcon,
  IonModal,
  IonButton,
  IonButtons,
  IonRange,
  IonItem,
  IonLabel,
  IonText,
  IonChip
} from '@ionic/react';
import { notificationsOutline, closeOutline, locationOutline } from 'ionicons/icons';
import { useEffect, useState, useRef } from 'react';
import { IceOutApi } from '../services/IceOutApi';
import MapView from '../components/MapView';
import type { Report, ApiResponse } from '../types/Report';
import './Home.css';

// VAPID Public Key for push notifications (from IceOut API)
const VAPID_PUBLIC_KEY = 'BCgSBCOqpPadCbc7Oxg0v3qHJsOHLmA2RL3PnxH8gTDPYCxhK-hH6MkZqYJdh-yRajubKBBvppjPXwwadMsTKXU';

// Helper function to convert VAPID key to Uint8Array format for browser
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


const Home: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState('Initializing...');
  const [isLoading, setIsLoading] = useState(true);

  // Alert subscription state
  const [showModal, setShowModal] = useState(false);
  const [alertCenter, setAlertCenter] = useState<[number, number] | null>(null);
  const [alertRadius, setAlertRadius] = useState(8046); // Default 5 miles in meters
  const [isSubscribing, setIsSubscribing] = useState(false);

  const hasInitialized = useRef(false);

  useEffect(() => {
    const init = async () => {
      // If we already started, STOP immediately.
      if (hasInitialized.current) return;
      hasInitialized.current = true;

      try {
        setStatus('Solving Crypto Challenge...');
        setIsLoading(true);

        await IceOutApi.login();
        
        setStatus('Fetching Reports...');
        const data = await IceOutApi.getReports();
        
        console.log('=== RAW DATA SHAPE ===');
        console.log('Type:', Array.isArray(data) ? 'Array' : 'Object');
        console.log('Data:', data);

        // Handle different data shapes (array vs object)
        const points = Array.isArray(data) ? data : (data as ApiResponse).results || [];

        console.log('=== PROCESSED REPORTS ===');
        console.log('Total reports:', points.length);
        if (points.length > 0) {
          console.log('First report sample:', points[0]);
          console.log('Report keys:', Object.keys(points[0]));
        }

        setReports(points);
        setStatus(`Loaded ${points.length} reports`);
        setIsLoading(false);

        setTimeout(() => setStatus(''), 3000);

      } catch (e) {
        console.error('=== INITIALIZATION ERROR ===', e);
        setStatus('Error: ' + (e as Error).message);
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const handleSubscribe = async () => {
    if (!alertCenter) {
      alert('Please tap the map to select a location to monitor.');
      return;
    }

    setIsSubscribing(true);
    setStatus('Setting up notifications...');

    try {
      // Check if service workers are supported
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Workers are not supported in this browser');
      }

      if (!('PushManager' in window)) {
        throw new Error('Push notifications are not supported in this browser');
      }

      console.log('📱 Registering service worker...');

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('✅ Service worker registered:', registration);

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;

      console.log('🔔 Requesting notification permission...');

      // Request notification permission
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      console.log('✅ Notification permission granted');

      // Subscribe to push notifications
      console.log('📡 Subscribing to push notifications...');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      console.log('✅ Push subscription created:', subscription);

      // Send subscription to backend
      await IceOutApi.subscribeToAlerts(subscription, alertCenter, alertRadius);

      setStatus('✅ Alert activated!');

      // Show success message
      setTimeout(() => {
        alert(`Success! You will be notified of any reports within ${(alertRadius / 1609.34).toFixed(1)} miles of this location.`);
        setShowModal(false);
        setAlertCenter(null);
        setStatus('');
      }, 1000);

    } catch (error: any) {
      console.error('❌ Subscription error:', error);
      setStatus('❌ Failed to activate alert');
      alert('Failed to set up notifications: ' + error.message);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleOpenModal = () => {
    setShowModal(true);
    setAlertCenter(null); // Reset selection when opening
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>IceOut Reports Map</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {status && (
            <div style={{
              padding: '12px 20px',
              background: isLoading ? '#3880ff' : status.includes('❌') ? '#eb445a' : '#10dc60',
              color: '#fff',
              textAlign: 'center',
              fontWeight: 500,
              zIndex: 1000
            }}>
              {status}
            </div>
          )}
          <div style={{ flex: 1, position: 'relative' }}>
            {isLoading ? (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                zIndex: 999
              }}>
                <div style={{ fontSize: '18px', marginBottom: '10px' }}>Loading...</div>
              </div>
            ) : (
              <MapView
                reports={reports}
                isAlertMode={showModal}
                alertCenter={alertCenter}
                alertRadius={alertRadius}
                onCenterChange={(lat, lng) => setAlertCenter([lat, lng])}
              />
            )}
          </div>
        </div>

        {/* Floating Action Button for Notifications */}
        {!isLoading && (
          <IonFab vertical="bottom" horizontal="end" slot="fixed">
            <IonFabButton onClick={handleOpenModal} color="danger">
              <IonIcon icon={notificationsOutline} />
            </IonFabButton>
          </IonFab>
        )}

        {/* Alert Setup Modal */}
        <IonModal
          isOpen={showModal}
          onDidDismiss={() => setShowModal(false)}
          initialBreakpoint={0.5}
          breakpoints={[0, 0.5, 0.75]}
        >
          <IonHeader>
            <IonToolbar color="danger">
              <IonTitle>Create Location Alert</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setShowModal(false)}>
                  <IonIcon icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>

          <IonContent className="ion-padding">
            <div style={{ padding: '10px 0' }}>
              {/* Instructions */}
              <div style={{
                textAlign: 'center',
                padding: '20px',
                background: alertCenter ? '#d4edda' : '#fff3cd',
                borderRadius: '8px',
                marginBottom: '20px'
              }}>
                {alertCenter ? (
                  <>
                    <IonIcon icon={locationOutline} style={{ fontSize: '32px', color: '#28a745' }} />
                    <IonText color="success">
                      <h3 style={{ margin: '10px 0' }}>Location Selected ✓</h3>
                    </IonText>
                    <p style={{ margin: '5px 0', color: '#666' }}>
                      Lat: {alertCenter[0].toFixed(4)}, Lng: {alertCenter[1].toFixed(4)}
                    </p>
                  </>
                ) : (
                  <>
                    <IonIcon icon={locationOutline} style={{ fontSize: '32px', color: '#ffc107' }} />
                    <IonText color="warning">
                      <h3 style={{ margin: '10px 0' }}>Tap the Map</h3>
                    </IonText>
                    <p style={{ margin: '5px 0', color: '#666' }}>
                      Select a center point for your alert area
                    </p>
                  </>
                )}
              </div>

              {/* Radius Slider */}
              <IonItem lines="none" style={{ marginBottom: '10px' }}>
                <IonLabel>
                  <h2>Monitor Radius</h2>
                  <IonChip color="primary">
                    <IonLabel>{(alertRadius / 1609.34).toFixed(1)} miles</IonLabel>
                  </IonChip>
                  <IonChip color="secondary">
                    <IonLabel>{(alertRadius / 1000).toFixed(1)} km</IonLabel>
                  </IonChip>
                </IonLabel>
              </IonItem>

              <IonRange
                min={1609}
                max={80467}
                step={804.67}
                value={alertRadius}
                onIonChange={e => setAlertRadius(e.detail.value as number)}
                pin={true}
                ticks={false}
                snaps={true}
              >
                <IonLabel slot="start">1 mi</IonLabel>
                <IonLabel slot="end">50 mi</IonLabel>
              </IonRange>

              {/* Info Box */}
              <div style={{
                background: '#e7f3ff',
                padding: '15px',
                borderRadius: '8px',
                marginTop: '20px',
                marginBottom: '20px'
              }}>
                <IonText color="primary">
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                    <strong>How it works:</strong> You'll receive a notification whenever a new report
                    is submitted within your selected area. Notifications work even when the app is closed.
                  </p>
                </IonText>
              </div>

              {/* Subscribe Button */}
              <IonButton
                expand="block"
                size="large"
                onClick={handleSubscribe}
                disabled={!alertCenter || isSubscribing}
                color="danger"
              >
                {isSubscribing ? 'Setting up...' : '🔔 Start Monitoring'}
              </IonButton>

              {!alertCenter && (
                <p style={{
                  textAlign: 'center',
                  color: '#999',
                  fontSize: '13px',
                  marginTop: '10px'
                }}>
                  Select a location on the map first
                </p>
              )}
            </div>
          </IonContent>
        </IonModal>

      </IonContent>
    </IonPage>
  );
};

export default Home;
