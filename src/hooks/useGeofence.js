import { useState, useCallback } from "react";
import { validateBoundary } from "../utils/geo";

/**
 * Custom hook that encapsulates farm boundary drawing state.
 *
 * Returns:
 *  - points      [lat, lng][]   — current boundary points
 *  - drawing     boolean        — true while in click-to-draw mode
 *  - validated   boolean        — true after successful validateBoundary()
 *  - addPoint(pt)               — append a point (used in draw mode and walk mode)
 *  - undoPoint()                — remove the last point (draw mode only)
 *  - startDrawing()             — switch to draw mode
 *  - finishDrawing() → string|null  — validate and finish; returns error or null
 *  - resetAll()                 — clear all state
 */
export function useGeofence() {
  const [points, setPoints] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [validated, setValidated] = useState(false);

  const addPoint = useCallback((pt) => {
    setPoints((prev) => [...prev, pt]);
  }, []);

  const undoPoint = useCallback(() => {
    setPoints((prev) => prev.slice(0, -1));
  }, []);

  const startDrawing = useCallback(() => {
    setPoints([]);
    setValidated(false);
    setDrawing(true);
  }, []);

  /**
   * Run validation on the current points.
   * @returns {string|null} error message, or null on success
   */
  const finishDrawing = useCallback((currentPoints) => {
    const error = validateBoundary(currentPoints);
    if (error) {
      setValidated(false);
      return error;
    }
    setDrawing(false);
    setValidated(true);
    return null;
  }, []);

  const resetAll = useCallback(() => {
    setPoints([]);
    setDrawing(false);
    setValidated(false);
  }, []);

  return {
    points,
    drawing,
    validated,
    addPoint,
    undoPoint,
    startDrawing,
    finishDrawing,
    resetAll,
    setPoints,
  };
}
