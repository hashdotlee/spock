import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { io } from "socket.io-client";

const SocketContext = createContext<any>(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Create socket connection
    const socketConnection = io(import.meta.env.VITE_SOCKET_URL || "/", {
      transports: ["websocket"],
      reconnectionAttempts: 10,
    });

    // Setup event listeners
    socketConnection.on("connect", () => {
      console.log("Connected to signaling server");
      setIsConnected(true);
    });

    socketConnection.on("disconnect", () => {
      console.log("Disconnected from signaling server");
      setIsConnected(false);
    });

    socketConnection.on("connect_error", (error) => {
      console.error("Connection error:", error);
      setIsConnected(false);
    });

    // Save socket to state
    setSocket(socketConnection);

    // Cleanup on unmount
    return () => {
      socketConnection.disconnect();
    };
  }, []);

  const value = {
    socket,
    isConnected,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};
