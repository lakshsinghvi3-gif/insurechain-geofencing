import { useState, useCallback, useRef, useEffect } from "react";
import { validateBoundary, generateFarmId } from "../utils/geo";

// ── localStorage persistence ──────────────────────────────────────────────────
const STORAGE_KEY = "insurechain_geofence_v1";

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Basic sanity check
    if (!Array.isArray(data.points) || typeof data.farmId !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * useGeofence — manages farm boundary drawing state.
 *
 * Design invariants:
 *  - `validated` is reset to false on every mutation (addPoint, undoPoint,
 *    setPoints, startDrawing, resetAll).  No edit can silently keep a
 *    previously-validated state.
 *  - `farmId` is generated once when the boundary is first created and persists
 *    for the life of that record.  It is regenerated only on resetAll().
 *  - `farmName` validation (non-empty) is the caller's responsibility before
 *    export; this hook only stores the value.
 *  - Boundary state is persisted to localStorage so it survives page reloads.
 *
 * Returned surface:
 *  points       [lat, lng][]
 *  drawing      boolean          true while in manual click-to-draw mode
 *  validated    boolean
 *  validatedAt  string | null    ISO 8601 timestamp of last successful validation
 *  farmId       string           stable per-record ID
 *  mode         "idle"|"drawing"|"walking"|"review"
 *  addPoint(pt)
 *  undoPoint()
 *  startDrawing()
 *  startWalking()               switches mode, does NOT start GPS (caller does)
 *  finishBoundary(pts) → string|null
 *  resetAll()
 */
export function useGeofence() {
  // Hydrate from localStorage on first render
  const saved = loadFromStorage();

  const [points, setPointsRaw] = useState(saved?.points ?? []);
  const [drawing, setDrawing] = useState(false);
  const [validated, setValidated] = useState(saved?.validated ?? false);
  const [validatedAt, setValidatedAt] = useState(saved?.validatedAt ?? null);
  // Restore to "review" if we have saved points, otherwise "idle"
  const [mode, setMode] = useState(saved?.points?.length > 0 ? "review" : "idle");

  // Stable farm ID — regenerated only on resetAll
  const farmIdRef = useRef(saved?.farmId ?? generateFarmId());

  // ── Persist to localStorage whenever relevant state changes ──────────────

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          points,
          validated,
          validatedAt,
          farmId: farmIdRef.current,
        })
      );
    } catch {
      // Quota exceeded or private-browsing — silent fail
    }
  }, [points, validated, validatedAt]);

  // ── Internal helper: any mutation clears validation ──────────────────────

  const setPoints = useCallback((updater) => {
    setPointsRaw(updater);
    setValidated(false);
    setValidatedAt(null);
  }, []);

  // ── Point operations ──────────────────────────────────────────────────────

  const addPoint = useCallback(
    (pt) => setPoints((prev) => [...prev, pt]),
    [setPoints]
  );

  /** Only meaningful in drawing mode; in walking mode GPS records points. */
  const undoPoint = useCallback(
    () => setPoints((prev) => prev.slice(0, -1)),
    [setPoints]
  );

  // ── Mode transitions ──────────────────────────────────────────────────────

  const startDrawing = useCallback(() => {
    setPointsRaw([]);
    setValidated(false);
    setValidatedAt(null);
    setDrawing(true);
    setMode("drawing");
  }, []);

  /**
   * Signal that GPS-walk mode is starting.
   * Does NOT interact with the Geolocation API — useGPS handles that.
   */
  const startWalking = useCallback(() => {
    setPointsRaw([]);
    setValidated(false);
    setValidatedAt(null);
    setDrawing(false);
    setMode("walking");
  }, []);

  /**
   * Validate the current (or supplied) points and transition to "review" on success.
   *
   * @param {Array<[number,number]>} currentPoints  Pass `points` from the hook.
   * @returns {string | null}  Error message or null on success.
   */
  const finishBoundary = useCallback((currentPoints) => {
    const error = validateBoundary(currentPoints);
    if (error) {
      setValidated(false);
      setValidatedAt(null);
      setDrawing(false);
      setMode("review");
      return error;
    }
    const ts = new Date().toISOString();
    setDrawing(false);
    setValidated(true);
    setValidatedAt(ts);
    setMode("review");
    return null;
  }, []);

  const resetAll = useCallback(() => {
    setPointsRaw([]);
    setDrawing(false);
    setValidated(false);
    setValidatedAt(null);
    setMode("idle");
    // New record → new stable ID
    farmIdRef.current = generateFarmId();
    // Clear persisted state
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  // ── Public surface ────────────────────────────────────────────────────────

  return {
    points,
    drawing,
    validated,
    validatedAt,
    mode,
    farmId: farmIdRef.current,
    addPoint,
    undoPoint,
    startDrawing,
    startWalking,
    finishBoundary,
    resetAll,
  };
}
