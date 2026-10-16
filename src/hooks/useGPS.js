import { useRef, useState, useCallback } from "react";
import { distanceMetres } from "../utils/geo";

// ── Constants ────────────────────────────────────────────────────────────────

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
};

/** Ignore GPS fixes with reported accuracy worse than this (metres). */
const ACCURACY_THRESHOLD_M = 25;

/** Ignore GPS updates closer than this to the previous accepted point (metres). */
const MIN_STEP_M = 3;

// ── GPS error codes (GeolocationPositionError) ───────────────────────────────
const GPS_ERROR = {
  1: "GPS permission denied. Please allow location access in your browser settings.",
  2: "GPS position unavailable. Check that your device has a signal.",
  3: "GPS request timed out. Move to an open area and try again.",
};

/**
 * useGPS — encapsulates all Geolocation API state and logic.
 *
 * Defect fixes applied:
 *  A. watchIdRef is a plain ref — it is NOT a reactive dependency.
 *     _clearWatch is stable (useCallback with [] deps) and only touches the ref,
 *     so React re-renders never accidentally cancel the active watchPosition.
 *  B. stopWalking now always calls _clearWatch() first (cancels the watch),
 *     then sets tracking=false, guaranteeing a definitive stop.
 *  C. lastPositionRef always holds the most recently accepted GPS position.
 *     Callers can read it synchronously via getLastPosition() before validation.
 *
 * Returned surface:
 *  position         [lat, lng] | null
 *  accuracy         number | null         metres, or null before first fix
 *  tracking         boolean               true while watchPosition is active
 *  followGPS        boolean               when true MapController flies to each fix
 *  gpsStatus        { type, message }     type: "idle"|"pending"|"ok"|"warn"|"error"
 *  getLocation()
 *  startWalking(onPoint)
 *  stopWalking()
 *  setFollowGPS(fn|boolean)
 *  getLastPosition()                      returns lastPositionRef.current synchronously
 *  cleanup()                              call on unmount
 */
export function useGPS() {
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [followGPS, setFollowGPS] = useState(true);
  const [gpsStatus, setGpsStatus] = useState({ type: "idle", message: "" });

  // watchIdRef stores the Geolocation watch ID.
  // It is a plain ref — not state — so mutations never trigger re-renders,
  // and _clearWatch can safely reference it without going stale.
  const watchIdRef = useRef(null);

  // lastPositionRef always holds the most recently accepted GPS coordinate.
  // Reading it synchronously after stopWalking() gives a definitive snapshot.
  const lastPositionRef = useRef(null);

  // ── internal helpers ───────────────────────────────────────────────────────

  /**
   * Cancel the active watchPosition subscription.
   * Safe to call multiple times; idempotent.
   * Deps: [] — intentional. watchIdRef is a ref; reading .current is always fresh.
   */
  const _clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  function _gpsError(err) {
    const message =
      GPS_ERROR[err.code] ?? `GPS error (code ${err.code}): ${err.message}`;
    setGpsStatus({ type: "error", message });
  }

  // ── getLocation ────────────────────────────────────────────────────────────

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus({
        type: "error",
        message: "Geolocation is not supported by this browser.",
      });
      return;
    }

    setGpsStatus({ type: "pending", message: "Requesting GPS location…" });

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = [coords.latitude, coords.longitude];
        setPosition(pos);
        setAccuracy(coords.accuracy);
        lastPositionRef.current = pos;
        setGpsStatus({
          type: "ok",
          message: `Location captured (±${Math.round(coords.accuracy)} m accuracy).`,
        });
      },
      (err) => _gpsError(err),
      GEO_OPTIONS
    );
  }, []);

  // ── startWalking ───────────────────────────────────────────────────────────

  /**
   * Begin GPS walk recording.
   * Calls `onPoint([lat, lng])` for each accepted GPS fix.
   *
   * A fix is accepted when:
   *   • reported accuracy ≤ ACCURACY_THRESHOLD_M
   *   • distance from previous accepted point ≥ MIN_STEP_M
   *
   * lastStepRef (local to the callback closure) tracks the last *recorded* step.
   * lastPositionRef (hook-level) tracks the last *received* GPS position,
   * enabling a definitive snapshot after stopWalking().
   *
   * @param {(point: [number, number]) => void} onPoint
   */
  const startWalking = useCallback(
    (onPoint) => {
      if (!navigator.geolocation) {
        setGpsStatus({
          type: "error",
          message: "Geolocation is not supported by this browser.",
        });
        return;
      }

      _clearWatch(); // defence: stop any previous watch before starting a new one
      setTracking(true);
      setFollowGPS(true);
      setGpsStatus({ type: "pending", message: "Waiting for a GPS fix…" });

      // lastStepRef: the last point that was actually recorded as a boundary vertex.
      // Kept as a plain object (not a React ref) — it lives inside the closure
      // for the lifetime of this watchPosition call.
      const lastStepRef = { current: null };

      watchIdRef.current = navigator.geolocation.watchPosition(
        ({ coords }) => {
          const { latitude, longitude, accuracy: acc } = coords;
          const newPoint = [latitude, longitude];

          // Always update the displayed position and the last-seen snapshot
          setPosition(newPoint);
          setAccuracy(acc);
          lastPositionRef.current = newPoint;

          // Accuracy gate — too imprecise, don't record
          if (acc > ACCURACY_THRESHOLD_M) {
            setGpsStatus({
              type: "warn",
              message: `GPS accuracy is ±${acc.toFixed(0)} m — waiting for better signal (need ≤${ACCURACY_THRESHOLD_M} m).`,
            });
            return;
          }

          // Distance gate — too close to previous recorded point, skip
          if (
            lastStepRef.current !== null &&
            distanceMetres(lastStepRef.current, newPoint) < MIN_STEP_M
          ) {
            setGpsStatus({
              type: "ok",
              message: `Walking — move at least ${MIN_STEP_M} m to record next point.`,
            });
            return;
          }

          lastStepRef.current = newPoint;
          setGpsStatus({
            type: "ok",
            message: "Walking — recording GPS trace. Walk the field edge.",
          });
          onPoint(newPoint);
        },
        (err) => {
          _gpsError(err);
          setTracking(false);
          _clearWatch();
        },
        GEO_OPTIONS
      );
    },
    [_clearWatch]
  );

  // ── stopWalking ────────────────────────────────────────────────────────────

  /**
   * Stop GPS walk recording.
   *
   * Fix: _clearWatch() is called BEFORE setTracking(false) to guarantee the
   * watchPosition subscription is cancelled even if a React re-render fires
   * in between. lastPositionRef.current holds the definitive last coordinate —
   * read via getLastPosition() synchronously after this call.
   */
  const stopWalking = useCallback(() => {
    _clearWatch();
    setTracking(false);
    // Caller reads getLastPosition() for a definitive coordinate snapshot
  }, [_clearWatch]);

  // ── getLastPosition ────────────────────────────────────────────────────────

  /**
   * Return the most recently accepted GPS position, or null.
   * Reading this synchronously after stopWalking() gives a definitive snapshot
   * of the last known position before validation.
   */
  const getLastPosition = useCallback(() => lastPositionRef.current, []);

  // ── cleanup (unmount) ──────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    _clearWatch();
  }, [_clearWatch]);

  // ── public surface ─────────────────────────────────────────────────────────

  return {
    position,
    accuracy,
    tracking,
    followGPS,
    gpsStatus,
    getLocation,
    startWalking,
    stopWalking,
    setFollowGPS,
    getLastPosition,
    cleanup,
  };
}
