import { useState, useEffect, useCallback } from "react";
import { useGPS } from "./hooks/useGPS";
import { useGeofence } from "./hooks/useGeofence";
import { useBoundaryOptimizer } from "./hooks/useBoundaryOptimizer";
import {
  calcAreaSqM,
  calcPerimetreM,
  buildGeoJSON,
  checkWalkClosure,
  validateBoundary,
} from "./utils/geo";

import MapView from "./components/MapView";
import Toolbar from "./components/Toolbar";
import FarmDetails from "./components/FarmDetails";
import OptimizationPanel from "./components/OptimizationPanel";

import "./App.css";

// ── Status helpers ────────────────────────────────────────────────────────────

function statusClass(type) {
  // type: "idle"|"pending"|"ok"|"warn"|"error"
  return { idle: "", pending: "status--pending", ok: "status--ok", warn: "status--warn", error: "status--error" }[type] ?? "";
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  // ── GPS hook ──────────────────────────────────────────────────────────────
  const {
    position,
    accuracy,
    tracking,
    followGPS,
    gpsStatus,
    getLocation,
    startWalking,
    stopWalking,
    setFollowGPS,
    cleanup: cleanupGPS,
  } = useGPS();

  // ── Geofence / drawing hook ───────────────────────────────────────────────
  const {
    points,
    drawing,
    validated,
    validatedAt,
    mode,
    farmId,
    addPoint,
    undoPoint,
    startDrawing,
    startWalking: startWalkMode,
    finishBoundary,
    resetAll,
  } = useGeofence();

  // ── Boundary optimizer hook ───────────────────────────────────────────────
  const {
    optimizationState,
    selectedVersion,
    runOptimization,
    useOptimized,
    keepOriginal,
    restoreOriginal,
    resetOptimization,
    getSelectedPoints,
    getComparison,
  } = useBoundaryOptimizer();

  // ── Local UI state ────────────────────────────────────────────────────────
  const [appStatus, setAppStatus] = useState({
    type: "idle",
    message: "Get your GPS location or start marking your farm.",
  });
  const [farmName, setFarmName] = useState("");
  const [farmNameError, setFarmNameError] = useState(null);
  const [tileMode, setTileMode] = useState("street");

  // ── Dark mode ─────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem("insurechain_dark_mode");
    if (stored !== null) return stored === "true";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("insurechain_dark_mode", String(darkMode));
  }, [darkMode]);

  // Cleanup GPS watch on unmount
  useEffect(() => cleanupGPS, [cleanupGPS]);

  // Merge GPS status into app status whenever GPS has something to say
  useEffect(() => {
    if (gpsStatus.type !== "idle" && gpsStatus.message) {
      setAppStatus(gpsStatus);
    }
  }, [gpsStatus]);

  // ── Derived values ────────────────────────────────────────────────────────

  // Resolve selected geometry (original or optimized, with safe fallback)
  const selectedPoints = getSelectedPoints(points);
  const areaSqM = calcAreaSqM(selectedPoints);
  const perimM  = calcPerimetreM(selectedPoints);

  // Optimization display flags
  const optimizing         = optimizationState?.status === "running";
  const showBothBoundaries = optimizationState?.status === "success";
  const optimizedPoints    = optimizationState?.optimizedPoints ?? null;
  const comparison         = getComparison(points);

  // ── Farm name validation ──────────────────────────────────────────────────

  const validateFarmName = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return "Farm name is required before exporting.";
    if (trimmed.length < 2) return "Farm name must be at least 2 characters.";
    return null;
  }, []);

  function handleFarmNameChange(value) {
    setFarmName(value);
    // Clear error as soon as the field becomes valid
    if (farmNameError && !validateFarmName(value)) {
      setFarmNameError(null);
    }
  }

  // ── GPS handlers ──────────────────────────────────────────────────────────

  function handleGetLocation() {
    getLocation();
    // GPS hook sets gpsStatus which propagates via the effect above
  }

  // ── Drawing mode ──────────────────────────────────────────────────────────

  function handleStartDrawing() {
    if (tracking) stopWalking();
    startDrawing();
    resetOptimization(); // editing invalidates any prior optimization
    setAppStatus({ type: "ok", message: "Drawing mode ON — click points on the map." });
  }

  function handleFinishBoundary() {
    const error = finishBoundary(points);
    if (error) {
      setAppStatus({ type: "error", message: error });
    } else {
      setAppStatus({ type: "ok", message: "Boundary validated ✅ — enter a farm name and export." });
    }
  }

  // ── Walking mode ──────────────────────────────────────────────────────────

  function handleStartWalking() {
    if (drawing) startDrawing(); // reset geofence without GPS
    startWalkMode();             // switch geofence to "walking" mode
    startWalking((pt) => addPoint(pt)); // start GPS watch → points flow in
    resetOptimization(); // new walk invalidates any prior optimization
    setAppStatus({ type: "pending", message: "Walk mode starting — acquiring GPS…" });
  }

  function handleStopWalking() {
    stopWalking();

    // Check closure before running full validation
    const closureError = checkWalkClosure(points);
    if (closureError) {
      setAppStatus({ type: "warn", message: closureError });
      return;
    }

    const error = finishBoundary(points);
    if (error) {
      setAppStatus({ type: "error", message: `Walking stopped. ${error}` });
    } else {
      setAppStatus({ type: "ok", message: "Walk boundary validated ✅ — enter a farm name and export." });
    }
  }

  // ── Point editing with optimization invalidation ───────────────────────────

  const wrappedAddPoint = useCallback(
    (pt) => {
      addPoint(pt);
      resetOptimization();
    },
    [addPoint, resetOptimization]
  );

  const wrappedUndoPoint = useCallback(() => {
    undoPoint();
    resetOptimization();
  }, [undoPoint, resetOptimization]);

  // ── Clear ─────────────────────────────────────────────────────────────────

  function handleClear() {
    stopWalking();
    resetAll();
    resetOptimization();
    setFarmName("");
    setFarmNameError(null);
    setAppStatus({ type: "idle", message: "Boundary cleared. Start a new recording." });
  }

  // ── Boundary Optimization handlers ────────────────────────────────────────

  function handleOptimize() {
    if (points.length < 3) return;
    runOptimization(points);
    setAppStatus({ type: "pending", message: "Running boundary optimization…" });
  }

  function handleUseOptimized() {
    useOptimized();
    setAppStatus({ type: "ok", message: "Optimized boundary selected for export." });
  }

  function handleKeepOriginal() {
    keepOriginal();
    setAppStatus({ type: "ok", message: "Original boundary selected for export." });
  }

  function handleRestoreOriginal() {
    restoreOriginal();
    setAppStatus({ type: "idle", message: "Optimization cleared — original boundary restored." });
  }

  // Notify app status after optimization completes (derived from state change)
  useEffect(() => {
    if (!optimizationState) return;
    if (optimizationState.status === "success") {
      const { pointsRemoved } = optimizationState.meta;
      setAppStatus({
        type: "ok",
        message: `Optimization ready — ${pointsRemoved} point(s) removed. Compare and choose.`,
      });
    } else if (optimizationState.status === "failed") {
      setAppStatus({
        type: "warn",
        message: `Optimization rejected: ${optimizationState.error} Original boundary preserved.`,
      });
    }
  }, [optimizationState]);

  // ── Export ────────────────────────────────────────────────────────────────

  function handleExport() {
    // Guard: state check (use selectedPoints for geometry decision)
    if (points.length < 3 || drawing || tracking || !validated) {
      setAppStatus({ type: "warn", message: "Please finish and validate the boundary first." });
      return;
    }

    // Guard: farm name required
    const nameErr = validateFarmName(farmName);
    if (nameErr) {
      setFarmNameError(nameErr);
      setAppStatus({ type: "warn", message: nameErr });
      return;
    }
    setFarmNameError(null);

    // Re-validate the selected geometry before export
    const revalidationError = validateBoundary(selectedPoints);
    if (revalidationError) {
      setAppStatus({
        type: "error",
        message: `Selected geometry failed validation: ${revalidationError}`,
      });
      return;
    }

    // Build GeoJSON — farmId is stable from the hook (generated at record creation)
    let record;
    try {
      record = buildGeoJSON({
        points: selectedPoints,
        farmId,
        farmName: farmName.trim(),
        validatedAt,
        geometryVersion: selectedVersion,
        optimizationMeta: optimizationState?.meta ?? null,
      });
    } catch (err) {
      setAppStatus({ type: "error", message: `Export failed: ${err.message}` });
      return;
    }

    // Trigger download — boundary is preserved regardless of download outcome
    try {
      const blob = new Blob([JSON.stringify(record, null, 2)], {
        type: "application/geo+json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `insurechain-farm-${farmId.slice(0, 8)}.geojson`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setAppStatus({ type: "ok", message: `GeoJSON file downloaded ✅ (${selectedVersion} boundary, ${selectedPoints.length} points).` });
    } catch (err) {
      // Download failure does not lose the boundary
      setAppStatus({
        type: "error",
        message: `Download failed: ${err.message}. Your boundary is still captured.`,
      });
    }

    // NOTE: server persistence and blockchain anchoring are NOT implemented.
    // Add a submitToChain(record) call here when the backend is ready.
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="app">
      <header className="header">
        <div>
          <h1>GeoFence</h1>
          <p>GPS-based farm boundary mapping</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="tag">InsureChain Prototype</span>
          <button
            className="secondary"
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            style={{ fontSize: "18px", padding: "8px 12px" }}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      <Toolbar
        mode={mode}
        tracking={tracking}
        validated={validated}
        pointCount={points.length}
        tileMode={tileMode}
        followGPS={followGPS}
        optimizing={optimizing}
        onGetLocation={handleGetLocation}
        onStartDrawing={handleStartDrawing}
        onFinishBoundary={handleFinishBoundary}
        onStartWalking={handleStartWalking}
        onStopWalking={handleStopWalking}
        onUndoPoint={wrappedUndoPoint}
        onClear={handleClear}
        onExport={handleExport}
        onToggleTile={() =>
          setTileMode((m) => (m === "street" ? "satellite" : "street"))
        }
        onToggleFollow={() => setFollowGPS((f) => !f)}
        onOptimize={handleOptimize}
      />

      {/* Status bar */}
      <p
        className={`status ${statusClass(appStatus.type)}`}
        role="status"
        aria-live="polite"
      >
        {appStatus.message}
      </p>

      <section className="layout">
        <div className="map">
          <MapView
            position={position}
            accuracy={accuracy}
            points={points}
            drawing={drawing}
            tracking={tracking}
            validated={validated}
            followGPS={followGPS}
            addPoint={wrappedAddPoint}
            tileMode={tileMode}
            optimizedPoints={optimizedPoints}
            selectedVersion={selectedVersion}
            showBothBoundaries={showBothBoundaries}
          />
        </div>

        <FarmDetails
          position={position}
          accuracy={accuracy}
          points={selectedPoints}
          validated={validated}
          validatedAt={validatedAt}
          areaSqM={areaSqM}
          perimM={perimM}
          farmName={farmName}
          farmNameError={farmNameError}
          onFarmNameChange={handleFarmNameChange}
        />
      </section>

      {/* Optimization panel — shown whenever we have ≥3 points */}
      {points.length >= 3 && (
        <OptimizationPanel
          comparison={comparison}
          optimizing={optimizing}
          onRunOptimize={handleOptimize}
          onUseOptimized={handleUseOptimized}
          onKeepOriginal={handleKeepOriginal}
          onRestoreOriginal={handleRestoreOriginal}
          pointCount={points.length}
          validated={validated}
        />
      )}
    </main>
  );
}
