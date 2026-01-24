import axios, { AxiosRequestConfig, AxiosHeaders } from 'axios';
import { decode } from '@msgpack/msgpack';
import { solveChallenge } from 'altcha-lib';
import { Capacitor } from '@capacitor/core';

const getBaseURL = () => {
  if (Capacitor.isNativePlatform()) {
    return 'https://iceout.org';
  }
  return '';
};

// Store CSRF token for subsequent requests
let csrfToken: string | null = null;

const createApiInstance = () => {
  const config: AxiosRequestConfig = {
    baseURL: getBaseURL(),
    timeout: 30000,
  };

  if (!Capacitor.isNativePlatform()) {
    config.withCredentials = true;
  }

  const instance = axios.create(config);

  instance.interceptors.request.use(
    (requestConfig) => {
      if (!requestConfig.headers) {
        requestConfig.headers = new AxiosHeaders();
      }

      requestConfig.headers['x-api-version'] = '1.3';

      if (Capacitor.isNativePlatform()) {
        requestConfig.headers['Origin'] = 'https://iceout.org';
        requestConfig.headers['Referer'] = 'https://iceout.org/en/';
        requestConfig.headers['User-Agent'] = 'IceOutApp/1.0 (Android)';
      }

      if (csrfToken) {
        requestConfig.headers['X-CSRFToken'] = csrfToken;
      }

      return requestConfig;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  return instance;
};

const api = createApiInstance();

export const IceOutApi = {

  async login() {
    console.log('1. Authenticating with server...');

    const response = await api.post('/auth/altcha/', {});

    console.log('Response status:', response.status);
    console.log('Response data:', response.data);

    if (response.data && response.data.csrf_token) {
      // Server returns auth directly without ALTCHA
      console.log('✅ Authentication successful (no ALTCHA required)');
      console.log('User:', response.data.user);
      console.log('Token expiry:', response.data.expiry);

      // Store CSRF token for future requests
      csrfToken = response.data.csrf_token;
      if (csrfToken) {
        console.log('CSRF token stored:', csrfToken.substring(0, 10) + '...');
      }

      return;
    }

    // Check for ALTCHA challenge
    let rawHeader = response.headers['x-altcha'];
    let challengeData;

    if (!rawHeader) {
      // Check if challenge is in response body
      if (response.data && response.data.challenge) {
        challengeData = response.data;
        console.log('Challenge found in response body');
      } else {
        throw new Error('Server response does not contain authentication or ALTCHA challenge');
      }
    } else {
      // Parse challenge from header
      console.log('Challenge found in X-Altcha header');
      rawHeader = rawHeader.trim();

      if (rawHeader.startsWith('{')) {
        challengeData = JSON.parse(rawHeader);
      } else {
        const cleanB64 = rawHeader.replace(/['"]+/g, '');
        challengeData = JSON.parse(atob(cleanB64));
      }
    }

    console.log('2. Challenge Received:', challengeData);
    console.log('Mining...');

    const solutionWrapper = solveChallenge(challengeData.challenge, challengeData.salt);
    const solution = await solutionWrapper.promise;
    if (!solution) throw new Error('Failed to solve Altcha challenge');

    console.log('Solution found:', solution);

    const payloadObj = {
      algorithm: challengeData.algorithm,
      challenge: challengeData.challenge,
      number: solution.number,
      salt: challengeData.salt,
      signature: challengeData.signature,
      took: solution.took 
    };
    
    const b64Payload = btoa(JSON.stringify(payloadObj));

    const submissionData = {
      signature: challengeData.signature,
      payload: b64Payload
    };
    console.log('3. Submitting solution...');

    try {
      const submitResponse = await api.post('/auth/altcha/', submissionData);
      console.log('✅ Login Success!');

      // Extract CSRF token if available
      if (submitResponse.data && submitResponse.data.csrf_token) {
        csrfToken = submitResponse.data.csrf_token;
        if (csrfToken) {
          console.log('CSRF token stored:', csrfToken.substring(0, 10) + '...');
        }
      }
    } catch (error: unknown) {
      console.error('Submit failed:', error);
      if (axios.isAxiosError(error)) {
        console.error('Error response:', error.response?.data);
      }
      throw error;
    }
  },

  async getReports() {
    console.log('Fetching reports...');
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1); 

    const response = await api.get('/api/reports/', {
      params: {
        archived: 'False',
        incident_time__gte: yesterday.toISOString(),
        incident_time__lte: now.toISOString()
      },
      headers: {
        'Accept': 'application/msgpack'
      },
      responseType: 'arraybuffer'
    });

    return decode(new Uint8Array(response.data));
  },

  async getStopIceReports() {
    console.log('Fetching StopIce reports...');

    try {
      const response = await axios.get('https://stopice.net/login/?recentmapdata=1&duration=since_yesterday', {
        timeout: 60000,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });

      const xmlText = response.data;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

      const mapDataElements = xmlDoc.getElementsByTagName('map_data');
      const reports = [];

      for (let i = 0; i < mapDataElements.length; i++) {
        const element = mapDataElements[i];

        const getId = (tag: string) => element.getElementsByTagName(tag)[0]?.textContent || '';

        const lat = parseFloat(getId('lat'));
        const lng = parseFloat(getId('long'));

        if (isNaN(lat) || isNaN(lng)) continue;

        const priority = getId('thispriority').toLowerCase();
        let category_enum = 0; // Other
        if (priority.includes('urgent') || priority.includes('confirmed')) {
          category_enum = 3; // Critical
        } else if (priority.includes('sighting')) {
          category_enum = 2; // Active Incident
        } else if (priority.includes('unconfirmed')) {
          category_enum = 1; // Observation
        }

        const report = {
          id: getId('id'),
          latitude: lat,
          longitude: lng,
          report_type: getId('thispriority'),
          description: getId('comments'),
          location_description: getId('location'),
          incident_time: getId('timestamp'),
          category_enum: category_enum,
          small_thumbnail: getId('media').split(',')[0] || undefined, // Take first media if multiple
          source: 'stopice.net'
        };

        reports.push(report);
      }

      console.log(`✅ Loaded ${reports.length} StopIce reports`);
      return reports;

    } catch (error) {
      console.error('❌ Failed to fetch StopIce reports:', error);
      return [];
    }
  },

  /**
   * Subscribe to push notifications for alerts in a specific area
   * @param subscription - PushSubscription object from browser
   * @param center - [latitude, longitude] center of the alert area
   * @param radiusMeters - Radius in meters to monitor
   */
  async subscribeToAlerts(subscription: PushSubscription, center: [number, number], radiusMeters: number) {
    console.log('📡 Subscribing to push notifications...');
    console.log('Alert area center:', center);
    console.log('Alert radius:', radiusMeters, 'meters');

    // Convert subscription to JSON format
    const subJson = subscription.toJSON();

    let alertId: string;
    try {
      alertId = crypto.randomUUID();
    } catch {
      alertId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    console.log('Alert ID:', alertId);

    // Build payload matching the backend API format
    const payload = {
      push_subscription: {
        endpoint: subJson.endpoint,
        expirationTime: subJson.expirationTime || null,
        keys: {
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth
        }
      },
      alerts: [
        {
          id: alertId,
          radius: radiusMeters,
          location: {
            type: "Point",
            // GeoJSON format: [longitude, latitude] - flip from Leaflet's [lat, lng]
            coordinates: [center[1], center[0]]
          },
          filter_fields: {
            confirmed_only: false,
            categories: [0, 1, 2, 3, 4] // All categories
          }
        }
      ]
    };

    console.log('Subscription payload:', JSON.stringify(payload, null, 2));

    try {
      const response = await api.post('/api/push-notifications-write/', payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Subscription successful!', response.data);
      return response.data;
    } catch (error: unknown) {
      console.error('❌ Subscription failed:', error);
      if (axios.isAxiosError(error)) {
        console.error('Error details:', error.response?.data);
        throw new Error(error.response?.data?.message || 'Failed to subscribe to alerts');
      }
      throw new Error('Failed to subscribe to alerts');
    }
  },

  /**
   * Unsubscribe from all push notifications by sending empty alerts array
   * @param subscription - PushSubscription object from browser (if available)
   */
  async unsubscribeFromAlerts(subscription?: PushSubscription) {
    console.log('📡 Unsubscribing from push notifications...');

    // If no subscription provided, try to get the active one
    if (!subscription && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
          subscription = existingSubscription;
        }
      } catch (error) {
        console.warn('Could not retrieve push subscription:', error);
      }
    }

    if (!subscription) {
      console.log('⚠️ No subscription found, clearing local alert only');
      return;
    }

    // Convert subscription to JSON format
    const subJson = subscription.toJSON();

    // Build payload with empty alerts array to remove all alerts
    const payload = {
      push_subscription: {
        endpoint: subJson.endpoint,
        expirationTime: subJson.expirationTime || null,
        keys: {
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth
        }
      },
      alerts: [] // Empty array removes all alerts for this subscription
    };

    console.log('Unsubscribe payload:', JSON.stringify(payload, null, 2));

    try {
      const response = await api.post('/api/push-notifications-write/', payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Unsubscribe successful!', response.data);
      return response.data;
    } catch (error: unknown) {
      console.error('❌ Unsubscribe failed:', error);
      if (axios.isAxiosError(error)) {
        console.error('Error details:', error.response?.data);
        throw new Error(error.response?.data?.message || 'Failed to unsubscribe from alerts');
      }
      throw new Error('Failed to unsubscribe from alerts');
    }
  }
};


