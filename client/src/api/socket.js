/**
 * Socket.IO client singleton.
 * Lazy-connect, auto-reconnect, cookie-based auth.
 */

import { io } from 'socket.io-client';

let socket = null;

/**
 * Get or create the socket connection.
 */
export function getSocket() {
  if (socket && socket.connected) return socket;

  if (!socket) {
    // In development, Vite proxies /socket.io to the backend.
    // In production, the socket connects to the same origin.
    socket = io({
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

/**
 * Disconnect and destroy the socket instance.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Check if socket is currently connected.
 */
export function isSocketConnected() {
  return socket?.connected ?? false;
}

export default { getSocket, disconnectSocket, isSocketConnected };
