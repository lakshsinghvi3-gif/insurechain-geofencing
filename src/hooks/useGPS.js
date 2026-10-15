import { useRef, useState } from "react";
import { distanceMetres } from "../utils/geo";

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
};

const ACCURACY_THRESHOLD_M = 25;
const MIN_STEP_M = 3;

/**
 * Custom hook that encapsulates all GPS / Geolocation logic.
 *
 * Returns:
 *  - position   [lat, lng] | null
 *  - accuracy   number | null  (metres)
 *  - tracking   boolean  (true while watchPosition is active)
 *  - gpsStatus  string   (human-readable message about GPS)
 *  - getLocation()
 *  - startWalking(onPoint)  — calls onPoint([lat, lng]) for each accepted GPS fix
 *  - stopWalking()
 */
export function useGPS() {
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("");

  const watchIdRef = useRef(null);

  function _clearWatch() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }

  function getLocation() {
    if (!navigator.geolocation) {
      setGpsStatus("Your browser does not support geolocation.");
      return;
    }

    setGpsStatus("Requesting GPS location…");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition([coords.latitude, coords.longitude]);
        setAccuracy(coords.accuracy);
        setGpsStatus("GPS location captured successfully.");
      },
      (err) => setGpsStatus(`Unable to get location: ${err.message}`),
      GEO_OPTIONS
    );
  }

  /**
   * Start watchPosition. Calls `onPoint([lat, lng])` whenever a new point
   * is at least MIN_STEP_M away from the previous accepted point.
   * Accuracy gate: points with accuracy > ACCURACY_THRESHOLD_M are ignored.
   *
   * @param {(point: [number, number]) => void} onPoint
   */
  function startWalking(onPoint) {
    if (!navigator.geolocation) {
      setGpsStatus("GPS is not supported by this browser.");
      return;
    }

    _clearWatch();
    setTracking(true);
    setGpsStatus("Waiting for a GPS fix…");

    // Capture the last accepted point in a mutable ref so the watchPosition
    // callback always sees the latest value without stale closure issues.
    const lastPointRef = { current: null };

    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const { latitude, longitude, accuracy: acc } = coords;
        const newPoint = [latitude, longitude];

        setPosition(newPoint);
        setAccuracy(acc);

        if (acc > ACCURACY_THRESHOLD_M) {
          setGpsStatus(
            `GPS accuracy is ${acc.toFixed(1)} m — waiting for a better signal.`
          );
          return;
        }

        if (
          lastPointRef.current !== null &&
          distanceMetres(lastPointRef.current, newPoint) < MIN_STEP_M
        ) {
          return; // too close — skip
        }

        lastPointRef.current = newPoint;
        setGpsStatus("Walking mode active — walk along the field edge.");
        onPoint(newPoint);
      },
      (err) => {
        setGpsStatus(`GPS error: ${err.message}`);
        setTracking(false);
        _clearWatch();
      },
      GEO_OPTIONS
    );
  }

  function stopWalking() {
    _clearWatch();
    setTracking(false);
    setGpsStatus("Walking stopped.");
  }

  // Cleanup on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function cleanup() { _clearWatch(); }

  return {
    position,
    accuracy,
    tracking,
    gpsStatus,
    getLocation,
    startWalking,
    stopWalking,
    cleanup,
  };
}
