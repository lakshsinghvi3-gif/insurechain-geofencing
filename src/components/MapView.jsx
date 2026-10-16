import { useEffect, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Polyline,
  Circle,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

// Fix Leaflet marker icons for Vite bundling
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { calcCentroid } from "../utils/geo";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

/**
 * Numbered vertex DivIcon (1-indexed).
 * Color changes based on whether this is the "active" (selected) boundary.
 */
function numberedIcon(n, isOptimized = false) {
  const bg = isOptimized ? "#7c3aed" : "#198754";
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${bg};color:#fff;border-radius:50%;
      width:22px;height:22px;display:flex;align-items:center;
      justify-content:center;font-size:11px;font-weight:700;
      border:2px solid #fff;box-shadow:0 1px 3px #0003;
      ">${n}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

const DEFAULT_CENTER = [12.9716, 77.5946]; // Bengaluru — fallback only

// ── MapController ─────────────────────────────────────────────────────────────

/**
 * Flies to `position` only when followGPS is true.
 * The effect is gated on `position` reference changes only — not followGPS —
 * so a user toggling followGPS back on doesn't trigger an unwanted fly.
 */
function MapController({ position, followGPS }) {
  const map = useMap();

  useEffect(() => {
    if (position && followGPS) {
      map.flyTo(position, 17, { animate: true, duration: 0.8 });
    }
    // Intentionally omit `followGPS` from deps — fly only on a new position fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, map]);

  return null;
}

// ── MapClickHandler ───────────────────────────────────────────────────────────

/**
 * Captures map clicks when drawing mode is active.
 * Ignores clicks during GPS-walk tracking to prevent simultaneous recording.
 */
function MapClickHandler({ drawing, tracking, addPoint }) {
  useMapEvents({
    click: useCallback(
      ({ latlng }) => {
        if (drawing && !tracking) {
          addPoint([latlng.lat, latlng.lng]);
        }
      },
      [drawing, tracking, addPoint]
    ),
  });
  return null;
}

// ── Tile layers ───────────────────────────────────────────────────────────────

const TILE_LAYERS = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA",
  },
};

// ── MapView ───────────────────────────────────────────────────────────────────

/**
 * Props:
 *  position          [lat, lng] | null
 *  accuracy          number | null         metres — shown as accuracy ring
 *  points            [lat, lng][]          original (captured) boundary points
 *  drawing           boolean
 *  tracking          boolean
 *  validated         boolean               is the SELECTED boundary validated
 *  followGPS         boolean               controls map auto-follow
 *  addPoint          (pt) => void
 *  tileMode          "street" | "satellite"
 *
 *  — Optimization overlay props —
 *  optimizedPoints   [lat, lng][] | null   optimized boundary (if available)
 *  selectedVersion   "original" | "optimized"
 *  showBothBoundaries boolean              when true, draw both outlines
 */
export default function MapView({
  position,
  accuracy,
  points,
  drawing,
  tracking,
  validated,
  followGPS,
  addPoint,
  tileMode = "street",
  // Optimization overlay
  optimizedPoints = null,
  selectedVersion = "original",
  showBothBoundaries = false,
}) {
  const tile = TILE_LAYERS[tileMode] ?? TILE_LAYERS.street;

  // Determine which points to show markers for (the active selection)
  const activePoints = selectedVersion === "optimized" && optimizedPoints
    ? optimizedPoints
    : points;

  const centroid = activePoints.length >= 3 ? calcCentroid(activePoints) : null;

  // ── Polygon color logic ───────────────────────────────────────────────────
  //
  // Compare mode (showBothBoundaries): show both outlines simultaneously
  //   Original  → blue dashed (#3b82f6), low opacity fill
  //   Optimized → purple (#7c3aed), slightly stronger fill
  //
  // Normal mode (single boundary):
  //   Unvalidated → amber (#b45309 / #fde047)
  //   Validated   → green (#15803d / #4ade80)

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={13}
      scrollWheelZoom
      style={{ width: "100%", height: "100%" }}
      aria-label="Farm boundary map"
    >
      <TileLayer url={tile.url} attribution={tile.attribution} />

      <MapController position={position} followGPS={followGPS} />
      <MapClickHandler drawing={drawing} tracking={tracking} addPoint={addPoint} />

      {/* ── GPS position marker + accuracy ring ──────────────────────────── */}
      {position && (
        <>
          <Marker position={position} title="Your current GPS position">
            <Tooltip direction="top" offset={[0, -40]} permanent={false}>
              📍 You
            </Tooltip>
          </Marker>
          {accuracy != null && (
            <Circle
              center={position}
              radius={accuracy}
              pathOptions={{
                color: "#3b82f6",
                fillColor: "#93c5fd",
                fillOpacity: 0.18,
                weight: 1,
              }}
            />
          )}
        </>
      )}

      {/* ── Live GPS walk: orange polyline while tracking ─────────────── */}
      {tracking && points.length >= 2 && (
        <Polyline
          positions={points}
          pathOptions={{ color: "#f97316", weight: 3, dashArray: "6 4" }}
        />
      )}

      {/* ── Compare mode: draw BOTH outlines ─────────────────────────── */}
      {!tracking && showBothBoundaries && points.length >= 3 && (
        <>
          {/* Original — blue dashed, ghost fill */}
          <Polygon
            positions={points}
            pathOptions={{
              color: "#1d4ed8",
              fillColor: "#93c5fd",
              fillOpacity: selectedVersion === "original" ? 0.25 : 0.08,
              weight: selectedVersion === "original" ? 2.5 : 1.5,
              dashArray: selectedVersion === "original" ? undefined : "8 4",
            }}
          />
          {/* Optimized — purple, ghost fill */}
          {optimizedPoints && optimizedPoints.length >= 3 && (
            <Polygon
              positions={optimizedPoints}
              pathOptions={{
                color: "#7c3aed",
                fillColor: "#c4b5fd",
                fillOpacity: selectedVersion === "optimized" ? 0.25 : 0.08,
                weight: selectedVersion === "optimized" ? 2.5 : 1.5,
                dashArray: selectedVersion === "optimized" ? undefined : "8 4",
              }}
            />
          )}
        </>
      )}

      {/* ── Normal mode: single polygon ───────────────────────────────── */}
      {!tracking && !showBothBoundaries && activePoints.length >= 3 && (
        <Polygon
          positions={activePoints}
          pathOptions={{
            color: validated
              ? (selectedVersion === "optimized" ? "#7c3aed" : "#15803d")
              : "#b45309",
            fillColor: validated
              ? (selectedVersion === "optimized" ? "#c4b5fd" : "#4ade80")
              : "#fde047",
            fillOpacity: 0.3,
            weight: 2,
          }}
        />
      )}

      {/* ── Numbered vertex markers (active boundary only) ────────────── */}
      {!tracking && activePoints.map((pt, i) => (
        <Marker
          key={`${selectedVersion}-${pt[0].toFixed(7)}-${pt[1].toFixed(7)}-${i}`}
          position={pt}
          icon={numberedIcon(i + 1, selectedVersion === "optimized")}
          title={`${selectedVersion === "optimized" ? "Opt " : ""}Point ${i + 1}: ${pt[0].toFixed(6)}, ${pt[1].toFixed(6)}`}
        >
          <Tooltip direction="top" offset={[0, -14]} permanent={false}>
            {selectedVersion === "optimized" ? "🟣 Opt " : ""}Pt {i + 1} ({pt[0].toFixed(5)}, {pt[1].toFixed(5)})
          </Tooltip>
        </Marker>
      ))}

      {/* ── Centroid label ────────────────────────────────────────────── */}
      {centroid && !tracking && activePoints.length >= 3 && (
        <Marker
          position={centroid}
          icon={L.divIcon({
            className: "",
            html: `<div style="
              background:rgba(255,255,255,0.92);
              border:1px solid ${selectedVersion === "optimized" ? "#7c3aed" : "#198754"};
              border-radius:6px;
              padding:3px 8px;
              font-size:12px;
              font-weight:700;
              color:#183326;
              white-space:nowrap;
              box-shadow:0 1px 4px #0002;
              ">${validated ? "✅ " : ""}${activePoints.length} pts${selectedVersion === "optimized" ? " (opt)" : ""}</div>`,
            iconAnchor: [50, 14],
          })}
        />
      )}
    </MapContainer>
  );
}
