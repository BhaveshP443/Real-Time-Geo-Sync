"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === "undefined") {
    throw new Error("Socket should only be initialized in the browser");
  }

  if (!socket) {
    const url =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      "http://localhost:4000";

    socket = io(url, {
      transports: ["websocket"],
      autoConnect: true,
    });
  }

  return socket;
}