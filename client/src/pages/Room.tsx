import React, { useEffect, useRef, useState } from "react";
import { Badge, Button, Col, Row, Spinner } from "react-bootstrap";
import {
  FaComments,
  FaCopy,
  FaDesktop,
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhoneSlash,
  FaTimes,
  FaVideo,
  FaVideoSlash,
} from "react-icons/fa";
import { useNavigate, useParams } from "react-router";
import ChatPanel from "../components/ChatPanel";
import ParticipantsList from "../components/ParticipantsList";
import VideoItem from "../components/VideoItem";
import { useRoom } from "../contexts/RoomContext";

const Room = () => {
  const { roomId: roomIdParam } = useParams();
  const navigate = useNavigate();

  const {
    roomId,
    isJoined,
    isLoading,
    peers,
    consumers,
    localStream,
    videoEnabled,
    audioEnabled,
    isScreenSharing,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    leaveRoom,
  } = useRoom();

  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState("participants"); // 'participants' or 'chat'
  const [roomUrl, setRoomUrl] = useState("");
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Check if we're in the correct room, redirect to home if not
  useEffect(() => {
    if (!isLoading && !isJoined) {
      navigate("/");
    }

    if (roomIdParam && roomId && roomIdParam !== roomId) {
      navigate(`/room/${roomId}`);
    }
  }, [isJoined, isLoading, navigate, roomId, roomIdParam]);

  // Set room URL for sharing
  useEffect(() => {
    if (roomId) {
      setRoomUrl(`${window.location.origin}/#${roomId}`);
    }
  }, [roomId]);

  // Set up local video
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Check for mobile and add resize listener
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setShowSidebar(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Copy room URL to clipboard
  const copyRoomUrl = () => {
    navigator.clipboard
      .writeText(roomUrl)
      .then(() => {
        alert("Room URL copied to clipboard!");
      })
      .catch((err) => {
        console.error("Could not copy text: ", err);
      });
  };

  // Handle sidebar toggle on mobile
  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <Spinner animation="border" variant="light" />
        <div className="loading-text">Connecting to room...</div>
      </div>
    );
  }

  return (
    <div className="conference-container">
      <Row className="g-0 h-100">
        {/* Video Grid */}
        <Col md={showSidebar ? 9 : 12}>
          <div className="video-grid">
            {/* Local Video */}
            <VideoItem
              isLocal={true}
              stream={localStream}
              name="You"
              videoEnabled={videoEnabled}
              audioEnabled={audioEnabled}
            />

            {/* Remote Videos */}
            {Array.from(peers.entries()).map(([peerId, peer]: any) => {
              const relevantConsumers = Array.from(consumers.entries())
                .filter(
                  ([_, consumer]: any) => consumer.producerPeerId === peerId,
                )
                .map(([_, consumer]: any) => consumer);

              const videoConsumer = relevantConsumers.find(
                (consumer) =>
                  consumer.consumer.kind === "video" &&
                  consumer.consumer.appData.source !== "screen",
              );

              const audioConsumer = relevantConsumers.find(
                (consumer) => consumer.consumer.kind === "audio",
              );

              const screenConsumer = relevantConsumers.find(
                (consumer) =>
                  consumer.consumer.kind === "video" &&
                  consumer.consumer.appData.source === "screen",
              );

              return (
                <React.Fragment key={peerId}>
                  {/* Regular Video */}
                  {videoConsumer && (
                    <VideoItem
                      peerId={peerId}
                      consumer={videoConsumer.consumer}
                      name={peer.name}
                      isScreen={false}
                    />
                  )}

                  {/* Screen Share */}
                  {screenConsumer && (
                    <VideoItem
                      peerId={peerId}
                      consumer={screenConsumer.consumer}
                      name={`${peer.name}'s Screen`}
                      isScreen={true}
                    />
                  )}
                </React.Fragment>
              );
            })}

            {/* Screen Sharing (Local) */}
            {isScreenSharing && (
              <VideoItem
                isLocal={true}
                stream={localStream}
                name="Your Screen"
                isScreen={true}
              />
            )}
          </div>
        </Col>

        {/* Sidebar */}
        <Col md={3} className={`sidebar-col ${showSidebar ? "show" : ""}`}>
          <div className="sidebar">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div className="btn-group">
                <Button
                  variant={
                    activeTab === "participants"
                      ? "primary"
                      : "outline-secondary"
                  }
                  onClick={() => setActiveTab("participants")}
                >
                  Participants
                </Button>
                <Button
                  variant={
                    activeTab === "chat" ? "primary" : "outline-secondary"
                  }
                  onClick={() => setActiveTab("chat")}
                >
                  Chat
                </Button>
              </div>

              {isMobile && (
                <Button
                  variant="link"
                  className="text-light"
                  onClick={toggleSidebar}
                >
                  <FaTimes />
                </Button>
              )}
            </div>

            {/* Participants Tab */}
            {activeTab === "participants" && <ParticipantsList />}

            {/* Chat Tab */}
            {activeTab === "chat" && <ChatPanel />}

            {/* Room Info */}
            <div className="room-info">
              <h5>
                Room ID: <span>{roomId}</span>
              </h5>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={copyRoomUrl}
                >
                  <FaCopy className="me-1" /> Copy Link
                </Button>
                <Badge bg="light" text="dark">
                  {peers.size + 1} participant{peers.size !== 0 ? "s" : ""}
                </Badge>
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {/* Toggle sidebar button for mobile */}
      {isMobile && !showSidebar && (
        <Button
          variant="primary"
          className="sidebar-toggle rounded-circle"
          onClick={toggleSidebar}
        >
          <FaComments />
        </Button>
      )}

      {/* Bottom Controls */}
      <div className="controls-container">
        <div className="controls">
          <Button
            className={`btn-control ${audioEnabled ? "" : "inactive"}`}
            onClick={toggleAudio}
          >
            {audioEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
          </Button>

          <Button
            className={`btn-control ${videoEnabled ? "" : "inactive"}`}
            onClick={toggleVideo}
          >
            {videoEnabled ? <FaVideo /> : <FaVideoSlash />}
          </Button>

          <Button
            className={`btn-control ${isScreenSharing ? "active" : ""}`}
            onClick={toggleScreenShare}
          >
            <FaDesktop />
          </Button>

          <Button className="btn-control btn-danger" onClick={leaveRoom}>
            <FaPhoneSlash />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Room;
