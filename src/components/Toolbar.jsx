/**
 * Toolbar — all action buttons for the geofencing app.
 *
 * Props are passed down from App; this component is pure (no state).
 * All buttons have:
 *   • aria-label for screen readers
 *   • visible :focus-visible styles (via CSS)
 *   • disabled state controlled by parent
 */
export default function Toolbar({
  mode,        // "idle"|"drawing"|"walking"|"review"
  tracking,
  validated,
  pointCount,
  tileMode,
  followGPS,
  optimizing,        // boolean — true while optimization is running
  onGetLocation,
  onStartDrawing,
  onFinishBoundary,
  onStartWalking,
  onStopWalking,
  onUndoPoint,
  onClear,
  onExport,
  onToggleTile,
  onToggleFollow,
  onOptimize,        // () => void — run boundary optimization
}) {
  const isDrawing = mode === "drawing";
  const isWalking = mode === "walking";
  const isActive  = isDrawing || isWalking; // any recording in progress

  // Optimize is enabled when there are ≥3 points, no active recording, and not already optimizing
  const canOptimize = pointCount >= 3 && !isActive && !optimizing;

  return (
    <section className="toolbar" role="toolbar" aria-label="Farm boundary controls">

      {/* ── GPS ──────────────────────────────────────────── */}
      <button
        onClick={onGetLocation}
        disabled={isActive}
        aria-label="Capture GPS location"
        title="Centre map on your current GPS position"
      >
        📍 Get My Location
      </button>

      {/* ── Drawing mode ──────────────────────────────────── */}
      <button
        onClick={onStartDrawing}
        disabled={tracking}
        aria-label="Start manual boundary drawing"
        title="Click points on the map to draw the farm boundary"
      >
        ✏️ Mark Boundary
      </button>

      {/* ── Walking mode ──────────────────────────────────── */}
      <button
        onClick={onStartWalking}
        disabled={tracking || isDrawing}
        aria-label="Start GPS walk recording"
        title="Walk the field edge — GPS will record your path"
      >
        🚶 Start Walking
      </button>

      <button
        onClick={onStopWalking}
        disabled={!tracking}
        aria-label="Stop GPS walk recording"
        title="Stop recording and validate the walked boundary"
      >
        ⏹ Stop Walking
      </button>

      {/* ── Edit ──────────────────────────────────────────── */}
      <button
        onClick={onUndoPoint}
        disabled={!isDrawing || pointCount === 0}
        aria-label="Undo last point"
        title="Remove the last drawn point (draw mode only)"
      >
        ↩ Undo Point
      </button>

      <button
        onClick={onFinishBoundary}
        disabled={isWalking || pointCount < 3 || validated}
        aria-label="Validate and finish boundary"
        title="Close and validate the boundary polygon"
      >
        ✅ Finish Boundary
      </button>

      {/* ── Optimize Boundary ─────────────────────────────── */}
      <button
        onClick={onOptimize}
        disabled={!canOptimize}
        aria-label="Optimize boundary geometry"
        title="Remove duplicate GPS points and apply conservative geometry simplification. The original boundary is always preserved."
      >
        {optimizing ? "⏳ Optimizing…" : "⬡ Optimize Boundary"}
      </button>

      {/* ── GPS follow toggle ─────────────────────────────── */}
      <button
        className={followGPS ? "active" : "secondary"}
        onClick={onToggleFollow}
        aria-label={followGPS ? "Disable GPS map follow" : "Enable GPS map follow"}
        aria-pressed={followGPS}
        title={
          followGPS
            ? "Map is following GPS — click to stop following"
            : "Click to make the map follow your GPS"
        }
      >
        {followGPS ? "🔒 Following GPS" : "📌 Pan Freely"}
      </button>

      {/* ── Tile toggle ───────────────────────────────────── */}
      <button
        className="secondary"
        onClick={onToggleTile}
        aria-label={tileMode === "street" ? "Switch to satellite view" : "Switch to street view"}
        title="Toggle between street and satellite map layers"
      >
        {tileMode === "street" ? "🛰 Satellite View" : "🗺 Street View"}
      </button>

      {/* ── Destructive actions ───────────────────────────── */}
      <button
        className="secondary"
        onClick={onClear}
        aria-label="Clear all boundary points"
        title="Discard all points and start over"
      >
        🗑 Clear
      </button>

      <button
        className="secondary"
        onClick={onExport}
        disabled={pointCount < 3 || isActive || !validated}
        aria-label="Export farm boundary as GeoJSON"
        title="Download the validated boundary as a GeoJSON file"
      >
        ⬇ Export GeoJSON
      </button>

    </section>
  );
}
