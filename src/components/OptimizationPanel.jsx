import { formatArea, formatDistance } from "../utils/geo";

/**
 * OptimizationPanel — shows optimization controls and comparison stats.
 *
 * Props:
 *  comparison        object | null   from useBoundaryOptimizer.getComparison()
 *  optimizing        boolean         true while status === "running"
 *  onRunOptimize     () => void
 *  onUseOptimized    () => void
 *  onKeepOriginal    () => void
 *  onRestoreOriginal () => void
 *  pointCount        number          current boundary vertex count
 */
export default function OptimizationPanel({
  comparison,
  optimizing,
  onRunOptimize,
  onUseOptimized,
  onKeepOriginal,
  onRestoreOriginal,
  pointCount,
}) {
  const canOptimize = pointCount >= 3;
  const hasSuccess = comparison?.status === "success";
  const hasFailed  = comparison?.status === "failed";

  return (
    <section className="opt-panel" aria-label="Boundary optimization">
      <h3 className="opt-title">⬡ Boundary Optimization</h3>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="opt-actions">
        <button
          onClick={onRunOptimize}
          disabled={!canOptimize || optimizing}
          aria-label="Run boundary optimization"
          title="Remove duplicate GPS points and apply conservative geometry simplification. The original boundary is always preserved."
        >
          {optimizing ? "⏳ Optimizing…" : "⬡ Optimize Boundary"}
        </button>

        {hasSuccess && (
          <>
            <button
              onClick={onUseOptimized}
              disabled={comparison.selectedVersion === "optimized"}
              className={comparison.selectedVersion === "optimized" ? "active" : ""}
              aria-label="Select optimized boundary for export"
              title="Use the optimized boundary for export"
            >
              ✅ Use Optimized
            </button>

            <button
              onClick={onKeepOriginal}
              disabled={comparison.selectedVersion === "original"}
              className={comparison.selectedVersion === "original" ? "active" : "secondary"}
              aria-label="Keep original boundary"
              title="Use the original boundary for export"
            >
              🔵 Keep Original
            </button>

            <button
              className="secondary"
              onClick={onRestoreOriginal}
              aria-label="Discard optimization results"
              title="Remove the optimization result and return to original-only mode"
            >
              ↩ Restore Original
            </button>
          </>
        )}

        {hasFailed && (
          <button
            className="secondary"
            onClick={onRestoreOriginal}
            aria-label="Dismiss optimization failure"
            title="Clear the failed optimization result"
          >
            ↩ Dismiss
          </button>
        )}
      </div>

      {/* ── Running indicator ──────────────────────────────────────────── */}
      {optimizing && (
        <p className="opt-note" role="status">
          Analyzing boundary geometry…
        </p>
      )}

      {/* ── Failure message ────────────────────────────────────────────── */}
      {hasFailed && (
        <div className="opt-error" role="alert">
          <strong>⚠ Optimization rejected</strong>
          <p>{comparison.error}</p>
          <p className="opt-note">Original boundary preserved — no changes were made.</p>
        </div>
      )}

      {/* ── Comparison table ───────────────────────────────────────────── */}
      {hasSuccess && (
        <>
          <p className="opt-selection-label">
            Active selection:{" "}
            <strong>
              {comparison.selectedVersion === "original"
                ? "🔵 Original"
                : "🟢 Optimized"}
            </strong>
          </p>

          <table className="opt-table" aria-label="Boundary comparison">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th
                  scope="col"
                  className={comparison.selectedVersion === "original" ? "opt-col--active" : ""}
                >
                  Original
                </th>
                <th
                  scope="col"
                  className={comparison.selectedVersion === "optimized" ? "opt-col--active" : ""}
                >
                  Optimized
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Vertices</td>
                <td className={comparison.selectedVersion === "original" ? "opt-col--active" : ""}>
                  {comparison.original.count}
                </td>
                <td className={comparison.selectedVersion === "optimized" ? "opt-col--active" : ""}>
                  {comparison.optimized.count}
                </td>
              </tr>
              <tr>
                <td>Area</td>
                <td className={comparison.selectedVersion === "original" ? "opt-col--active" : ""}>
                  {formatArea(comparison.original.area)}
                </td>
                <td className={comparison.selectedVersion === "optimized" ? "opt-col--active" : ""}>
                  {formatArea(comparison.optimized.area)}
                </td>
              </tr>
              <tr>
                <td>Perimeter</td>
                <td className={comparison.selectedVersion === "original" ? "opt-col--active" : ""}>
                  {formatDistance(comparison.original.perim)}
                </td>
                <td className={comparison.selectedVersion === "optimized" ? "opt-col--active" : ""}>
                  {formatDistance(comparison.optimized.perim)}
                </td>
              </tr>
              <tr>
                <td>Points removed</td>
                <td colSpan={2} className="opt-diff">
                  {comparison.diff.pointsRemoved > 0
                    ? `${comparison.diff.pointsRemoved} removed`
                    : "None removed"}
                </td>
              </tr>
              <tr>
                <td>Area difference</td>
                <td colSpan={2} className="opt-diff">
                  {comparison.diff.areaDiff === 0
                    ? "No change"
                    : `${comparison.diff.areaDiff >= 0 ? "+" : ""}${formatArea(
                        Math.abs(comparison.diff.areaDiff)
                      )} (${comparison.diff.areaPct >= 0 ? "+" : ""}${comparison.diff.areaPct.toFixed(
                        2
                      )}%)`}
                </td>
              </tr>
              <tr>
                <td>Opt. valid?</td>
                <td colSpan={2}>
                  {comparison.optimized.validationError ? (
                    <span className="opt-invalid">
                      ✗ {comparison.optimized.validationError}
                    </span>
                  ) : (
                    <span className="opt-valid">✓ Valid</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="opt-note">
            ℹ Optimization removes duplicate vertices and applies conservative
            geometry simplification. It does{" "}
            <strong>not</strong> correct GPS measurement errors, fill boundary
            gaps, or match legal parcel boundaries.
          </p>
        </>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!hasSuccess && !hasFailed && !optimizing && (
        <p className="opt-note">
          {canOptimize
            ? 'Click "Optimize Boundary" to remove duplicate points and simplify geometry.'
            : "Add at least 3 boundary points to enable optimization."}
        </p>
      )}
    </section>
  );
}
