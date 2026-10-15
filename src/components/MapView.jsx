import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Polyline,
  Circle,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

// Fix Leaflet marker icons for Vite bundling
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const DEFAULT_CENTER = [12.9716, 77.5946]; // Bengaluru — fallback only

/** Smoothly fly the map to a new position whenever `position` changes. */
function MapController({ position }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, 17, { duration: 1 });
    }
  }, [position, map]);

  return null;
}

/** Captures map clicks and calls addPoint only when drawing mode is active. */
function MapClickHandler({ drawing, addPoint }) {
  useMapEvents({
    click({ latlng }) {
      if (drawing) {
        addPoint([latlng.lat, latlng.lng]);
      }
    },
  });
  return null;
}

const TILE_LAYERS = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA",
  },
};

/**
 * MapView — renders the Leaflet map and all overlay layers.
 *
 * Props:
 *  position   [lat, lng] | null  — GPS fix (centres the map)
 *  accuracy   number | null      — metres (shown as accuracy ring)
 *  points     [lat, lng][]       — boundary points
 *  drawing    boolean
 *  tracking   boolean
 *  validated  boolean
 *  addPoint   fn
 *  tileMode   "street" | "satellite"
 */
export default function MapView({
  position,
  accuracy,
  points,
  drawing,
  tracking,
  validated,
  addPoint,
  tileMode = "street",
}) {
  const tile = TILE_LAYERS[tileMode] ?? TILE_LAYERS.street;

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={13}
      scrollWheelZoom
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer url={tile.url} attribution={tile.attribution} />

      <MapController position={position} />
      <MapClickHandler drawing={drawing} addPoint={addPoint} />

      {/* GPS position marker + accuracy ring */}
      {position && (
        <>
          <Marker position={position} />
          {accuracy != null && (
            <Circle
              center={position}
              radius={accuracy}
              pathOptions={{
                color: "#3b82f6",
                fillColor: "#93c5fd",
                fillOpacity: 0.2,
                weight: 1,
              }}
            />
          )}
        </>
      )}

      {/* Boundary point markers — stable keys using coords + index */}
      {points.map((pt, i) => (
        <Marker key={`${pt[0].toFixed(7)}-${pt[1].toFixed(7)}-${i}`} position={pt} />
      ))}

      {/* Live walk: show a polyline while tracking */}
      {tracking && points.length >= 2 && (
        <Polyline
          positions={points}
          pathOptions={{ color: "#f97316", weight: 4 }}
        />
      )}

      {/* Finished polygon — shown after walking OR drawing (when not actively tracking) */}
      {!tracking && points.length >= 3 && (
        <Polygon
          positions={points}
          pathOptions={{
            color: validated ? "#15803d" : "#ca8a04",
            fillColor: validated ? "#4ade80" : "#fde047",
            fillOpacity: 0.3,
          }}
        />
      )}
    </MapContainer>
  );
}
