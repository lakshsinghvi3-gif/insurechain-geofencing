import { useState, useEffect } from "react";
import { useGPS } from "./hooks/useGPS";
import { useGeofence } from "./hooks/useGeofence";
import { calcAreaSqM, calcPerimetreM, buildGeoJSON } from "./utils/geo";

import MapView from "./components/MapView";
import Toolbar from "./components/Toolbar";
import FarmDetails from "./components/FarmDetails";

import "./App.css";

export default function App() {
  // ── GPS hook ──────────────────────────────────────────────────────────────
  const {
    position,
    accuracy,
    tracking,
    gpsStatus,
    getLocation,
    startWalking,
    stopWalking,
    cleanup: cleanupGPS,
  } = useGPS();

  // ── Geofence / drawing hook ───────────────────────────────────────────────
  const {
    points,
    drawing,
    validated,
    addPoint,
    undoPoint,
    startDrawing,
    finishDrawing,
    resetAll,
  } = useGeofence();

  // ── Local UI state ────────────────────────────────────────────────────────
  const [message, setMessage] = useState(
    "Get your GPS location or start marking your farm."
  );
  const [farmName, setFarmName] = useState("");
  const [tileMode, setTileMode] = useState("street"); // "street" | "satellite"

  // Cleanup GPS watch on unmount
  useEffect(() => cleanupGPS, [cleanupGPS]);

  // ── Derived values ────────────────────────────────────────────────────────
  const areaSqM = calcAreaSqM(points);
  const perimM = calcPerimetreM(points);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleStartDrawing() {
    stopWalking();   // stop any active GPS watch before drawing
    startDrawing();
    setMessage("Drawing mode ON — click points on the map.");
  }

  function handleFinishDrawing() {
    const error = finishDrawing(points);
    if (error) {
      setMessage(error);
    } else {
      setMessage("Farm boundary validated successfully. ✅");
    }
  }

  function handleStartWalking() {
    startDrawing(); // reset geofence state
    startWalking((pt) => addPoint(pt));
    setMessage("Walking mode active — walk along the field edge.");
  }

  function handleStopWalking() {
    stopWalking();
    // Auto-validate after walking so the user doesn't miss the step
    const error = finishDrawing(points);
    if (error) {
      setMessage(`Walking stopped. ${error}`);
    } else {
      setMessage("Walking stopped — boundary validated. ✅ Ready to export.");
    }
  }

  function handleClear() {
    stopWalking();
    resetAll();
    setMessage("Boundary cleared.");
  }

  function handleExport() {
    if (points.length < 3 || drawing || tracking || !validated) {
      setMessage("Please finish and validate the boundary first.");
      return;
    }

    const record = buildGeoJSON(points, farmName, areaSqM);

    const blob = new Blob([JSON.stringify(record, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `farm-boundary-${Date.now()}.geojson`;
    link.click();
    URL.revokeObjectURL(url);

    // TODO: InsureChain blockchain anchoring hook
    // submitToChain(record).then(() => setMessage("Anchored on-chain ✅"));

    setMessage("GeoJSON exported successfully. ✅");
  }

  function handleGetLocation() {
    getLocation();
    setMessage("Requesting GPS location…");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="app">
      <header className="header">
        <div>
          <h1>GeoFence</h1>
          <p>GPS-based farm boundary mapping</p>
        </div>
        <span className="tag">InsureChain Prototype</span>
      </header>

      <Toolbar
        tracking={tracking}
        drawing={drawing}
        validated={validated}
        pointCount={points.length}
        tileMode={tileMode}
        onGetLocation={handleGetLocation}
        onStartDrawing={handleStartDrawing}
        onFinishDrawing={handleFinishDrawing}
        onStartWalking={handleStartWalking}
        onStopWalking={handleStopWalking}
        onUndoPoint={undoPoint}
        onClear={handleClear}
        onExport={handleExport}
        onToggleTile={() =>
          setTileMode((m) => (m === "street" ? "satellite" : "street"))
        }
      />

      {/* Status message — shows GPS and validation feedback */}
      <p className={`status ${gpsStatus ? "has-gps" : ""}`}>
        {gpsStatus || message}
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
            addPoint={addPoint}
            tileMode={tileMode}
          />
        </div>

        <FarmDetails
          position={position}
          accuracy={accuracy}
          points={points}
          validated={validated}
          areaSqM={areaSqM}
          perimM={perimM}
          farmName={farmName}
          onFarmNameChange={setFarmName}
        />
      </section>
    </main>
  );
}
