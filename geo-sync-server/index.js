const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

app.use(
  cors({
    origin: CLIENT_ORIGIN,
  })
);

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Geo-Sync Socket Server" });
});

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// roomId -> { trackerSocketId?: string; lastMapState?: { center: { lat, lng }, zoom } }
const rooms = new Map();

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("join_room", ({ roomId, role }) => {
    try {
      if (!roomId || (role !== "tracker" && role !== "tracked")) {
        socket.emit("join_error", { message: "Invalid room or role." });
        return;
      }

      const trimmedRoomId = String(roomId).trim();
      let roomState = rooms.get(trimmedRoomId);
      if (!roomState) {
        roomState = {};
        rooms.set(trimmedRoomId, roomState);
      }

      if (role === "tracker") {
        if (roomState.trackerSocketId && roomState.trackerSocketId !== socket.id) {
          socket.emit("join_error", {
            message: "A tracker is already connected in this room.",
          });
          return;
        }
        roomState.trackerSocketId = socket.id;
      }

      socket.join(trimmedRoomId);
      socket.data.role = role;
      socket.data.roomId = trimmedRoomId;

      const trackerOnline = Boolean(roomState.trackerSocketId);

      socket.emit("room_joined", {
        roomId: trimmedRoomId,
        role,
        trackerOnline,
        initialState: roomState.lastMapState || null,
      });

      socket.to(trimmedRoomId).emit("tracker_status", { trackerOnline });

      console.log(
        `Socket ${socket.id} joined room ${trimmedRoomId} as ${role}`
      );
    } catch (err) {
      console.error("join_room error:", err);
      socket.emit("join_error", { message: "Failed to join room." });
    }
  });

  socket.on("map_update", (payload) => {
    try {
      const { roomId, center, zoom } = payload || {};
      if (!roomId || !center || typeof zoom !== "number") {
        return;
      }

      const role = socket.data.role;
      const trimmedRoomId = String(roomId).trim();
      const roomState = rooms.get(trimmedRoomId);
      if (!roomState) return;

      if (role !== "tracker" || roomState.trackerSocketId !== socket.id) {
        return;
      }

      const safeCenter = {
        lat: Number(center.lat),
        lng: Number(center.lng),
      };

      const safeZoom = Number(zoom);

      roomState.lastMapState = {
        center: safeCenter,
        zoom: safeZoom,
      };

      socket.to(trimmedRoomId).emit("map_update", {
        center: safeCenter,
        zoom: safeZoom,
      });
    } catch (err) {
      console.error("map_update error:", err);
    }
  });

  socket.on("disconnect", () => {
    try {
      const { role, roomId } = socket.data || {};
      console.log(`Client disconnected: ${socket.id}`);

      if (!roomId) return;
      const roomState = rooms.get(roomId);
      if (!roomState) return;

      if (role === "tracker" && roomState.trackerSocketId === socket.id) {
        roomState.trackerSocketId = undefined;
        io.to(roomId).emit("tracker_disconnected", {
          message: "Tracker disconnected.",
        });
        io.to(roomId).emit("tracker_status", { trackerOnline: false });
      }

      const roomHasSockets = io.sockets.adapter.rooms.get(roomId);
      if (!roomHasSockets || roomHasSockets.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty).`);
      }
    } catch (err) {
      console.error("disconnect handler error:", err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Geo-Sync Socket server listening on port ${PORT}`);
});

