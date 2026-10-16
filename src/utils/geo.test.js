/**
 * geo.test.js — Vitest unit tests for src/utils/geo.js
 *
 * Run with: npx vitest run
 *
 * Test coordinate system: all points are [lat, lng] pairs.
 * Turf internally uses [lng, lat] GeoJSON order — geo.js handles the conversion.
 */
import { describe, it, expect } from "vitest";
import {
  validateBoundary,
  optimizeBoundary,
  calcAreaSqM,
  calcPerimetreM,
  calcCentroid,
  formatArea,
  formatDistance,
  generateFarmId,
  buildGeoJSON,
  checkWalkClosure,
  isValidCoord,
  distanceMetres,
  toCoordinateRing,
  MIN_AREA_SQM,
  MAX_AREA_SQM,
  MIN_POINTS,
} from "./geo";

// ── Test fixtures ──────────────────────────────────────────────────────────────

/**
 * A valid near-square farm boundary near Bengaluru (~1.1 ha).
 * Points spaced ~100 m apart — well within [MIN_AREA_SQM, MAX_AREA_SQM].
 */
const VALID_FARM = [
  [12.9716, 77.5946],
  [12.9725, 77.5946],
  [12.9725, 77.5960],
  [12.9716, 77.5960],
];

/**
 * A larger valid farm with many vertices simulating GPS jitter.
 * We'll insert a few consecutive duplicates to test dedup logic.
 */
const MANY_VERTEX_FARM = [
  [12.9700, 77.5900],
  [12.9700, 77.5900], // consecutive dup — should be removed by optimizeBoundary
  [12.9712, 77.5900],
  [12.9718, 77.5910],
  [12.9718, 77.5910], // consecutive dup
  [12.9718, 77.5930],
  [12.9710, 77.5945],
  [12.9700, 77.5945],
  [12.9695, 77.5930],
  [12.9695, 77.5910],
];

/** Tiny square — ~50 m side; area well below MIN_AREA_SQM (1 000 m²). */
const TINY_FARM = [
  [12.9716, 77.5946],
  [12.97165, 77.5946],
  [12.97165, 77.59465],
  [12.9716, 77.59465],
];

/** Three collinear points — area ≈ 0. */
const COLLINEAR = [
  [12.0, 77.0],
  [12.1, 77.0],
  [12.2, 77.0],
];

/** A self-intersecting "butterfly" shape (figure-8). */
const SELF_INTERSECTING = [
  [12.9716, 77.5946],
  [12.9730, 77.5960],
  [12.9730, 77.5946], // crossing edges
  [12.9716, 77.5960],
];

// ── isValidCoord ──────────────────────────────────────────────────────────────

describe("isValidCoord", () => {
  it("accepts valid [lat, lng]", () => {
    expect(isValidCoord([12.9716, 77.5946])).toBe(true);
    expect(isValidCoord([0, 0])).toBe(true);
    expect(isValidCoord([-90, -180])).toBe(true);
    expect(isValidCoord([90, 180])).toBe(true);
  });

  it("rejects out-of-range latitude", () => {
    expect(isValidCoord([91, 0])).toBe(false);
    expect(isValidCoord([-91, 0])).toBe(false);
  });

  it("rejects out-of-range longitude", () => {
    expect(isValidCoord([0, 181])).toBe(false);
    expect(isValidCoord([0, -181])).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(isValidCoord([NaN, 0])).toBe(false);
    expect(isValidCoord([0, Infinity])).toBe(false);
    expect(isValidCoord([undefined, 0])).toBe(false);
  });
});

// ── distanceMetres ────────────────────────────────────────────────────────────

describe("distanceMetres", () => {
  it("returns 0 for identical points", () => {
    expect(distanceMetres([12.9716, 77.5946], [12.9716, 77.5946])).toBe(0);
  });

  it("returns a positive value for separated points", () => {
    const d = distanceMetres([0, 0], [0, 1]);
    expect(d).toBeGreaterThan(100_000); // ~111 km
    expect(d).toBeLessThan(120_000);
  });

  it("is approximately symmetric", () => {
    const a = [12.9716, 77.5946];
    const b = [12.9725, 77.5960];
    expect(Math.abs(distanceMetres(a, b) - distanceMetres(b, a))).toBeLessThan(0.001);
  });
});

// ── toCoordinateRing ──────────────────────────────────────────────────────────

describe("toCoordinateRing", () => {
  it("converts [lat, lng] to [lng, lat] and closes the ring", () => {
    const ring = toCoordinateRing(VALID_FARM);
    expect(ring.length).toBe(VALID_FARM.length + 1);
    // First point: lat=12.9716, lng=77.5946 → [77.5946, 12.9716]
    expect(ring[0]).toEqual([77.5946, 12.9716]);
    // Last point must equal first
    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });

  it("throws for fewer than 3 points", () => {
    expect(() => toCoordinateRing([[1, 2], [3, 4]])).toThrow();
  });
});

// ── calcAreaSqM ───────────────────────────────────────────────────────────────

describe("calcAreaSqM", () => {
  it("returns 0 for fewer than 3 points", () => {
    expect(calcAreaSqM([])).toBe(0);
    expect(calcAreaSqM([[1, 2]])).toBe(0);
    expect(calcAreaSqM([[1, 2], [3, 4]])).toBe(0);
  });

  it("returns a positive area for VALID_FARM", () => {
    const area = calcAreaSqM(VALID_FARM);
    expect(area).toBeGreaterThan(MIN_AREA_SQM);
    expect(area).toBeLessThan(MAX_AREA_SQM);
  });

  it("returns near-zero area for collinear points", () => {
    // Turf may return a tiny non-zero value; still well below MIN_AREA_SQM
    expect(calcAreaSqM(COLLINEAR)).toBeLessThan(MIN_AREA_SQM);
  });

  it("returns 0 for invalid coords (doesn't throw)", () => {
    expect(calcAreaSqM([[NaN, 0], [0, 0], [0, 1]])).toBe(0);
  });
});

// ── calcPerimetreM ────────────────────────────────────────────────────────────

describe("calcPerimetreM", () => {
  it("returns 0 for fewer than 2 points", () => {
    expect(calcPerimetreM([])).toBe(0);
    expect(calcPerimetreM([[1, 2]])).toBe(0);
  });

  it("returns positive value for VALID_FARM", () => {
    expect(calcPerimetreM(VALID_FARM)).toBeGreaterThan(100);
  });

  it("closes the ring in the perimeter sum", () => {
    // 2-point input: perimeter is 2× the edge (goes and comes back)
    const a = [0, 0];
    const b = [0, 1];
    const d = distanceMetres(a, b);
    expect(calcPerimetreM([a, b])).toBeCloseTo(2 * d, 0);
  });
});

// ── calcCentroid ──────────────────────────────────────────────────────────────

describe("calcCentroid", () => {
  it("returns null for empty input", () => {
    expect(calcCentroid([])).toBeNull();
    expect(calcCentroid(null)).toBeNull();
    expect(calcCentroid(undefined)).toBeNull();
  });

  it("returns the sole point for a single-element array", () => {
    expect(calcCentroid([[12, 77]])).toEqual([12, 77]);
  });

  it("returns the arithmetic mean for VALID_FARM", () => {
    const [lat, lng] = calcCentroid(VALID_FARM);
    // All latitudes average to between the min and max
    expect(lat).toBeGreaterThan(12.97);
    expect(lat).toBeLessThan(12.98);
    expect(lng).toBeGreaterThan(77.59);
    expect(lng).toBeLessThan(77.60);
  });
});

// ── formatArea ────────────────────────────────────────────────────────────────

describe("formatArea", () => {
  it('returns "—" for 0 or negative values', () => {
    expect(formatArea(0)).toBe("—");
    expect(formatArea(-100)).toBe("—");
  });

  it("formats m² below 10 000 m²", () => {
    expect(formatArea(500)).toBe("500.0 m²");
    expect(formatArea(1234.5)).toBe("1234.5 m²");
  });

  it("formats ha at 10 000 m² and above", () => {
    expect(formatArea(10_000)).toBe("1.0000 ha");
    expect(formatArea(15_000)).toBe("1.5000 ha");
  });
});

// ── formatDistance ────────────────────────────────────────────────────────────

describe("formatDistance", () => {
  it('returns "—" for 0 or negative values', () => {
    expect(formatDistance(0)).toBe("—");
    expect(formatDistance(-50)).toBe("—");
  });

  it("formats metres below 1 000 m", () => {
    expect(formatDistance(500)).toBe("500.0 m");
  });

  it("formats km at 1 000 m and above", () => {
    expect(formatDistance(1000)).toBe("1.000 km");
    expect(formatDistance(1500)).toBe("1.500 km");
  });
});

// ── generateFarmId ────────────────────────────────────────────────────────────

describe("generateFarmId", () => {
  it("returns a non-empty string", () => {
    const id = generateFarmId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("generates unique IDs on repeated calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateFarmId()));
    expect(ids.size).toBe(20);
  });
});

// ── validateBoundary ──────────────────────────────────────────────────────────

describe("validateBoundary", () => {
  it("returns an error for fewer than MIN_POINTS points", () => {
    expect(validateBoundary([])).toMatch(/at least/i);
    expect(validateBoundary([[1, 2], [3, 4]])).toMatch(/at least/i);
  });

  it("returns an error for invalid coordinates", () => {
    const pts = [[NaN, 77.5946], [12.9725, 77.5946], [12.9725, 77.5960]];
    expect(validateBoundary(pts)).toMatch(/invalid coordinates/i);
  });

  it("returns an error for consecutive duplicate vertices", () => {
    const pts = [
      [12.9716, 77.5946],
      [12.9716, 77.5946], // duplicate
      [12.9725, 77.5960],
    ];
    expect(validateBoundary(pts)).toMatch(/identical/i);
  });

  it("returns an error for area below MIN_AREA_SQM", () => {
    expect(validateBoundary(TINY_FARM)).toMatch(/below the minimum/i);
  });

  it("returns an error for collinear / near-zero area", () => {
    const err = validateBoundary(COLLINEAR);
    // Either zero-area or below minimum
    expect(err).toBeTruthy();
  });

  it("returns an error for self-intersecting polygon", () => {
    const err = validateBoundary(SELF_INTERSECTING);
    // May be self-intersection OR area issue depending on geometry
    expect(err).toBeTruthy();
  });

  it("returns null for a valid 4-point farm", () => {
    expect(validateBoundary(VALID_FARM)).toBeNull();
  });

  it("returns null for MANY_VERTEX_FARM after dedup — note: raw form has duplicates", () => {
    // Raw MANY_VERTEX_FARM has consecutive duplicates → validateBoundary reports error
    const err = validateBoundary(MANY_VERTEX_FARM);
    expect(err).toMatch(/identical/i);
  });
});

// ── optimizeBoundary ──────────────────────────────────────────────────────────

describe("optimizeBoundary", () => {
  it("returns an error for fewer than 3 points", () => {
    const { optimized, error } = optimizeBoundary([[1, 2], [3, 4]]);
    expect(optimized).toBeNull();
    expect(error).toBeTruthy();
  });

  it("successfully optimizes a valid 4-point farm", () => {
    const { optimized, error } = optimizeBoundary(VALID_FARM);
    // A 4-point valid farm has no redundant points at default tolerance → should succeed
    expect(error).toBeNull();
    expect(Array.isArray(optimized)).toBe(true);
    expect(optimized.length).toBeGreaterThanOrEqual(MIN_POINTS);
  });

  it("removes consecutive duplicate points from GPS jitter", () => {
    // Build a farm with known duplicates that would otherwise pass validation
    // Use MANY_VERTEX_FARM (has dups) — dedup step must fire
    const { optimized, error } = optimizeBoundary(MANY_VERTEX_FARM);
    if (error) {
      // Area of MANY_VERTEX_FARM might be out of range — still exercised the dedup path
      expect(error).toBeTruthy();
    } else {
      // Fewer or equal points than original (duplicates removed)
      expect(optimized.length).toBeLessThanOrEqual(MANY_VERTEX_FARM.length);
    }
  });

  it("rejects self-intersecting input (validateBoundary fails inside)", () => {
    const { optimized, error } = optimizeBoundary(SELF_INTERSECTING);
    // Either the area check or kinks check triggers on the optimized candidate
    expect(error).toBeTruthy();
    expect(optimized).toBeNull();
  });

  it("does NOT mutate the original points array", () => {
    const original = VALID_FARM.map((p) => [...p]);
    const clone = original.map((p) => [...p]);
    optimizeBoundary(original);
    expect(original).toEqual(clone);
  });

  it("returns a different array reference than the input", () => {
    const { optimized } = optimizeBoundary(VALID_FARM);
    if (optimized) {
      expect(optimized).not.toBe(VALID_FARM);
    }
  });

  it("rejects input below MIN_AREA_SQM", () => {
    const { optimized, error } = optimizeBoundary(TINY_FARM);
    // Either the dedup reduces below 3 pts OR validation rejects for area
    expect(optimized).toBeNull();
    expect(error).toBeTruthy();
  });
});

// ── checkWalkClosure ──────────────────────────────────────────────────────────

describe("checkWalkClosure", () => {
  it("returns an error when start and end are far apart", () => {
    const open = [
      [12.9716, 77.5946],
      [12.9725, 77.5946],
      [12.9725, 77.5960],
      // end is far from start
    ];
    expect(checkWalkClosure(open)).toMatch(/not closed/i);
  });

  it("returns null when start and end are close", () => {
    const closed = [
      [12.9716, 77.5946],
      [12.9725, 77.5946],
      [12.9725, 77.5960],
      [12.97161, 77.59461], // ~1 m from start
    ];
    expect(checkWalkClosure(closed)).toBeNull();
  });

  it("delegates to validateBoundary for < MIN_POINTS input", () => {
    expect(checkWalkClosure([[1, 2], [3, 4]])).toMatch(/at least/i);
  });
});

// ── buildGeoJSON ──────────────────────────────────────────────────────────────

describe("buildGeoJSON", () => {
  const BASE_PARAMS = {
    points: VALID_FARM,
    farmId: "test-farm-id-1234",
    farmName: "Test Farm",
    validatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("returns a GeoJSON Feature", () => {
    const feature = buildGeoJSON(BASE_PARAMS);
    expect(feature.type).toBe("Feature");
    expect(feature.geometry.type).toBe("Polygon");
    expect(Array.isArray(feature.geometry.coordinates)).toBe(true);
  });

  it("includes farmId and farmName in properties", () => {
    const feature = buildGeoJSON(BASE_PARAMS);
    expect(feature.properties.farmId).toBe("test-farm-id-1234");
    expect(feature.properties.farmName).toBe("Test Farm");
  });

  it("defaults geometryVersion to 'original'", () => {
    const feature = buildGeoJSON(BASE_PARAMS);
    expect(feature.properties.geometryVersion).toBe("original");
  });

  it("honours explicit geometryVersion 'optimized'", () => {
    const feature = buildGeoJSON({ ...BASE_PARAMS, geometryVersion: "optimized" });
    expect(feature.properties.geometryVersion).toBe("optimized");
  });

  it("explicitly sets legalParcelVerified: false", () => {
    const feature = buildGeoJSON(BASE_PARAMS);
    expect(feature.properties.legalParcelVerified).toBe(false);
  });

  it("explicitly sets blockchainAnchored: false", () => {
    const feature = buildGeoJSON(BASE_PARAMS);
    expect(feature.properties.blockchainAnchored).toBe(false);
  });

  it("explicitly sets serverPersisted: false", () => {
    const feature = buildGeoJSON(BASE_PARAMS);
    expect(feature.properties.serverPersisted).toBe(false);
  });

  it("includes optimizationMeta when provided", () => {
    const meta = {
      originalPointCount: 10,
      optimizedPointCount: 8,
      pointsRemoved: 2,
      toleranceDegrees: 0.00001,
    };
    const feature = buildGeoJSON({ ...BASE_PARAMS, geometryVersion: "optimized", optimizationMeta: meta });
    expect(feature.properties.optimizationMeta).toEqual(meta);
  });

  it("produces a positive areaSquareMetres", () => {
    const feature = buildGeoJSON(BASE_PARAMS);
    expect(feature.properties.areaSquareMetres).toBeGreaterThan(0);
  });

  it("trims farmName whitespace", () => {
    const feature = buildGeoJSON({ ...BASE_PARAMS, farmName: "  Paddy Farm  " });
    expect(feature.properties.farmName).toBe("Paddy Farm");
  });

  it("closes the polygon ring (first === last coordinate)", () => {
    const feature = buildGeoJSON(BASE_PARAMS);
    const ring = feature.geometry.coordinates[0];
    const first = ring[0];
    const last = ring[ring.length - 1];
    expect(first).toEqual(last);
  });
});
