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
import { NotificationService } from '../services/NotificationService';
import { Capacitor } from '@capacitor/core';
import MapView from '../components/MapView';
import type { Report, ApiResponse } from '../types/Report';
import './Home.css';

// VAPID Public Key for push notifications (from IceOut API)
const VAPID_PUBLIC_KEY = 'BCgSBCOqpPadCbc7Oxg0v3qHJsOHLmA2RL3PnxH8gTDPYCxhK-hH6MkZqYJdh-yRajubKBBvppjPXwwadMsTKXU';


const Home: React.FC = () => {
  // Load cached reports from localStorage
  const getCachedReports = (): Report[] => {
    try {
      const cached = localStorage.getItem('iceout_reports');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  };

  // Load active alert from localStorage
  const getCachedAlert = (): { center: [number, number], radius: number } | null => {
    try {
      const cached = localStorage.getItem('iceout_active_alert');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  };

  const [reports, setReports] = useState<Report[]>(getCachedReports());
  const [status, setStatus] = useState('Initializing...');
  const [isLoading, setIsLoading] = useState(true);

  // Alert subscription state
  const [showModal, setShowModal] = useState(false);
  const [alertCenter, setAlertCenter] = useState<[number, number] | null>(null);
  const [alertRadius, setAlertRadius] = useState(8046); // Default 5 miles in meters
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);
  const [activeAlert, setActiveAlert] = useState<{ center: [number, number], radius: number } | null>(getCachedAlert());
  const [isAdjustingRadius, setIsAdjustingRadius] = useState(false);

  const hasInitialized = useRef(false);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      event.preventDefault();
      setStatus('❌ Error: ' + (event.reason?.message || 'Unknown error'));
      setIsSubscribing(false);
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      // If we already started, STOP immediately.
      if (hasInitialized.current) return;
      hasInitialized.current = true;

      try {
        // Show cached reports immediately if available
        const cachedReports = getCachedReports();
        if (cachedReports.length > 0) {
          setReports(cachedReports);
          setStatus(`Loaded ${cachedReports.length} cached reports`);
          // Keep loading state briefly to ensure map initializes properly
          setTimeout(() => {
            setIsLoading(false);
            setStatus('Refreshing...');
          }, 100);
        } else {
          setStatus('Solving Crypto Challenge...');
          setIsLoading(true);
        }

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

        // Save to localStorage
        localStorage.setItem('iceout_reports', JSON.stringify(points));

        setReports(points);
        setStatus(`Loaded ${points.length} reports`);
        setIsLoading(false);

        setTimeout(() => setStatus(''), 3000);

        setTimeout(async () => { // stopice data
          try {
            console.log('🔄 Loading additional reports from StopIce...');
            setStatus('Loading additional reports...');

            const stopIceReports = await IceOutApi.getStopIceReports();

            if (stopIceReports.length > 0) {
              const existingIds = new Set(points.map(r => r.id));
              const newReports = stopIceReports.filter(r => !existingIds.has(r.id));

              const combinedReports = [...points, ...newReports];

              console.log(`✅ Added ${newReports.length} new reports from StopIce`);
              console.log(`Total reports: ${combinedReports.length}`);

              setReports(combinedReports);
              localStorage.setItem('iceout_reports', JSON.stringify(combinedReports));

              setStatus(`Loaded ${combinedReports.length} total reports`);
              setTimeout(() => setStatus(''), 3000);
            } else {
              console.log('No additional reports from StopIce');
            }
          } catch (error) {
            console.error('Failed to load StopIce data:', error);
          }
        }, 1000);

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
      window.alert('Please tap the map to select a location to monitor.');
      return;
    }

    setIsSubscribing(true);
    setStatus('Setting up notifications...');

    try {
      if (!NotificationService.isSupported()) {
        throw new Error('Push notifications are not supported on this device');
      }

      console.log('📱 Initializing notification service...');

      await NotificationService.initialize();

      console.log('🔔 Requesting notification permission...');
      setStatus('Requesting permission...');

      // Request notification permission
      const granted = await NotificationService.requestPermission();

      if (!granted) {
        throw new Error('Notification permission denied');
      }

      console.log('✅ Notification permission granted');
      setStatus('Permission granted! Setting up...');

      // Subscribe to push notifications
      console.log('📡 Subscribing to push notifications...');
      setStatus('Registering device...');

      let subscription: PushSubscription | null = null;

      if (!Capacitor.isNativePlatform()) {
        subscription = await NotificationService.subscribe(VAPID_PUBLIC_KEY);
        if (!subscription) {
          throw new Error('Failed to create push subscription');
        }
        console.log('✅ Push subscription created:', subscription);
      } else {
        console.log('✅ Native push notifications registered');
        setStatus('Waiting for device token...');

        const fcmToken = NotificationService.getFCMToken();

        if (!fcmToken) {
          console.warn('⚠️ No FCM token available - using dummy subscription for backend only');
          setStatus('FCM unavailable - creating backend-only subscription...');

          subscription = NotificationService.createDummySubscription();
          console.log('📝 Created dummy subscription:', subscription.endpoint);
        } else {
          console.log('📱 Using FCM token:', fcmToken.substring(0, 20) + '...');
          setStatus('Device token received!');

          subscription = {
            endpoint: `fcm://${fcmToken}`,
            expirationTime: null,
            keys: {
              p256dh: 'fcm-native',
              auth: 'fcm-native'
            },
            toJSON: () => ({
              endpoint: `fcm://${fcmToken}`,
              expirationTime: null,
              keys: {
                p256dh: 'fcm-native',
                auth: 'fcm-native'
              }
            })
          } as unknown as PushSubscription;
        }
      }

      // Send subscription to backend
      console.log('📤 Sending subscription to backend...');
      setStatus('Connecting to server...');
      try {
        await IceOutApi.subscribeToAlerts(subscription, alertCenter, alertRadius);
        console.log('✅ Backend subscription successful');
        setStatus('Server registered!');
      } catch (apiError) {
        console.error('❌ Backend subscription failed:', apiError);
        throw apiError;
      }

      // Save the active alert to keep circle visible and persist across reloads
      console.log('💾 Saving alert to localStorage...');
      const alertData = { center: alertCenter, radius: alertRadius };
      setActiveAlert(alertData);

      try {
        localStorage.setItem('iceout_active_alert', JSON.stringify(alertData));
        console.log('✅ Alert saved to localStorage');
      } catch (storageError) {
        console.error('⚠️ Failed to save to localStorage:', storageError);
      }

      const isDummySubscription = subscription.endpoint.startsWith('dummy://');

      if (isDummySubscription) {
        setStatus('⚠️ Alert registered (push notifications unavailable)');
        console.log('⚠️ Alert registered in backend, but push notifications will not arrive without Firebase');
      } else {
        setStatus('✅ Alert activated!');
      }

      console.log('🎉 Subscription process complete!');

      requestAnimationFrame(() => {
        setTimeout(() => {
          console.log('Closing modal...');
          setShowModal(false);
          setAlertCenter(null);
          setIsSubscribing(false);

          if (isDummySubscription) {
            setTimeout(() => {
              window.alert('✅ Alert registered in backend!\n\n⚠️ Note: Push notifications are disabled without Firebase.\nThe alert circle will be visible on the map, but you won\'t receive actual push notifications.\n\nTo enable notifications, set up Firebase (see FIREBASE_REQUIRED.md)');
              setStatus('');
            }, 500);
          } else {
            setTimeout(() => setStatus(''), 500);
          }
        }, 1500);
      });

    } catch (error: unknown) {
      console.error('❌ Subscription error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus('❌ Failed: ' + errorMessage);
      setIsSubscribing(false);
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.alert('Failed to set up notifications: ' + errorMessage);
          setStatus('');
        }, 500);
      });
    }
  };

  const handleOpenModal = () => {
    console.log('Opening modal...');
    setShowModal(true);
    setAlertCenter(null); // Reset selection when opening
    setIsSelectingLocation(false); // Reset selection mode
  };

  const handleCloseModal = () => {
    console.log('Modal dismissed, isSelectingLocation:', isSelectingLocation);
    if (!isSelectingLocation) {
      console.log('Fully closing modal and resetting states');
      setShowModal(false);
      setAlertCenter(null);
    } else {
      console.log('Modal hidden temporarily for location selection');
    }
  };

  const handleExplicitClose = () => {
    console.log('User explicitly closed modal');
    setShowModal(false);
    setAlertCenter(null);
    setIsSelectingLocation(false);
  };

  const handleClearActiveAlert = async () => {
    try {
      setStatus('Removing alert...');

      // Try to unsubscribe from the server
      await IceOutApi.unsubscribeFromAlerts();

      // Clear local state and storage
      setActiveAlert(null);
      localStorage.removeItem('iceout_active_alert');

      setStatus('✅ Alert removed');
      setTimeout(() => setStatus(''), 2000);
    } catch (error) {
      console.error('Error removing alert:', error);
      // Still clear locally even if server request fails
      setActiveAlert(null);
      localStorage.removeItem('iceout_active_alert');
      setStatus('⚠️ Alert removed locally');
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const handleStartLocationSelection = () => {
    setIsSelectingLocation(true);
    setShowModal(false); // Close modal completely
  };

  const handleLocationSelected = (lat: number, lng: number) => {
    setAlertCenter([lat, lng]);
    setIsSelectingLocation(false);
    setShowModal(true); // Reopen modal
  };

  const handleCancelLocationSelection = () => {
    setIsSelectingLocation(false);
    setShowModal(true); // Reopen modal without selection
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

          {/* Location Selection Banner */}
          {isSelectingLocation && (
            <div style={{
              padding: '12px 20px',
              background: '#2196f3',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontWeight: 500,
              zIndex: 1000,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IonIcon icon={locationOutline} style={{ fontSize: '20px' }} />
                <span>Selecting an alert location</span>
              </div>
              <IonButton
                fill="clear"
                size="small"
                onClick={handleCancelLocationSelection}
                style={{ margin: 0, padding: 0, minHeight: 'auto' }}
              >
                <IonIcon icon={closeOutline} style={{ fontSize: '24px', color: '#fff' }} />
              </IonButton>
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
                isAlertMode={isSelectingLocation}
                alertCenter={alertCenter}
                alertRadius={alertRadius}
                onCenterChange={handleLocationSelected}
                activeAlert={activeAlert}
                showModal={showModal}
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
          onDidDismiss={handleCloseModal}
          initialBreakpoint={0.5}
          breakpoints={[0, 0.5, 0.75, 1.0]}
          style={{
            '--opacity': isAdjustingRadius ? '0.3' : '1',
            opacity: isAdjustingRadius ? 0.3 : 1,
            transition: 'opacity 0.2s ease'
          } as React.CSSProperties}
        >
          <IonHeader>
            <IonToolbar color="danger">
              <IonTitle>Create Location Alert</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={handleExplicitClose}>
                  <IonIcon icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>

          <IonContent className="ion-padding">
            <div style={{ padding: '10px 0' }}>
              {/* Active Alert Banner */}
              {activeAlert && (
                <div style={{
                  background: '#d1ecf1',
                  border: '1px solid #bee5eb',
                  borderRadius: '8px',
                  padding: '15px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <IonText color="primary">
                        <strong>Active Alert</strong>
                      </IonText>
                      <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#666' }}>
                        Monitoring {(activeAlert.radius / 1609.34).toFixed(1)} mi radius
                      </p>
                    </div>
                    <IonButton
                      size="small"
                      fill="outline"
                      color="danger"
                      onClick={handleClearActiveAlert}
                    >
                      Clear Alert
                    </IonButton>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div
                onClick={!alertCenter ? handleStartLocationSelection : undefined}
                style={{
                  textAlign: 'center',
                  padding: '20px',
                  background: alertCenter ? '#d4edda' : '#fff3cd',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  cursor: !alertCenter ? 'pointer' : 'default',
                  transition: 'all 0.3s ease'
                }}
              >
                {alertCenter ? (
                  <>
                    <IonIcon icon={locationOutline} style={{ fontSize: '32px', color: '#28a745' }} />
                    <IonText color="success">
                      <h3 style={{ margin: '10px 0' }}>Location Selected ✓</h3>
                    </IonText>
                    <p style={{ margin: '5px 0', color: '#666' }}>
                      Lng: {alertCenter[0].toFixed(4)}, Lat: {alertCenter[1].toFixed(4)}
                    </p>
                    <IonButton
                      size="small"
                      fill="outline"
                      color="primary"
                      onClick={handleStartLocationSelection}
                      style={{ marginTop: '10px' }}
                    >
                      Change Location
                    </IonButton>
                  </>
                ) : (
                  <>
                    <IonIcon icon={locationOutline} style={{ fontSize: '32px', color: '#ffc107' }} />
                    <IonText color="warning">
                      <h3 style={{ margin: '10px 0' }}>Tap Here to Select Location</h3>
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
                onIonInput={e => setAlertRadius(e.detail.value as number)}
                onIonKnobMoveStart={() => setIsAdjustingRadius(true)}
                onIonKnobMoveEnd={() => setIsAdjustingRadius(false)}
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
