import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaUser,
  FaUserCircle,
  FaVideo,
  FaVideoSlash,
} from "react-icons/fa";
import { useRoom } from "../contexts/RoomContext";

const ParticipantsList = () => {
  const { userName, peers, videoEnabled, audioEnabled } = useRoom();

  return (
    <div>
      <h4 className="mb-3">Participants</h4>
      <ul className="participants-list">
        {/* Local User */}
        <li>
          <span className="participant-icon">
            <FaUserCircle />
          </span>
          <span className="flex-grow-1">{userName} (You)</span>
          <div className="d-flex gap-2">
            {audioEnabled ? (
              <FaMicrophone className="text-success" />
            ) : (
              <FaMicrophoneSlash className="text-danger" />
            )}
            {videoEnabled ? (
              <FaVideo className="text-success" />
            ) : (
              <FaVideoSlash className="text-danger" />
            )}
          </div>
        </li>

        {/* Remote Participants */}
        {Array.from(peers.entries()).map(([peerId, peer]: any) => (
          <li key={peerId}>
            <span className="participant-icon">
              <FaUser />
            </span>
            <span className="flex-grow-1">{peer.name}</span>
            {/* We don't show status indicators for remote peers as that would require
                tracking their statuses, which would be more complex */}
          </li>
        ))}

        {peers.size === 0 && (
          <li className="text-muted">No other participants yet</li>
        )}
      </ul>
    </div>
  );
};

export default ParticipantsList;
