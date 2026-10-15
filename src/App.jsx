

import { useState, useRef, useEffect } from "react";
import kinks from "@turf/kinks";

import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";

import L from "leaflet";
import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";

import "leaflet/dist/leaflet.css";
import "./App.css";

// Fix marker icons for Vite
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

const DEFAULT_POSITION = [12.9716, 77.5946];

function MapController({ position }) {
  const map = useMap();

  if (position) {
    map.setView(position, 17);
  }

  return null;
}

function MapClickHandler({ drawing, addPoint }) {
  useMapEvents({
    click(event) {
      if (drawing) {
        addPoint([event.latlng.lat, event.latlng.lng]);
      }
    },
  });

  return null;
}

function validateBoundary(points) {
  if (points.length < 3) {
    return "Add at least 3 boundary points.";
  }

  // Reject consecutive duplicate points
  for (let i = 1; i < points.length; i++) {
    if (
      points[i][0] === points[i - 1][0] &&
      points[i][1] === points[i - 1][1]
    ) {
      return "Two consecutive points are identical.";
    }
  }

  const coordinates = [
    ...points.map(([lat, lng]) => [lng, lat]),
    [points[0][1], points[0][0]],
  ];

  const farmPolygon = turfPolygon([coordinates]);

  if (area(farmPolygon) < 1) {
    return "Farm boundary is too small or has zero area.";
  }

  const intersections = kinks(farmPolygon);

  if (intersections.features.length > 0) {
    return "Boundary crosses itself. Please redraw it.";
  }

  return null;
}

function distanceMetres(a, b) {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const R = 6371000;

  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(
    Math.sqrt(h),
    Math.sqrt(1 - h)
  );
}



export default function App() {
  const [tracking, setTracking] = useState(false);
const [gpsAccuracy, setGpsAccuracy] = useState(null);
const watchIdRef = useRef(null);
  const [validated, setValidated] = useState(false);
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [points, setPoints] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [message, setMessage] = useState(
    "Get your GPS location or start marking your farm."
  );
  
useEffect(() => {
  return () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
  };
}, []);


  const getLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Your browser does not support geolocation.");
      return;
    }

    setMessage("Requesting GPS location...");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition([coords.latitude, coords.longitude]);
        setAccuracy(coords.accuracy);

        setMessage("GPS location captured successfully.");
      },
      (error) => {
        setMessage(`Unable to get location: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  
const startDrawing = () => {
  if (watchIdRef.current !== null) {
    navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }

  setTracking(false);
  setPoints([]);
  setValidated(false);
  setDrawing(true);
  setMessage("Drawing mode ON — click points on the map.");
};


  
const finishDrawing = () => {
  const error = validateBoundary(points);

  if (error) {
    setValidated(false);
    setMessage(error);
    return;
  }

  setDrawing(false);
  setValidated(true);
  setMessage("Farm boundary validated successfully.");
};

const startWalking = () => {
  if (!navigator.geolocation) {
    setMessage("GPS is not supported by this browser.");
    return;
  }

  if (watchIdRef.current !== null) {
    navigator.geolocation.clearWatch(watchIdRef.current);
  }

  setPoints([]);
  setValidated(false);
  setDrawing(false);
  setTracking(true);
  setMessage("Waiting for a GPS location...");

  watchIdRef.current = navigator.geolocation.watchPosition(
    (result) => {
      const { latitude, longitude, accuracy } = result.coords;
      const newPoint = [latitude, longitude];

      setPosition(newPoint);
      setAccuracy(accuracy);
      setGpsAccuracy(accuracy);

      if (accuracy > 25) {
        setMessage(
          `GPS accuracy is ${accuracy.toFixed(1)} m. ` +
          "Waiting for a better signal."
        );
        return;
      }

      setPoints((previous) => {
        if (previous.length === 0) {
          setMessage("Walking mode active. Walk along the field edge.");
          return [newPoint];
        }

        const last = previous[previous.length - 1];

        // Ignore GPS updates that are less than 3 metres apart.
        if (distanceMetres(last, newPoint) < 3) {
          return previous;
        }

        return [...previous, newPoint];
      });
    },
    (error) => {
      setMessage(`GPS error: ${error.message}`);
      setTracking(false);

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    }
  );
};

const stopWalking = () => {
  if (watchIdRef.current !== null) {
    navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }

  setTracking(false);
  setDrawing(false);
  setMessage("Walking stopped. Review your boundary before validation.");
};



  const areaSquareMetres = points.length >= 3
    ? area(
        turfPolygon([[
          ...points.map(([lat, lng]) => [lng, lat]),
          [points[0][1], points[0][0]],
        ]])
      )
    : 0;

 
const exportBoundary = () => {
  if (points.length < 3 || drawing || tracking || !validated) {
    setMessage("Please finish and validate the boundary first.");
    return;
  }

  const coordinates = [
    ...points.map(([lat, lng]) => [lng, lat]),
    [points[0][1], points[0][0]],
  ];

  const farmRecord = {
    type: "Feature",
    properties: {
      farmName: "My Farm",
      farmId: crypto.randomUUID(),
      project: "InsureChain",
      areaSquareMetres,
      areaHectares: areaSquareMetres / 10000,
      boundaryPointCount: points.length,
      createdAt: new Date().toISOString(),
      validationStatus: "validated",
    },
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
  };

  const blob = new Blob(
    [JSON.stringify(farmRecord, null, 2)],
    { type: "application/geo+json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "farm-boundary.geojson";
  link.click();

  URL.revokeObjectURL(url);

  setMessage("Validated farm record exported successfully.");
};


  return (
    <main className="app">
      <header className="header">
        <div>
          <h1>GeoFence</h1>
          <p>GPS-based farm boundary mapping</p>
        </div>
        <span className="tag">InsureChain Prototype</span>
      </header>

      <section className="toolbar">
        <button onClick={getLocation}>
          Get My Location
        </button>

        <button onClick={startDrawing}>
          Mark Farm Boundary
        </button>
        <button onClick={startWalking} disabled={tracking}>
  Start Walking
</button>

<button onClick={stopWalking} disabled={!tracking}>
  Stop Walking
</button>

        <button
          onClick={() => setPoints((old) => old.slice(0, -1))}
          disabled={!drawing || points.length === 0}
        >
          Undo Point
        </button>

        
<button
  onClick={finishDrawing}
  disabled={tracking || points.length < 3 || validated}
>
  Finish Boundary
</button>


        
<button
  className="secondary"
  onClick={() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setTracking(false);
    setPoints([]);
    setDrawing(false);
    setValidated(false);
    setMessage("Boundary cleared.");
  }}
>
  Clear
</button>


        <button
          className="secondary"
          onClick={exportBoundary}
          disabled={points.length < 3 || drawing || tracking || !validated}
        >
          Export GeoJSON
        </button>
      </section>

      <p className="status">{message}</p>

      <section className="layout">
        <div className="map">
          <MapContainer
            center={DEFAULT_POSITION}
            zoom={13}
            scrollWheelZoom
            style={{ width: "100%", height: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapController position={position} />

            <MapClickHandler
              drawing={drawing}
              addPoint={(point) =>
                setPoints((old) => [...old, point])
              }
            />

            {position && <Marker position={position} />}

            {points.map((point, index) => (
              <Marker key={index} position={point} />
            ))}

            
{tracking && points.length >= 2 && (
  <Polyline
    positions={points}
    pathOptions={{ color: "#f97316", weight: 4 }}
  />
)}

{!tracking && points.length >= 3 && (
  <Polygon
    positions={points}
    pathOptions={{
      color: "#15803d",
      fillColor: "#4ade80",
      fillOpacity: 0.3,
    }}
  />
)}

          </MapContainer>
        </div>

        <aside className="details">
          <h2>Farm Details</h2>

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
  <strong>Area:</strong> {areaSquareMetres.toFixed(1)} m²
</p>

<p>
  <strong>Area in hectares:</strong>{" "}
  {(areaSquareMetres / 10000).toFixed(4)} ha
</p>


          <p className="hint">
            1. Capture GPS location.
            <br />
            2. Click Mark Farm Boundary.
            <br />
            3. Click at least 3 points around the field.
            <br />
            4. Finish the boundary and export GeoJSON.
          </p>
        </aside>
      </section>
    </main>
  );
}
