// Type definition for IceOut API reports
export interface Report {
  id?: string | number;
  report_type?: string;
  status?: number | string;
  category_enum?: number;
  approved?: boolean;
  created_at?: string;
  incident_time?: string;

  // Coordinate formats
  latitude?: number;
  lat?: number;
  longitude?: number;
  lng?: number;
  lon?: number;

  // GeoJSON location format
  location?: {
    type: string;
    coordinates: [number, number]; // [longitude, latitude]
  };

  // Description fields
  description?: string;
  details?: string;
  location_description?: string;

  // Media
  small_thumbnail?: string;
  thumbnail?: string;
  image?: string;

  [key: string]: unknown; // Allow additional properties from API
}

export interface ApiResponse {
  results?: Report[];
  count?: number;
  next?: string | null;
  previous?: string | null;
}

