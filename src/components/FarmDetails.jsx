/**
 * FarmDetails — sidebar panel showing GPS stats, area, perimeter,
 * and a farm name input for export metadata.
 *
 * Props:
 *  position       [lat, lng] | null
 *  accuracy       number | null  (metres)
 *  points         [lat, lng][]
 *  validated      boolean
 *  areaSqM        number
 *  perimM         number
 *  farmName       string
 *  onFarmNameChange fn(string)
 */
export default function FarmDetails({
  position,
  accuracy,
  points,
  validated,
  areaSqM,
  perimM,
  farmName,
  onFarmNameChange,
}) {
  return (
    <aside className="details" aria-label="Farm details">
      <h2>Farm Details</h2>

      {/* Farm name — required for insurance records */}
      <label className="field-label" htmlFor="farm-name">
        <strong>Farm name:</strong>
      </label>
      <input
        id="farm-name"
        className="farm-name-input"
        type="text"
        value={farmName}
        onChange={(e) => onFarmNameChange(e.target.value)}
        placeholder="Enter farm name…"
        aria-label="Farm name"
      />

      <p>
        <strong>Latitude:</strong>{" "}
        {position ? position[0].toFixed(6) : "Not captured"}
      </p>

      <p>
        <strong>Longitude:</strong>{" "}
        {position ? position[1].toFixed(6) : "Not captured"}
      </p>

      <p>
        <strong>GPS accuracy:</strong>{" "}
        {accuracy != null ? `±${Math.round(accuracy)} m` : "Unknown"}
      </p>

      <p>
        <strong>Boundary points:</strong> {points.length}
      </p>

      <p>
        <strong>Area:</strong> {areaSqM.toFixed(1)} m²
      </p>

      <p>
        <strong>Area (hectares):</strong> {(areaSqM / 10_000).toFixed(4)} ha
      </p>

      <p>
        <strong>Perimeter:</strong>{" "}
        {perimM > 0 ? `${perimM.toFixed(1)} m` : "—"}
      </p>

      {validated && (
        <p className="validated-badge">✅ Boundary validated</p>
      )}

      <p className="hint">
        <strong>How to use:</strong>
        <br />
        1. Tap <em>Get My Location</em> to centre the map.
        <br />
        2a. <em>Mark Boundary</em> → click ≥ 3 points on the map.
        <br />
        2b. Or <em>Start Walking</em> → walk the field edge → <em>Stop Walking</em>.
        <br />
        3. Tap <em>Finish Boundary</em> to validate.
        <br />
        4. Enter the farm name, then <em>Export GeoJSON</em>.
      </p>
    </aside>
  );
}
