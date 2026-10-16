import { useState } from "react";
import { formatArea, formatDistance } from "../utils/geo";

/**
 * FarmDetails — sidebar panel.
 *
 * Accessibility:
 *  - Label/input association via htmlFor + id
 *  - aria-required on required field
 *  - aria-invalid + role="alert" for inline validation error
 *  - aria-live region for dynamic status
 *
 * Props:
 *  position         [lat, lng] | null
 *  accuracy         number | null         metres
 *  points           [lat, lng][]
 *  validated        boolean
 *  validatedAt      string | null         ISO 8601
 *  areaSqM          number
 *  perimM           number
 *  farmName         string
 *  farmNameError    string | null         inline validation message
 *  onFarmNameChange fn(string) => void
 */
export default function FarmDetails({
  position,
  accuracy,
  points,
  validated,
  validatedAt,
  areaSqM,
  perimM,
  farmName,
  farmNameError,
  onFarmNameChange,
}) {
  const [copied, setCopied] = useState(false);

  /** Copy current GPS coords to clipboard. */
  function handleCopyCoords() {
    if (!position) return;
    const text = `${position[0].toFixed(6)}, ${position[1].toFixed(6)}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <aside className="details" aria-label="Farm details panel">
      <h2>Farm Details</h2>

      {/* ── Farm name ──────────────────────────────────────── */}
      <div className="field-group">
        <label className="field-label" htmlFor="farm-name">
          Farm name <span aria-hidden="true" className="required-star">*</span>
        </label>
        <input
          id="farm-name"
          className={`farm-name-input${farmNameError ? " input-error" : ""}`}
          type="text"
          value={farmName}
          onChange={(e) => onFarmNameChange(e.target.value)}
          placeholder="e.g. North Field Plot A"
          aria-label="Farm name"
          aria-required="true"
          aria-invalid={!!farmNameError}
          aria-describedby={farmNameError ? "farm-name-error" : undefined}
          maxLength={120}
        />
        {farmNameError && (
          <p id="farm-name-error" className="field-error" role="alert">
            {farmNameError}
          </p>
        )}
      </div>

      {/* ── GPS info ────────────────────────────────────────── */}
      <dl className="stat-list" aria-live="polite" aria-label="GPS and boundary statistics">
        <div className="stat-row">
          <dt>Latitude</dt>
          <dd>{position ? position[0].toFixed(6) : "—"}</dd>
        </div>
        <div className="stat-row">
          <dt>Longitude</dt>
          <dd>{position ? position[1].toFixed(6) : "—"}</dd>
        </div>
        <div className="stat-row">
          <dt>GPS accuracy</dt>
          <dd>{accuracy != null ? `±${Math.round(accuracy)} m` : "Unknown"}</dd>
        </div>
        <div className="stat-row">
          <dt>Boundary points</dt>
          <dd>{points.length}</dd>
        </div>
        <div className="stat-row">
          <dt>Area</dt>
          <dd>
            {areaSqM > 0
              ? `${areaSqM.toFixed(1)} m² / ${formatArea(areaSqM)}`
              : "—"}
          </dd>
        </div>
        <div className="stat-row">
          <dt>Perimeter</dt>
          <dd>{perimM > 0 ? formatDistance(perimM) : "—"}</dd>
        </div>
        {validatedAt && (
          <div className="stat-row">
            <dt>Validated at</dt>
            <dd>{new Date(validatedAt).toLocaleTimeString()}</dd>
          </div>
        )}
      </dl>

      {/* ── Copy coordinates button ───────────────────────── */}
      {position && (
        <button
          className="secondary copy-btn"
          onClick={handleCopyCoords}
          aria-label="Copy GPS coordinates to clipboard"
          title="Copy latitude, longitude to clipboard"
        >
          {copied ? "✅ Copied!" : "📋 Copy Coords"}
        </button>
      )}

      {/* ── Validation badge ─────────────────────────────────── */}
      {validated ? (
        <p className="validated-badge" role="status">
          ✅ Boundary validated
        </p>
      ) : points.length >= 3 ? (
        <p className="unvalidated-badge" role="status">
          ⚠️ Not yet validated
        </p>
      ) : null}

      {/* ── Instructions ─────────────────────────────────────── */}
      <details className="hint-details">
        <summary>How to use</summary>
        <p className="hint">
          <strong>1.</strong> Tap <em>Get My Location</em> to centre the map on your position.
          <br />
          <strong>2a. Draw mode:</strong> Tap <em>Mark Boundary</em>, then click ≥ 3 points around the field on the map.
          <br />
          <strong>2b. Walk mode:</strong> Tap <em>Start Walking</em> and walk the field edge. Tap <em>Stop Walking</em> when done.
          <br />
          <strong>3.</strong> Tap <em>Finish Boundary</em> to validate the polygon.
          <br />
          <strong>4.</strong> Enter the farm name, then tap <em>Export GeoJSON</em>.
          <br />
          <strong>💾 Auto-saved:</strong> Your boundary is saved locally and will persist if you refresh the page.
        </p>
      </details>

      {/* ── Disclaimer ───────────────────────────────────────── */}
      <p className="disclaimer">
        ⚠ Client-side validation only. This record is not stored on a server
        or anchored on a blockchain.
      </p>
    </aside>
  );
}
