import { useEffect, useState, useMemo, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Report } from '../types/Report';


// --- 1. Define Custom Icons ---
// Using colored markers from leaflet-color-markers repository
const createIcon = (color: string) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const Icons = {
  critical: createIcon('red'),
  active: createIcon('orange'),
  observed: createIcon('green'),
  other: createIcon('blue')
};

// --- 2. Helper to center map on user location ---
function UserLocationMarker() {
  const [position, setPosition] = useState<L.LatLngExpression | null>(null);
  const map = useMap();

  useEffect(() => {
    map.locate().on('locationfound', function (e) {
      setPosition(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
    });
  }, [map]);

  return position === null ? null : (
    <Marker position={position} icon={createIcon('blue')}>
      <Popup>You are here</Popup>
    </Marker>
  );
}

// --- 2.5. Location Picker for Alert Mode ---
interface LocationPickerProps {
  onLocationSelect: (latlng: L.LatLng) => void;
}

function LocationPicker({ onLocationSelect }: LocationPickerProps) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng);
    },
  });
  return null;
}


// --- 3. The Main Map Component ---
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

  // Memoize circles to prevent re-renders during zoom/pan
  const tempCircle = useMemo(() => {
    if (showModal && alertCenter && !activeAlert) {
      return (
        <Circle
          center={alertCenter}
          radius={alertRadius}
          pathOptions={{
            color: '#ff0000',
            fillColor: '#ff0000',
            fillOpacity: 0.08,
            weight: 2
          }}
        />
      );
    }
    return null;
  }, [showModal, alertCenter, alertRadius, activeAlert]);

  const activeCircle = useMemo(() => {
    if (activeAlert) {
      return (
        <Circle
          center={activeAlert.center}
          radius={activeAlert.radius}
          pathOptions={{
            color: '#ff0000',
            fillColor: '#ff0000',
            fillOpacity: 0.08,
            weight: 2
          }}
        />
      );
    }
    return null;
  }, [activeAlert]);

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

  const getIcon = (report: Report) => {
    const type = (report.report_type || '').toLowerCase();
    const status = (report.status !== undefined ? report.status : -1);
    const category = report.category_enum;

    // Critical/Red markers for arrests and critical incidents
    if (category === 4 || category === 3 || type.includes('arrest') || type.includes('critical') || status === 3) {
      return Icons.critical;
    }

    // Active/Orange markers for ongoing incidents
    if (category === 2 || type.includes('active') || status === 2) {
      return Icons.active;
    }

    // Observed/Green markers for reported observations
    if (category === 1 || type.includes('observed') || type.includes('observation') || status === 1) {
      return Icons.observed;
    }

    // Default blue for other types
    return Icons.other;
  };

  const formatTime = (timeString: string) => {
    try {
      return new Date(timeString).toLocaleString();
    } catch {
      return timeString;
    }
  };

  const getMapCenter = (): [number, number] => {
    if (reports.length === 0) return [39.8283, -98.5795]; // Center of USA

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
        validCoords.push([lat, lng]);
      }
    });

    if (validCoords.length === 0) return [39.8283, -98.5795];

    const avgLat = validCoords.reduce((sum, coord) => sum + coord[0], 0) / validCoords.length;
    const avgLng = validCoords.reduce((sum, coord) => sum + coord[1], 0) / validCoords.length;

    return [avgLat, avgLng];
  };

  const getMapZoom = (): number => {
    if (reports.length === 0) return 4;
    if (reports.length === 1) return 10;

    const validReports = reports.filter(r => r.latitude && r.longitude);
    if (validReports.length === 0) return 4;

    return validReports.length > 100 ? 4 : validReports.length > 20 ? 6 : 8;
  };

  return (
    <MapContainer
      center={getMapCenter()}
      zoom={getMapZoom()}
      style={{ height: '100%', width: '100%', zIndex: 1 }}
      scrollWheelZoom={true}
    >
      {/* OpenStreetMap Tiles */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* User's location marker */}
      <UserLocationMarker />

      {/* Location picker for alert mode */}
      {isAlertMode && onCenterChange && (
        <LocationPicker onLocationSelect={(latlng) => onCenterChange(latlng.lat, latlng.lng)} />
      )}

      {/* Alert area circles (memoized to prevent zoom lag) */}
      {tempCircle}
      {activeCircle}

      {/* Plot all report markers */}
      {reports.map((report, index) => {
        // Safety check: ensure valid coordinates exist
        // Handle multiple coordinate formats:
        // 1. Direct properties: report.latitude, report.longitude
        // 2. Alternative names: report.lat, report.lng, report.lon
        // 3. GeoJSON format: report.location.coordinates [lng, lat]

        let lat, lng;

        if (report.location && report.location.coordinates && Array.isArray(report.location.coordinates)) {
          // GeoJSON format: [longitude, latitude] (reversed!)
          lng = report.location.coordinates[0];
          lat = report.location.coordinates[1];
        } else {
          lat = report.latitude || report.lat;
          lng = report.longitude || report.lng || report.lon;
        }

        if (!lat || !lng || typeof lat !== 'number' || typeof lng !== 'number') {
          console.warn('Skipping report with invalid coordinates:', report);
          return null;
        }

        return (
          <Marker
            key={report.id || index}
            position={[lat, lng]}
            icon={getIcon(report)}
          >
            <Popup maxWidth={300}>
              <div style={{ fontFamily: 'Arial, sans-serif' }}>
                <strong style={{ fontSize: '14px', color: '#333' }}>
                  {report.report_type || getCategoryName(report.category_enum) || 'Unknown Report'}
                </strong>
                <br />
                <small style={{ color: '#666' }}>
                  {report.incident_time ? formatTime(report.incident_time) : 'Time unknown'}
                </small>
                <br /><br />
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {report.description || report.details || report.location_description || 'No description provided.'}
                </div>
                {report.location_description && (
                  <>
                    <br />
                    <small style={{ color: '#999' }}>
                      📍 {report.location_description}
                    </small>
                  </>
                )}
                {report.small_thumbnail && (
                  <>
                    <br /><br />
                    <img
                      src={report.small_thumbnail}
                      alt="Report thumbnail"
                      style={{ width: '100%', borderRadius: '4px' }}
                    />
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};

export default memo(MapView);
