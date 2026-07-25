import { io, Socket } from 'socket.io-client';
import { apiBaseUrl } from '@/api/client';

let socket: Socket | null = null;
let activeToken: string | null = null;
const socketBaseUrl = () => apiBaseUrl.replace(/\/api\/?$/, '');

export const connectSocket = (token: string, onChanged: (event: string) => void) => {
  if (!token) return undefined;
  if (!socket || activeToken !== token) {
    socket?.disconnect();
    activeToken = token;
    socket = io(socketBaseUrl(), { auth: { token }, transports: ['websocket', 'polling'] });
  }
  const events = ['customers:changed', 'products:changed', 'invoices:changed', 'notifications:changed', 'exports:changed'];
  events.forEach((event) => socket?.on(event, () => onChanged(event)));
  return () => events.forEach((event) => socket?.off(event));
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
  activeToken = null;
};
