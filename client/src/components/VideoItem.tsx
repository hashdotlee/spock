import { useEffect, useRef } from "react";
import { FaMicrophoneSlash, FaVideoSlash } from "react-icons/fa";

const VideoItem = ({
  isLocal = false,
  peerId,
  stream,
  consumer,
  name,
  videoEnabled = true,
  audioEnabled = true,
  isScreen = false,
}: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (isLocal && stream) {
        videoRef.current.srcObject = stream;
      } else if (consumer) {
        const mediaStream = new MediaStream();
        mediaStream.addTrack(consumer.track);
        videoRef.current.srcObject = mediaStream;
      }
    }
  }, [consumer, isLocal, stream]);

  // Handle producer paused/resumed states for remote videos
  useEffect(() => {
    if (consumer) {
      const handlePaused = () => {
        if (videoRef.current && videoRef.current.style) {
          videoRef.current.style.display = "none";
        }
      };

      const handleResumed = () => {
        if (videoRef.current && videoRef.current.style) {
          videoRef.current.style.display = "block";
        }
      };

      consumer.on("pause", handlePaused);
      consumer.on("resume", handleResumed);

      return () => {
        consumer.off("pause", handlePaused);
        consumer.off("resume", handleResumed);
      };
    }
  }, [consumer]);

  return (
    <div className={`video-item ${isScreen ? "screen-share" : ""}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={audioEnabled ? false : true}
        style={{ display: videoEnabled ? "block" : "none" }}
      />

      <div className="peer-name">{name}</div>

      {isScreen && <div className="screen-sharing-label">Screen Share</div>}

      {/* Status indicators */}
      {!videoEnabled && (
        <div className="muted-icon">
          <FaVideoSlash />
        </div>
      )}

      {!audioEnabled && !isScreen && (
        <div
          className="muted-icon"
          style={{ right: videoEnabled ? "10px" : "50px" }}
        >
          <FaMicrophoneSlash />
        </div>
      )}
    </div>
  );
};

export default VideoItem;
