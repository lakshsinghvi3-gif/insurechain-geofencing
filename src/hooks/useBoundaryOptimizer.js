import { useState, useCallback } from "react";
import { optimizeBoundary, validateBoundary, calcAreaSqM, calcPerimetreM } from "../utils/geo";

/**
 * useBoundaryOptimizer — manages the complete optimization state machine.
 *
 * Invariants:
 *  - The original points array is NEVER stored or mutated here.
 *    The caller (App.jsx) always owns the authoritative `points` array.
 *  - optimizationState.optimizedPoints is an immutable snapshot taken at
 *    run time. It does not update when the user edits the boundary.
 *  - When the user edits the boundary (addPoint/undo/reset), the caller MUST
 *    call resetOptimization() to invalidate stale results.
 *  - selectedVersion defaults to "original" and only becomes "optimized" when
 *    the user explicitly calls useOptimized().
 *  - Export always reads getSelectedPoints(originalPoints) to decide which
 *    geometry to use — the optimizer never writes to the boundary hook.
 *
 * Returned surface:
 *  optimizationState    null | { status, optimizedPoints, error, meta }
 *    status: "running" | "success" | "failed"
 *  selectedVersion      "original" | "optimized"
 *  runOptimization(pts, opts?)
 *  useOptimized()
 *  keepOriginal()
 *  restoreOriginal()
 *  resetOptimization()
 *  getSelectedPoints(originalPoints) → [lat,lng][]
 *  getComparison(originalPoints) → ComparisonData | null
 */
export function useBoundaryOptimizer() {
  /**
   * optimizationState shape:
   *   null                          — no optimization attempted yet
   *   { status: "running", ... }   — in-progress (reserved for async future)
   *   { status: "success", optimizedPoints: [...], error: null, meta: {...} }
   *   { status: "failed",  optimizedPoints: null,  error: string, meta: null }
   */
  const [optimizationState, setOptimizationState] = useState(null);

  /**
   * selectedVersion tracks which geometry the user has chosen for export.
   * Defaults to "original"; only "optimized" when the user explicitly clicks
   * "Use Optimized".
   */
  const [selectedVersion, setSelectedVersion] = useState("original");

  // ── runOptimization ───────────────────────────────────────────────────────

  /**
   * Run the optimization algorithm on the given originalPoints.
   * Synchronous (Douglas-Peucker on farm-scale polygons is fast).
   *
   * On success: stores the candidate and sets status="success".
   *   Does NOT automatically switch selectedVersion to "optimized".
   *
   * On failure: stores the error and sets status="failed".
   *   Does NOT change selectedVersion — original remains active.
   *
   * @param {Array<[number, number]>} originalPoints
   * @param {object} [opts]
   * @param {number} [opts.tolerance=0.00001]
   */
  const runOptimization = useCallback((originalPoints, opts = {}) => {
    if (!Array.isArray(originalPoints) || originalPoints.length < 3) return;

    // Mark as running (useful for future async path)
    setOptimizationState({ status: "running", optimizedPoints: null, error: null, meta: null });

    const { optimized, error } = optimizeBoundary(originalPoints, opts);

    if (error || !optimized) {
      setOptimizationState({
        status: "failed",
        optimizedPoints: null,
        error: error ?? "Unknown optimization error",
        meta: null,
      });
      return; // selectedVersion stays "original"
    }

    const meta = {
      originalPointCount: originalPoints.length,
      optimizedPointCount: optimized.length,
      pointsRemoved: originalPoints.length - optimized.length,
      toleranceDegrees: opts.tolerance ?? 0.00001,
    };

    setOptimizationState({
      status: "success",
      optimizedPoints: optimized,
      error: null,
      meta,
    });
    // User must explicitly choose via useOptimized() — no auto-switch
  }, []);

  // ── Version selection ─────────────────────────────────────────────────────

  /** Select the optimized boundary for export. Only valid after a successful run. */
  const useOptimized = useCallback(() => {
    setSelectedVersion("optimized");
  }, []);

  /** Select the original boundary for export. */
  const keepOriginal = useCallback(() => {
    setSelectedVersion("original");
  }, []);

  /**
   * Discard optimization results entirely and revert to original-only mode.
   * Equivalent to "never ran optimization".
   */
  const restoreOriginal = useCallback(() => {
    setOptimizationState(null);
    setSelectedVersion("original");
  }, []);

  /**
   * Invalidate any existing optimization results because the boundary has changed.
   * Call this whenever addPoint / undoPoint / resetAll / startDrawing is called.
   */
  const resetOptimization = useCallback(() => {
    setOptimizationState(null);
    setSelectedVersion("original");
  }, []);

  // ── Selectors ─────────────────────────────────────────────────────────────

  /**
   * Return the points for the currently selected geometry version.
   * Always falls back to originalPoints if the selected version has no valid data.
   *
   * @param {Array<[number, number]>} originalPoints
   * @returns {Array<[number, number]>}
   */
  const getSelectedPoints = useCallback(
    (originalPoints) => {
      if (
        selectedVersion === "optimized" &&
        optimizationState?.status === "success" &&
        Array.isArray(optimizationState.optimizedPoints)
      ) {
        return optimizationState.optimizedPoints;
      }
      return originalPoints;
    },
    [selectedVersion, optimizationState]
  );

  /**
   * Build a comparison data object for the OptimizationPanel.
   * Returns null if no optimization result is available yet.
   *
   * @param {Array<[number, number]>} originalPoints
   * @returns {ComparisonData | null}
   */
  const getComparison = useCallback(
    (originalPoints) => {
      if (!optimizationState || optimizationState.status === "running") return null;

      const origArea = calcAreaSqM(originalPoints);
      const origPerim = calcPerimetreM(originalPoints);
      const origCount = originalPoints.length;

      if (optimizationState.status === "failed") {
        return {
          status: "failed",
          error: optimizationState.error,
          original: { area: origArea, perim: origPerim, count: origCount },
          optimized: null,
          diff: null,
          meta: null,
          selectedVersion: "original", // always original on failure
        };
      }

      // status === "success"
      const optPts = optimizationState.optimizedPoints;
      const optArea = calcAreaSqM(optPts);
      const optPerim = calcPerimetreM(optPts);
      const optCount = optPts.length;
      const areaDiff = optArea - origArea;
      const areaPct = origArea > 0 ? (areaDiff / origArea) * 100 : 0;

      return {
        status: "success",
        error: null,
        original: { area: origArea, perim: origPerim, count: origCount },
        optimized: {
          area: optArea,
          perim: optPerim,
          count: optCount,
          // Re-validate the optimized candidate for the panel display
          validationError: validateBoundary(optPts),
        },
        diff: {
          areaDiff,
          areaPct,
          pointsRemoved: origCount - optCount,
        },
        meta: optimizationState.meta,
        selectedVersion,
      };
    },
    [optimizationState, selectedVersion]
  );

  // ── Public surface ────────────────────────────────────────────────────────

  return {
    optimizationState,
    selectedVersion,
    runOptimization,
    useOptimized,
    keepOriginal,
    restoreOriginal,
    resetOptimization,
    getSelectedPoints,
    getComparison,
  };
}
