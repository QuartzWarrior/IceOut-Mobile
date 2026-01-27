import { useEffect, useRef, useState, memo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import type { Report } from '../types/Report';

// --- MapView Props Interface ---
interface MapViewProps {
  reports: Report[];
  // Alert mode props
  isAlertMode?: boolean;
  alertCenter?: [number, number] | null;
  alertRadius?: number;
  onCenterChange?: (lat: number, lng: number) => void;
  activeAlert?: { center: [number, number], radius: number } | null;
  showModal?: boolean;
}

const MapView: React.FC<MapViewProps> = ({
  reports,
  isAlertMode = false,
  alertCenter = null,
  alertRadius = 8046, // Default 5 miles
  onCenterChange,
  activeAlert = null,
  showModal = false
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Helper functions
  const getCategoryName = (categoryEnum?: number): string => {
    const categories: { [key: number]: string } = {
      0: 'Other',
      1: 'Observation',
      2: 'Active Incident',
      3: 'Critical',
      4: 'Arrest',
    };
    return categoryEnum !== undefined ? categories[categoryEnum] || 'Unknown' : 'Unknown';
  };

  const getMarkerColor = (report: Report): string => {
    const type = (report.report_type || '').toLowerCase();
    const status = (report.status !== undefined ? report.status : -1);
    const category = report.category_enum;

    if (category === 4 || category === 3 || type.includes('arrest') || type.includes('critical') || status === 3) {
      return '#d32f2f'; // Red for critical
    }
    if (category === 2 || type.includes('active') || status === 2) {
      return '#ff9800'; // Orange for active
    }
    if (category === 1 || type.includes('observed') || type.includes('observation') || status === 1) {
      return '#4caf50'; // Green for observed
    }
    return '#2196f3'; // Blue for other
  };

  const formatTime = (timeString: string) => {
    try {
      return new Date(timeString).toLocaleString();
    } catch {
      return timeString;
    }
  };

  const getMapCenter = useCallback((): [number, number] => {
    if (reports.length === 0) return [-98.5795, 39.8283]; // Center of USA

    const validCoords: [number, number][] = [];

    reports.forEach(report => {
      let lat, lng;

      if (report.location && report.location.coordinates && Array.isArray(report.location.coordinates)) {
        lng = report.location.coordinates[0];
        lat = report.location.coordinates[1];
      } else {
        lat = report.latitude || report.lat;
        lng = report.longitude || report.lng || report.lon;
      }

      if (lat && lng && typeof lat === 'number' && typeof lng === 'number') {
        validCoords.push([lng, lat]); // MapLibre uses [lng, lat]
      }
    });

    if (validCoords.length === 0) return [-98.5795, 39.8283];

    const avgLng = validCoords.reduce((sum, coord) => sum + coord[0], 0) / validCoords.length;
    const avgLat = validCoords.reduce((sum, coord) => sum + coord[1], 0) / validCoords.length;

    return [avgLng, avgLat];
  }, [reports]);

  const getMapZoom = useCallback((): number => {
    if (reports.length === 0) return 4;
    if (reports.length === 1) return 10;

    const validReports = reports.filter(r => r.latitude && r.longitude);
    if (validReports.length === 0) return 4;

    return validReports.length > 100 ? 4 : validReports.length > 20 ? 6 : 8;
  }, [reports]);

  const createMarkerElement = (color: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.style.width = '25px';
    el.style.height = '41px';
    el.style.backgroundImage = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41"><path fill="${encodeURIComponent(color)}" d="M12.5,0 C5.6,0 0,5.6 0,12.5 C0,19.4 12.5,41 12.5,41 S25,19.4 25,12.5 C25,5.6 19.4,0 12.5,0 Z M12.5,17 C10,17 8,15 8,12.5 C8,10 10,8 12.5,8 C15,8 17,10 17,12.5 C17,15 15,17 12.5,17 Z"/></svg>')`;
    el.style.backgroundSize = 'cover';
    el.style.cursor = 'pointer';
    return el;
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const center = getMapCenter();
    const zoom = getMapZoom();

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: center,
      zoom: zoom
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);

      if (map.current) {
        map.current.addSource('temp-circle', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        map.current.addSource('active-circle', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        map.current.addLayer({
          id: 'temp-circle-fill',
          type: 'fill',
          source: 'temp-circle',
          paint: {
            'fill-color': '#ff0000',
            'fill-opacity': 0.08
          }
        });

        map.current.addLayer({
          id: 'temp-circle-outline',
          type: 'line',
          source: 'temp-circle',
          paint: {
            'line-color': '#ff0000',
            'line-width': 2
          }
        });

        map.current.addLayer({
          id: 'active-circle-fill',
          type: 'fill',
          source: 'active-circle',
          paint: {
            'fill-color': '#ff0000',
            'fill-opacity': 0.08
          }
        });

        map.current.addLayer({
          id: 'active-circle-outline',
          type: 'line',
          source: 'active-circle',
          paint: {
            'line-color': '#ff0000',
            'line-width': 2
          }
        });
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    const clickHandler = (e: maplibregl.MapMouseEvent) => {
      if (isAlertMode && onCenterChange) {
        onCenterChange(e.lngLat.lng, e.lngLat.lat);
      }
    };

    map.current.on('click', clickHandler);

    return () => {
      if (map.current) {
        map.current.off('click', clickHandler);
      }
    };
  }, [isAlertMode, onCenterChange]);

  useEffect(() => {
    if (!map.current) return;

    const canvas = map.current.getCanvas();
    if (isAlertMode) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
  }, [isAlertMode]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const getCurrentLocation = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          console.log('Getting location on native platform...');

          const permission = await Geolocation.checkPermissions();
          console.log('Location permission status:', permission);

          if (permission.location !== 'granted') {
            const requestResult = await Geolocation.requestPermissions();
            if (requestResult.location !== 'granted') {
              console.warn('Location permission denied');
              return;
            }
          }

          const coordinates = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000
          });

          if (map.current && userMarkerRef.current === null) {
            const el = createMarkerElement('#2196f3');
            userMarkerRef.current = new maplibregl.Marker({ element: el })
              .setLngLat([coordinates.coords.longitude, coordinates.coords.latitude])
              .setPopup(new maplibregl.Popup().setHTML('<strong>You are here</strong>'))
              .addTo(map.current);

            map.current.flyTo({
              center: [coordinates.coords.longitude, coordinates.coords.latitude],
              zoom: map.current.getZoom()
            });
          }
        } else {
          if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                if (map.current && userMarkerRef.current === null) {
                  const el = createMarkerElement('#2196f3');
                  userMarkerRef.current = new maplibregl.Marker({ element: el })
                    .setLngLat([position.coords.longitude, position.coords.latitude])
                    .setPopup(new maplibregl.Popup().setHTML('<strong>You are here</strong>'))
                    .addTo(map.current);

                  map.current.flyTo({
                    center: [position.coords.longitude, position.coords.latitude],
                    zoom: map.current.getZoom()
                  });
                }
              },
              (error) => {
                console.warn('Could not get user location:', error.message);
              },
              {
                timeout: 10000,
                maximumAge: 300000
              }
            );
          }
        }
      } catch (error) {
        console.warn('Could not get user location:', error);
      }
    };

    getCurrentLocation();
  }, [mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (reports.length === 0) return;

    reports.forEach((report) => {
      let lat, lng;

      if (report.location && report.location.coordinates && Array.isArray(report.location.coordinates)) {
        lng = report.location.coordinates[0];
        lat = report.location.coordinates[1];
      } else {
        lat = report.latitude || report.lat;
        lng = report.longitude || report.lng || report.lon;
      }

      if (!lat || !lng || typeof lat !== 'number' || typeof lng !== 'number') {
        console.warn('Skipping report with invalid coordinates:', report);
        return;
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.warn('Skipping report with out-of-range coordinates:', { lat, lng, report });
        return;
      }

      if (markersRef.current.length < 3) {
        console.log('Adding marker:', {
          reportType: report.report_type,
          lat,
          lng,
          lngLat: [lng, lat],
          originalLocation: report.location,
          originalLatLng: { lat: report.latitude || report.lat, lng: report.longitude || report.lng }
        });
      }

      const color = getMarkerColor(report);
      const el = createMarkerElement(color);

      const popupContent = `
        <div style="font-family: Arial, sans-serif; min-width: 200px;">
          <strong style="font-size: 14px; color: #333;">
            ${report.report_type || getCategoryName(report.category_enum) || 'Unknown Report'}
          </strong>
          <br />
          <small style="color: #666;">
            ${report.incident_time ? formatTime(report.incident_time) : 'Time unknown'}
          </small>
          <br /><br />
          <div style="max-height: 150px; overflow-y: auto;">
            ${report.description || report.details || report.location_description || 'No description provided.'}
          </div>
          ${report.location_description ? `
            <br />
            <small style="color: #999;">
              📍 ${report.location_description}
            </small>
          ` : ''}
          ${report.small_thumbnail ? `
            <br /><br />
            <img
              src="${report.small_thumbnail}"
              alt="Report thumbnail"
              style="width: 100%; border-radius: 4px;"
            />
          ` : ''}
        </div>
      `;

      const popup = new maplibregl.Popup({
        maxWidth: '300px',
        closeButton: true,
        closeOnClick: true
      }).setHTML(popupContent);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  }, [reports, mapLoaded]);

  const createCirclePolygon = (center: [number, number], radiusInMeters: number) => {
    const points = 64;
    const coords: number[][] = [];
    const distanceX = radiusInMeters / (111320 * Math.cos(center[1] * Math.PI / 180));
    const distanceY = radiusInMeters / 110574;

    for (let i = 0; i < points; i++) {
      const theta = (i / points) * (2 * Math.PI);
      const x = distanceX * Math.cos(theta);
      const y = distanceY * Math.sin(theta);
      coords.push([center[0] + x, center[1] + y]);
    }
    coords.push(coords[0]);

    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [coords]
      },
      properties: {}
    };
  };

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const source = map.current.getSource('temp-circle') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (showModal && alertCenter && !activeAlert) {
      const circle = createCirclePolygon(alertCenter, alertRadius);
      source.setData({
        type: 'FeatureCollection',
        features: [circle]
      });
    } else {
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }, [showModal, alertCenter, alertRadius, activeAlert, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const source = map.current.getSource('active-circle') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (activeAlert) {
      const circle = createCirclePolygon(activeAlert.center, activeAlert.radius);
      source.setData({
        type: 'FeatureCollection',
        features: [circle]
      });
    } else {
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }, [activeAlert, mapLoaded]);

  return (
    <div
      ref={mapContainer}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative'
      }}
    />
  );
};

export default memo(MapView);

