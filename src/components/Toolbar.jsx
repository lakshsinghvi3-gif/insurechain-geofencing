/**
 * Toolbar — all action buttons for the geofencing app.
 *
 * Props passed down from App so this component stays pure (no state).
 */
export default function Toolbar({
  tracking,
  drawing,
  validated,
  pointCount,
  tileMode,
  onGetLocation,
  onStartDrawing,
  onFinishDrawing,
  onStartWalking,
  onStopWalking,
  onUndoPoint,
  onClear,
  onExport,
  onToggleTile,
}) {
  return (
    <section className="toolbar" role="toolbar" aria-label="Farm boundary controls">
      <button onClick={onGetLocation} title="Capture your current GPS fix">
        📍 Get My Location
      </button>

      <button
        onClick={onStartDrawing}
        disabled={tracking}
        title="Click points on the map to draw the boundary"
      >
        ✏️ Mark Boundary
      </button>

      <button
        onClick={onStartWalking}
        disabled={tracking}
        title="Walk the field edge and record GPS trace"
      >
        🚶 Start Walking
      </button>

      <button
        onClick={onStopWalking}
        disabled={!tracking}
        title="Stop recording GPS trace"
      >
        ⏹ Stop Walking
      </button>

      <button
        onClick={onUndoPoint}
        disabled={!drawing || pointCount === 0}
        title="Remove the last drawn point"
      >
        ↩ Undo Point
      </button>

      <button
        onClick={onFinishDrawing}
        disabled={tracking || pointCount < 3 || validated}
        title="Validate and close the boundary"
      >
        ✅ Finish Boundary
      </button>

      <button
        className="secondary"
        onClick={onClear}
        title="Clear all boundary points and start over"
      >
        🗑 Clear
      </button>

      <button
        className="secondary"
        onClick={onExport}
        disabled={pointCount < 3 || drawing || tracking || !validated}
        title="Download boundary as GeoJSON"
      >
        ⬇ Export GeoJSON
      </button>

      <button
        className="secondary"
        onClick={onToggleTile}
        title="Switch between street and satellite map"
      >
        {tileMode === "street" ? "🛰 Satellite View" : "🗺 Street View"}
      </button>
    </section>
  );
}
