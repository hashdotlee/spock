import "bootstrap/dist/css/bootstrap.min.css";
import { ToastContainer } from "react-bootstrap";
import { Route, Routes } from "react-router";
import { RoomProvider } from "./contexts/RoomContext";
import { SocketProvider } from "./contexts/SocketContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import "./App.css";
import Room from "./pages/Room";

function App() {
  return (
    <SocketProvider>
      <RoomProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<Room />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <ToastContainer position="bottom-end" className="p-3" />
      </RoomProvider>
    </SocketProvider>
  );
}

export default App;
