import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import { useEffect, useState, useRef } from 'react';
import { IceOutApi } from '../services/IceOutApi';
import MapView from '../components/MapView';
import type { Report, ApiResponse } from '../types/Report';
import './Home.css';

const Home: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState('Initializing...');
  const [isLoading, setIsLoading] = useState(true);

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
              background: isLoading ? '#3880ff' : '#10dc60',
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
              <MapView reports={reports} />
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Home;
