import { useEffect, useState } from "react";
import { Button, Card, Form, Spinner } from "react-bootstrap";
import { useRoom } from "../contexts/RoomContext";
import { useSocket } from "../contexts/SocketContext";

const Home = () => {
  const { joinRoom, isLoading, error } = useRoom();
  const { isConnected } = useSocket();

  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isJoining, setIsJoining] = useState(false);

  // Generate random room ID and user name on load
  useEffect(() => {
    // Generate random room ID if not in URL
    if (window.location.hash) {
      const hashRoomId = window.location.hash.substring(1);
      setRoomId(hashRoomId);
    } else {
      setRoomId(generateRandomRoomId());
    }

    // Generate random user name
    setUserName(generateRandomName());
  }, []);

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!roomId.trim() || !userName.trim()) {
      return;
    }

    setIsJoining(true);
    try {
      await joinRoom(
        roomId.trim(),
        userName.trim(),
        videoEnabled,
        audioEnabled,
      );
    } finally {
      setIsJoining(false);
    }
  };

  // Helper functions to generate random room ID and user name
  const generateRandomRoomId = () => {
    return Math.random().toString(36).substring(2, 10);
  };

  const generateRandomName = () => {
    const names = [
      "Alex",
      "Bailey",
      "Casey",
      "Dana",
      "Ellis",
      "Francis",
      "Gale",
      "Harper",
      "Indigo",
      "Jordan",
    ];
    return (
      names[Math.floor(Math.random() * names.length)] +
      Math.floor(Math.random() * 1000)
    );
  };

  return (
    <div className="home-container">
      <Card className="join-card">
        <Card.Header className="bg-primary text-white">
          <h2 className="mb-0">WebRTC Video Conference</h2>
        </Card.Header>
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Room ID</Form.Label>
              <Form.Control
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room ID or create new"
                required
              />
              <Form.Text className="text-muted">
                Enter an existing room ID or create a new one.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Your Name</Form.Label>
              <Form.Control
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Enable Video"
                checked={videoEnabled}
                onChange={(e) => setVideoEnabled(e.target.checked)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Enable Audio"
                checked={audioEnabled}
                onChange={(e) => setAudioEnabled(e.target.checked)}
              />
            </Form.Group>

            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}

            <Button
              variant="primary"
              type="submit"
              className="w-100"
              disabled={isJoining || isLoading || !isConnected}
            >
              {isJoining || isLoading ? (
                <>
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    role="status"
                    aria-hidden="true"
                    className="me-2"
                  />
                  Joining...
                </>
              ) : (
                "Join Room"
              )}
            </Button>

            {!isConnected && (
              <div className="alert alert-warning mt-3" role="alert">
                Connecting to server... Please wait.
              </div>
            )}
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Home;
