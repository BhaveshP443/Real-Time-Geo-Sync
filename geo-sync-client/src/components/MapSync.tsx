'use client';

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLngLiteral } from "leaflet";
import throttle from "lodash.throttle";
import { getSocket } from "../lib/socket";

import "leaflet/dist/leaflet.css";

type Role = "tracker" | "tracked";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type MapState = {
  center: LatLngLiteral;
  zoom: number;
};

type RoomJoinedPayload = {
  roomId: string;
  role: Role;
  trackerOnline: boolean;
  initialState: MapState | null;
};

type TrackerStatusPayload = {
  trackerOnline: boolean;
};

type MapUpdatePayload = {
  center: LatLngLiteral;
  zoom: number;
};

function MapEvents({
  role,
  roomId,
  socketIdEnabled,
  mapState,
  onTrackerViewChange,
}: {
  role: Role;
  roomId: string;
  socketIdEnabled: boolean;
  mapState: MapState;
  onTrackerViewChange: (next: MapState) => void;
}) {
  const throttledEmit = useMemo(
    () =>
      throttle((state: MapState) => {
        if (!socketIdEnabled || !roomId || role !== "tracker") return;
        const socket = getSocket();
        socket.emit("map_update", {
          roomId,
          center: state.center,
          zoom: state.zoom,
        });
      }, 50),
    [roomId, role, socketIdEnabled]
  );

  const map = useMapEvents({
    move: () => {
      if (role !== "tracker") return;
      const center = map.getCenter();
      const zoom = map.getZoom();
      const next: MapState = {
        center: { lat: center.lat, lng: center.lng },
        zoom,
      };
      onTrackerViewChange(next);
      throttledEmit(next);
    },
    zoom: () => {
      if (role !== "tracker") return;
      const center = map.getCenter();
      const zoom = map.getZoom();
      const next: MapState = {
        center: { lat: center.lat, lng: center.lng },
        zoom,
      };
      onTrackerViewChange(next);
      throttledEmit(next);
    },
  });

  useEffect(() => {
    if (role === "tracked") {
      map.setView(mapState.center, mapState.zoom, { animate: true });
    }
  }, [map, mapState.center.lat, mapState.center.lng, mapState.zoom, role]);

  return null;
}

export function MapSync() {
  const [roomIdInput, setRoomIdInput] = useState("");
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("tracker");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [trackerOnline, setTrackerOnline] = useState(false);
  const [mapState, setMapState] = useState<MapState>({
    center: { lat: 37.7749, lng: -122.4194 },
    zoom: 13,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => {
      setConnectionStatus((prev) =>
        prev === "connecting" ? "connected" : "connected"
      );
    };

    const handleDisconnect = () => {
      setConnectionStatus("disconnected");
      setJoinedRoomId(null);
      setTrackerOnline(false);
    };

    const handleRoomJoined = (payload: RoomJoinedPayload) => {
      setJoinedRoomId(payload.roomId);
      setErrorMessage(null);
      setConnectionStatus("connected");
      setTrackerOnline(payload.trackerOnline);

      if (payload.initialState) {
        setMapState(payload.initialState);
      }
    };

    const handleJoinError = (payload: { message: string }) => {
      setErrorMessage(payload.message);
      setConnectionStatus("error");
    };

    const handleMapUpdate = (payload: MapUpdatePayload) => {
      if (role !== "tracked") return;
      setMapState({
        center: {
          lat: Number(payload.center.lat),
          lng: Number(payload.center.lng),
        },
        zoom: Number(payload.zoom),
      });
    };

    const handleTrackerStatus = (payload: TrackerStatusPayload) => {
      setTrackerOnline(payload.trackerOnline);
    };

    const handleTrackerDisconnected = () => {
      setTrackerOnline(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room_joined", handleRoomJoined);
    socket.on("join_error", handleJoinError);
    socket.on("map_update", handleMapUpdate);
    socket.on("tracker_status", handleTrackerStatus);
    socket.on("tracker_disconnected", handleTrackerDisconnected);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room_joined", handleRoomJoined);
      socket.off("join_error", handleJoinError);
      socket.off("map_update", handleMapUpdate);
      socket.off("tracker_status", handleTrackerStatus);
      socket.off("tracker_disconnected", handleTrackerDisconnected);
    };
  }, [role]);

  const handleJoin = () => {
    const trimmed = roomIdInput.trim();
    if (!trimmed) {
      setErrorMessage("Please enter a room ID.");
      return;
    }

    setConnectionStatus("connecting");
    setErrorMessage(null);

    const socket = getSocket();
    socket.emit("join_room", { roomId: trimmed, role });
  };

  const connectionLabel =
    connectionStatus === "connected"
      ? "Connected"
      : connectionStatus === "connecting"
      ? "Connecting..."
      : connectionStatus === "error"
      ? "Error"
      : "Disconnected";

  const roleLabel = role === "tracker" ? "Tracker (Broadcasting)" : "Tracked (Syncing)";

  return (
    <div className="app-root">
      <div className="top-bar">
        <div className="title-block">
          <h1 className="app-title">Real-Time Geo-Sync</h1>
          <p className="app-subtitle">
            Join a shared room and synchronize map movements in real-time.
          </p>
        </div>

        <div className="controls">
          <div className="field-group">
            <label className="label">Room ID</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. demo-room-1"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="label">Role</label>
            <div className="role-toggle">
              <button
                type="button"
                className={`toggle-btn ${
                  role === "tracker" ? "toggle-btn-active" : ""
                }`}
                onClick={() => setRole("tracker")}
              >
                Tracker
              </button>
              <button
                type="button"
                className={`toggle-btn ${
                  role === "tracked" ? "toggle-btn-active" : ""
                }`}
                onClick={() => setRole("tracked")}
              >
                Tracked
              </button>
            </div>
          </div>

          <button type="button" className="primary-btn" onClick={handleJoin}>
            {joinedRoomId ? "Re-Join Room" : "Join Room"}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="map-wrapper">
          <MapContainer
            center={mapState.center}
            zoom={mapState.zoom}
            style={{ height: "100%", width: "100%", borderRadius: "16px" }}
            scrollWheelZoom={true}
            zoomControl={true}
            dragging={role === "tracker"}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapEvents
              role={role}
              roomId={joinedRoomId ?? roomIdInput.trim()}
              socketIdEnabled={connectionStatus === "connected"}
              mapState={mapState}
              onTrackerViewChange={(next) => setMapState(next)}
            />
          </MapContainer>

          <div className="hud">
            <div className="hud-row">
              <span className="badge role-badge">
                {roleLabel}
              </span>
              <span
                className={`badge status-badge status-${connectionStatus}`}
              >
                {connectionLabel}
              </span>
              <span
                className={`badge tracker-badge ${
                  trackerOnline ? "tracker-online" : "tracker-offline"
                }`}
              >
                Tracker: {trackerOnline ? "Online" : "Offline"}
              </span>
            </div>
            <div className="hud-row metrics">
              <span>
                Lat:{" "}
                <strong>{mapState.center.lat.toFixed(5)}</strong>
              </span>
              <span>
                Lng:{" "}
                <strong>{mapState.center.lng.toFixed(5)}</strong>
              </span>
              <span>
                Zoom: <strong>{mapState.zoom.toFixed(2)}</strong>
              </span>
              {joinedRoomId && (
                <span className="room-indicator">
                  Room: <strong>{joinedRoomId}</strong>
                </span>
              )}
            </div>
            {errorMessage && (
              <div className="hud-row error-row">
                <span className="error-text">{errorMessage}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

