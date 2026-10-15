import area from "@turf/area";
import kinks from "@turf/kinks";
import { polygon as turfPolygon } from "@turf/helpers";

/**
 * Convert [lat, lng] pairs to a closed GeoJSON coordinate ring.
 * GeoJSON uses [lng, lat] order.
 */
export function toCoordinateRing(points) {
  return [
    ...points.map(([lat, lng]) => [lng, lat]),
    [points[0][1], points[0][0]], // close the ring
  ];
}

/**
 * Calculate area in square metres for 3+ points, else 0.
 */
export function calcAreaSqM(points) {
  if (points.length < 3) return 0;
  return area(turfPolygon([toCoordinateRing(points)]));
}

/**
 * Validate a farm boundary and return an error string, or null if valid.
 * @param {Array<[number,number]>} points - Array of [lat, lng] pairs
 * @returns {string|null}
 */
export function validateBoundary(points) {
  if (points.length < 3) {
    return "Add at least 3 boundary points.";
  }

  // Reject consecutive duplicate points
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] === points[i - 1][0] && points[i][1] === points[i - 1][1]) {
      return "Two consecutive points are identical.";
    }
  }

  const farmPolygon = turfPolygon([toCoordinateRing(points)]);

  if (area(farmPolygon) < 1) {
    return "Farm boundary is too small or has zero area.";
  }

  // Insurance-relevant area constraints
  const areaSqM = area(farmPolygon);
  if (areaSqM < 1_000) {
    return "Farm area is below the minimum of 0.1 ha (1 000 m²).";
  }
  if (areaSqM > 1_000_000) {
    return "Farm area exceeds the maximum of 100 ha (1 000 000 m²).";
  }

  const intersections = kinks(farmPolygon);
  if (intersections.features.length > 0) {
    return "Boundary crosses itself. Please redraw it.";
  }

  return null;
}

/**
 * Haversine distance in metres between two [lat, lng] points.
 * @param {[number,number]} a
 * @param {[number,number]} b
 * @returns {number}
 */
export function distanceMetres(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6_371_000;

  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLat = lat2 - lat1;
  const dLng = toRad(b[1] - a[1]);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Calculate the perimeter in metres of a polygon.
 * @param {Array<[number,number]>} points
 * @returns {number}
 */
export function calcPerimetreM(points) {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    total += distanceMetres(points[i], points[(i + 1) % points.length]);
  }
  return total;
}

/**
 * Build a validated GeoJSON Feature from boundary points.
 * @param {Array<[number,number]>} points
 * @param {string} farmName
 * @param {number} areaSqM
 * @returns {object} GeoJSON Feature
 */
export function buildGeoJSON(points, farmName, areaSqM) {
  // Fallback UUID for non-secure (HTTP) contexts
  const farmId =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `farm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return {
    type: "Feature",
    properties: {
      farmName: farmName || "Unnamed Farm",
      farmId,
      project: "InsureChain",
      areaSquareMetres: areaSqM,
      areaHectares: areaSqM / 10_000,
      perimeterMetres: calcPerimetreM(points),
      boundaryPointCount: points.length,
      createdAt: new Date().toISOString(),
      validationStatus: "validated",
    },
    geometry: {
      type: "Polygon",
      coordinates: [toCoordinateRing(points)],
    },
  };
}
