import axios from 'axios';
import { decode } from '@msgpack/msgpack';
import { solveChallenge } from 'altcha-lib';

const api = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: {
    'x-api-version': '1.3',
    'Content-Type': 'application/json'
  }
});

// Store CSRF token for subsequent requests
let csrfToken: string | null = null;

api.interceptors.request.use((config) => {
  if (csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken;
  }
  return config;
});

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
      console.log('CSRF token stored:', csrfToken.substring(0, 10) + '...');

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
        console.log('CSRF token stored:', csrfToken.substring(0, 10) + '...');
      }
    } catch (error: any) {
      console.error('Submit failed:', error);
      console.error('Error response:', error.response?.data);
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
      headers: { 'Accept': 'application/msgpack' },
      responseType: 'arraybuffer' 
    });

    return decode(new Uint8Array(response.data));
  }
};
