import area from "@turf/area";
import kinks from "@turf/kinks";
import simplify from "@turf/simplify";
import { polygon as turfPolygon } from "@turf/helpers";

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum insurable farm area in m² (0.1 ha). */
export const MIN_AREA_SQM = 1_000;

/** Maximum insurable farm area in m² (100 ha). */
export const MAX_AREA_SQM = 1_000_000;

/** Minimum vertex count for a valid polygon. */
export const MIN_POINTS = 3;

/**
 * Minimum closure distance for a GPS-walked boundary, in metres.
 * The last recorded point must be within this distance of the first.
 */
export const WALK_CLOSURE_M = 20;

// ── Coordinate helpers ───────────────────────────────────────────────────────

/**
 * Convert an array of [lat, lng] pairs into a closed GeoJSON coordinate ring
 * ([lng, lat] order, last point = first point).
 *
 * Throws if points has fewer than 3 elements (cannot form a ring).
 *
 * @param {Array<[number, number]>} points
 * @returns {Array<[number, number]>}
 */
export function toCoordinateRing(points) {
  if (points.length < 3) {
    throw new RangeError(
      `toCoordinateRing requires at least 3 points, got ${points.length}`
    );
  }
  const ring = points.map(([lat, lng]) => [lng, lat]);
  // GeoJSON rings must be explicitly closed
  ring.push([points[0][1], points[0][0]]);
  return ring;
}

/**
 * Return true if [lat, lng] is within valid WGS-84 bounds.
 *
 * @param {[number, number]} point
 * @returns {boolean}
 */
export function isValidCoord([lat, lng]) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    isFinite(lat) &&
    isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// ── Geodesic calculations ────────────────────────────────────────────────────

/**
 * Haversine great-circle distance in metres between two [lat, lng] points.
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {number}
 */
export function distanceMetres(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6_371_000; // Earth mean radius, metres

  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLat = lat2 - lat1;
  const dLng = toRad(b[1] - a[1]);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Geodesic area in square metres using @turf/area (spherical excess formula).
 * Returns 0 if fewer than 3 points are provided.
 *
 * @param {Array<[number, number]>} points
 * @returns {number}
 */
export function calcAreaSqM(points) {
  if (points.length < MIN_POINTS) return 0;
  try {
    return area(turfPolygon([toCoordinateRing(points)]));
  } catch {
    return 0;
  }
}

/**
 * Geodesic perimeter in metres (sum of Haversine edge lengths, ring closed).
 * Returns 0 if fewer than 2 points are provided.
 *
 * @param {Array<[number, number]>} points
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

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a farm boundary polygon.
 *
 * Checks (in order):
 *  1. Minimum vertex count (MIN_POINTS)
 *  2. All coordinates are finite WGS-84 values
 *  3. No consecutive duplicate vertices
 *  4. Area ≥ MIN_AREA_SQM and ≤ MAX_AREA_SQM
 *  5. No self-intersections (via @turf/kinks)
 *
 * @param {Array<[number, number]>} points  Array of [lat, lng] pairs.
 * @returns {string | null}  Error message, or null if valid.
 */
export function validateBoundary(points) {
  // 1. Minimum vertex count
  if (!Array.isArray(points) || points.length < MIN_POINTS) {
    return `Add at least ${MIN_POINTS} boundary points (currently ${
      Array.isArray(points) ? points.length : 0
    }).`;
  }

  // 2. All coordinates valid WGS-84
  for (let i = 0; i < points.length; i++) {
    if (!isValidCoord(points[i])) {
      return `Point ${i + 1} has invalid coordinates (${JSON.stringify(
        points[i]
      )}).`;
    }
  }

  // 3. No consecutive duplicates (also catches the wrap-around case)
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (a[0] === b[0] && a[1] === b[1]) {
      return `Points ${i + 1} and ${((i + 1) % n) + 1} are identical — remove one.`;
    }
  }

  // 4. Area constraints
  let areaSqM;
  try {
    areaSqM = area(turfPolygon([toCoordinateRing(points)]));
  } catch (err) {
    return `Could not calculate polygon area: ${err.message}`;
  }

  if (areaSqM < 1) {
    return "Farm boundary has zero or near-zero area — points may be collinear.";
  }
  if (areaSqM < MIN_AREA_SQM) {
    return `Farm area (${areaSqM.toFixed(0)} m²) is below the minimum of ${
      MIN_AREA_SQM
    } m² (0.1 ha). Move points further apart.`;
  }
  if (areaSqM > MAX_AREA_SQM) {
    return `Farm area (${(areaSqM / 10_000).toFixed(1)} ha) exceeds the maximum of ${
      MAX_AREA_SQM / 10_000
    } ha. Reduce the boundary.`;
  }

  // 5. Self-intersections
  let intersections;
  try {
    intersections = kinks(turfPolygon([toCoordinateRing(points)]));
  } catch (err) {
    return `Self-intersection check failed: ${err.message}`;
  }
  if (intersections.features.length > 0) {
    return `Boundary crosses itself at ${intersections.features.length} location(s). Redraw or undo the crossing segment.`;
  }

  return null; // valid
}

/**
 * Check whether a walked GPS trace is closed enough to form a polygon.
 * Returns an error string if the walk should not be auto-validated, else null.
 *
 * @param {Array<[number, number]>} points
 * @returns {string | null}
 */
export function checkWalkClosure(points) {
  if (points.length < MIN_POINTS) return validateBoundary(points); // propagate standard error
  const gap = distanceMetres(points[0], points[points.length - 1]);
  if (gap > WALK_CLOSURE_M) {
    return `Walk is not closed — the start and end points are ${gap.toFixed(
      0
    )} m apart (max ${WALK_CLOSURE_M} m). Walk back to your starting point.`;
  }
  return null;
}

// ── Farm ID ──────────────────────────────────────────────────────────────────

/**
 * Generate a stable farm ID.
 * Uses crypto.randomUUID when available (HTTPS contexts) and falls back to a
 * time + random string for HTTP / insecure contexts.
 *
 * This ID is generated ONCE per farm draft (in useGeofence, on init or resetAll).
 * It is intentionally NOT regenerated on each export.
 *
 * @returns {string}
 */
export function generateFarmId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback — not cryptographically strong but unique enough for local records
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `farm-${ts}-${rand}`;
}

// ── Centroid ─────────────────────────────────────────────────────────────────

/**
 * Arithmetic centroid (average of vertex coordinates) for display purposes.
 * Returns null if fewer than 1 point is provided.
 *
 * Note: This is a planar centroid — accurate enough for labelling at farm scale.
 *
 * @param {Array<[number, number]>} points
 * @returns {[number, number] | null}
 */
export function calcCentroid(points) {
  if (!points || points.length === 0) return null;
  const sumLat = points.reduce((acc, [lat]) => acc + lat, 0);
  const sumLng = points.reduce((acc, [, lng]) => acc + lng, 0);
  return [sumLat / points.length, sumLng / points.length];
}

// ── Display formatters ────────────────────────────────────────────────────────

/**
 * Format an area value (m²) for human display.
 * Shows hectares when ≥ 10,000 m², otherwise m².
 *
 * @param {number} sqM
 * @returns {string}
 */
export function formatArea(sqM) {
  if (sqM <= 0) return "—";
  if (sqM >= 10_000) {
    return `${(sqM / 10_000).toFixed(4)} ha`;
  }
  return `${sqM.toFixed(1)} m²`;
}

/**
 * Format a distance (metres) for human display.
 * Shows km when ≥ 1,000 m, otherwise m.
 *
 * @param {number} metres
 * @returns {string}
 */
export function formatDistance(metres) {
  if (metres <= 0) return "—";
  if (metres >= 1_000) {
    return `${(metres / 1_000).toFixed(3)} km`;
  }
  return `${metres.toFixed(1)} m`;
}

// ── Boundary Optimization ─────────────────────────────────────────────────────

/**
 * Attempt to optimize a farm boundary polygon.
 *
 * Strategy (conservative — does NOT invent or move geometry):
 *  1. Remove consecutive duplicate vertices (GPS jitter / stuck fix).
 *  2. Apply Douglas-Peucker simplification via @turf/simplify with a small
 *     tolerance (default ≈ 1 m in degrees). This only removes vertices that
 *     deviate from the line between their neighbours by less than `tolerance` —
 *     it never moves coordinates toward a guessed field edge.
 *  3. Validate the candidate through validateBoundary() — the same checks as
 *     any other boundary. If validation fails, return null and a reason.
 *
 * The original `points` array is NEVER mutated.
 *
 * @param {Array<[number, number]>} points  Original [lat, lng] pairs.
 * @param {object} [opts]
 * @param {number} [opts.tolerance=0.00001]  D-P tolerance in decimal degrees (~1 m).
 * @returns {{ optimized: Array<[number, number]> | null, error: string | null }}
 */
export function optimizeBoundary(points, { tolerance = 0.00001 } = {}) {
  if (!Array.isArray(points) || points.length < MIN_POINTS) {
    return { optimized: null, error: `Need at least ${MIN_POINTS} points to optimize.` };
  }

  // Step 1: remove consecutive duplicate vertices
  const deduped = points.filter((pt, i) => {
    if (i === 0) return true;
    const prev = points[i - 1];
    return !(pt[0] === prev[0] && pt[1] === prev[1]);
  });

  if (deduped.length < MIN_POINTS) {
    return {
      optimized: null,
      error: `After removing ${points.length - deduped.length} duplicate point(s), fewer than ${MIN_POINTS} remain.`,
    };
  }

  // Step 2: Douglas-Peucker simplification via @turf/simplify
  let simplified;
  try {
    // Turf works in [lng, lat] (GeoJSON) order
    const ring = toCoordinateRing(deduped); // [lng, lat][], closed
    const geojsonPoly = turfPolygon([ring]);
    const result = simplify(geojsonPoly, { tolerance, highQuality: true, mutate: false });
    // Extract the exterior ring, drop the closing duplicate vertex
    const coords = result.geometry.coordinates[0];
    const openRing = coords.slice(0, -1); // remove the repeated first vertex at end
    // Convert back to [lat, lng]
    simplified = openRing.map(([lng, lat]) => [lat, lng]);
  } catch (err) {
    return { optimized: null, error: `Simplification failed: ${err.message}` };
  }

  if (!Array.isArray(simplified) || simplified.length < MIN_POINTS) {
    return {
      optimized: null,
      error: `Simplification reduced the polygon below ${MIN_POINTS} vertices — try a smaller tolerance.`,
    };
  }

  // Step 3: Full boundary validation (area limits, self-intersection, duplicates…)
  const validationError = validateBoundary(simplified);
  if (validationError) {
    return { optimized: null, error: `Optimized candidate rejected: ${validationError}` };
  }

  return { optimized: simplified, error: null };
}

// ── GeoJSON export ───────────────────────────────────────────────────────────

/**
 * Build a GeoJSON Feature from a validated farm boundary.
 *
 * The farmId must be supplied by the caller (generated once at record creation,
 * not regenerated on each export call — see useGeofence.js).
 *
 * Does NOT perform validation — call validateBoundary() first.
 *
 * @param {{
 *   points:          Array<[number, number]>,
 *   farmId:          string,
 *   farmName:        string,
 *   validatedAt:     string,        ISO 8601
 *   geometryVersion: string,        "original" | "optimized"
 *   optimizationMeta: object | null
 * }} params
 * @returns {object} GeoJSON Feature
 */
export function buildGeoJSON({
  points,
  farmId,
  farmName,
  validatedAt,
  geometryVersion = "original",
  optimizationMeta = null,
}) {
  const areaSqM = calcAreaSqM(points);
  const perimM = calcPerimetreM(points);
  const coordinates = toCoordinateRing(points);

  return {
    type: "Feature",
    properties: {
      farmId,
      farmName: farmName.trim(),
      project: "InsureChain",
      areaSquareMetres: areaSqM,
      areaHectares: +(areaSqM / 10_000).toFixed(6),
      perimeterMetres: +perimM.toFixed(3),
      boundaryPointCount: points.length,
      validatedAt,
      exportedAt: new Date().toISOString(),
      // Geometry provenance — honest labels only
      geometryVersion,       // "original" | "optimized"
      optimizationMeta,      // null | { originalPointCount, optimizedPointCount, pointsRemoved, toleranceDegrees }
      validationStatus: "client-validated",
      // Explicit negatives — do not claim anything that hasn't happened
      legalParcelVerified: false,
      serverPersisted: false,
      blockchainAnchored: false,
    },
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
  };
}
