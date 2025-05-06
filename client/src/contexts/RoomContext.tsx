// ignore ts
// @ts-nocheck
import { Device } from "mediasoup-client";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { useSocket } from "./SocketContext";

const RoomContext = createContext<any>(null);

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }: { children: ReactNode }) => {
  const { socket, isConnected } = useSocket();
  const navigate = useNavigate();

  // State variables
  const [roomId, setRoomId] = useState<any>(null);
  const [userName, setUserName] = useState<any>("");
  const [isJoined, setIsJoined] = useState<any>(false);
  const [isLoading, setIsLoading] = useState<any>(false);
  const [error, setError] = useState<any>();
  const [peers, setPeers] = useState<any>(new Map());
  const [consumers, setConsumers] = useState<any>(new Map());
  const [device, setDevice] = useState<any>(null);
  const [_, setRtpCapabilities] = useState<any>(null);
  const [producerTransport, setProducerTransport] = useState<any>(null);
  const [consumerTransport, setConsumerTransport] = useState<any>(null);
  const [videoProducer, setVideoProducer] = useState<any>(null);
  const [audioProducer, setAudioProducer] = useState<any>(null);
  const [screenProducer, setScreenProducer] = useState<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [screenStream, setScreenStream] = useState<any>(null);
  const [videoEnabled, setVideoEnabled] = useState<any>(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState<any>(false);
  const [messages, setMessages] = useState<any>([]);

  // Join room
  const joinRoom = useCallback(
    async (
      roomIdToJoin: string,
      name: string,
      initialVideoEnabled = true,
      initialAudioEnabled = true,
    ) => {
      if (!isConnected || !socket) {
        setError("Not connected to signaling server");
        return false;
      }

      try {
        setIsLoading(true);
        setError(null);
        setRoomId(roomIdToJoin);
        setUserName(name);
        setVideoEnabled(initialVideoEnabled);
        setAudioEnabled(initialAudioEnabled);

        // Get local media
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        // Set initial media state
        stream.getAudioTracks()[0].enabled = initialAudioEnabled;
        stream.getVideoTracks()[0].enabled = initialVideoEnabled;
        setLocalStream(stream);

        // Join the room
        const {
          roomId: joinedRoomId,
          routerRtpCapabilities,
          existingPeers,
          error,
        } = await new Promise((resolve) => {
          socket.emit(
            "joinRoom",
            { roomId: roomIdToJoin, name },
            (response) => {
              resolve(response);
            },
          );
        });

        if (error) {
          throw new Error(error);
        }

        // Create mediasoup device
        const newDevice = new Device();
        await newDevice.load({ routerRtpCapabilities });
        setDevice(newDevice);
        setRtpCapabilities(routerRtpCapabilities);

        // Store existing peers
        const peersMap = new Map();
        existingPeers.forEach((peer) => {
          peersMap.set(peer.id, { id: peer.id, name: peer.name });
        });
        setPeers(peersMap);

        // Create send and receive transports
        await createSendTransport(newDevice, stream);
        console.log("Send transport created");
        await createReceiveTransport(newDevice, stream);

        setIsJoined(true);
        navigate(`/room/${roomIdToJoin}`);

        // Redirect to room page
        return true;
      } catch (err) {
        console.error("Error joining room:", err);
        setError(err.message);
        if (localStream) {
          localStream.getTracks().forEach((track) => track.stop());
        }
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected, socket, navigate],
  );

  // Create Send Transport
  const createSendTransport = useCallback(
    async (device, localStream) => {
      if (!socket || !device) return;

      try {
        const {
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters,
          error,
        } = await new Promise((resolve) => {
          socket.emit(
            "createWebRtcTransport",
            { direction: "send" },
            (response) => {
              resolve(response);
            },
          );
        });

        if (error) {
          throw new Error(error);
        }

        const transport = device.createSendTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters,
        });

        transport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              const { connected, error } = await new Promise((resolve) => {
                socket.emit(
                  "connectTransport",
                  {
                    transportId: transport.id,
                    dtlsParameters,
                  },
                  (response) => {
                    resolve(response);
                  },
                );
              });

              if (error) {
                errback(new Error(error));
                return;
              }

              callback();
            } catch (err) {
              errback(err);
            }
          },
        );

        transport.on(
          "produce",
          async ({ kind, rtpParameters, appData }, callback, errback) => {
            try {
              const { id, error } = await new Promise((resolve) => {
                socket.emit(
                  "produce",
                  {
                    transportId: transport.id,
                    kind,
                    rtpParameters,
                    appData,
                  },
                  (response) => {
                    resolve(response);
                  },
                );
              });

              if (error) {
                errback(new Error(error));
                return;
              }

              callback({ id });
            } catch (err) {
              errback(err);
            }
          },
        );

        setProducerTransport(transport);

        // Produce video and audio and screen if available
        if (localStream && device.canProduce("video")) {
          const videoTrack = localStream.getVideoTracks()[0];
          if (videoTrack) {
            const producer = await transport.produce({
              track: videoTrack,
              encodings: [
                {
                  maxBitrate: 100000,
                  scaleResolutionDownBy: 4,
                  maxFramerate: 15,
                },
                {
                  maxBitrate: 300000,
                  scaleResolutionDownBy: 2,
                  maxFramerate: 30,
                },
                {
                  maxBitrate: 900000,
                  scaleResolutionDownBy: 1,
                  maxFramerate: 60,
                },
              ],
              codecOptions: {
                videoGoogleStartBitrate: 1000,
              },
              appData: { source: "webcam" },
            });
            setVideoProducer(producer);
          }
        }

        if (localStream && device.canProduce("audio")) {
          const audioTrack = localStream.getAudioTracks()[0];
          if (audioTrack) {
            const producer = await transport.produce({
              track: audioTrack,
              codecOptions: {
                opusStereo: true,
                opusDtx: true,
                opusFec: true,
                opusPtime: 20,
                opusMaxPlaybackRate: 48000,
              },
              appData: { source: "microphone" },
            });
            setAudioProducer(producer);
          }
        }
      } catch (err) {
        console.error("Error creating send transport:", err);
        setError(err.message);
      }
    },
    [socket, device],
  );

  // Create Receive Transport
  const createReceiveTransport = useCallback(
    async (device, localStream) => {
      if (!socket || !device) return;

      try {
        const {
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters,
          error,
        } = await new Promise((resolve) => {
          socket.emit(
            "createWebRtcTransport",
            { direction: "receive" },
            (response) => {
              resolve(response);
            },
          );
        });

        if (error) {
          throw new Error(error);
        }

        const transport = device.createRecvTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters,
        });

        transport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              const { connected, error } = await new Promise((resolve) => {
                socket.emit(
                  "connectTransport",
                  {
                    transportId: transport.id,
                    dtlsParameters,
                  },
                  (response) => {
                    resolve(response);
                  },
                );
              });

              if (error) {
                errback(new Error(error));
                return;
              }

              callback();
            } catch (err) {
              errback(err);
            }
          },
        );

        setConsumerTransport(transport);
      } catch (err) {
        console.error("Error creating receive transport:", err);
        setError(err.message);
      }
    },
    [socket, device],
  );

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!videoProducer) return;

    try {
      setVideoEnabled(!videoEnabled);

      if (videoEnabled) {
        await new Promise((resolve, reject) => {
          socket.emit(
            "pauseProducer",
            { producerId: videoProducer.id },
            (response) => {
              if (response.error) reject(new Error(response.error));
              else resolve(response);
            },
          );
        });
      } else {
        await new Promise((resolve, reject) => {
          socket.emit(
            "resumeProducer",
            { producerId: videoProducer.id },
            (response) => {
              if (response.error) reject(new Error(response.error));
              else resolve(response);
            },
          );
        });
      }

      // Update track enabled state
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = !videoEnabled;
        }
      }
    } catch (err) {
      console.error("Error toggling video:", err);
      setError(err.message);
    }
  }, [socket, videoProducer, videoEnabled, localStream]);

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (!audioProducer) return;

    try {
      setAudioEnabled(!audioEnabled);

      if (audioEnabled) {
        await new Promise((resolve, reject) => {
          socket.emit(
            "pauseProducer",
            { producerId: audioProducer.id },
            (response) => {
              if (response.error) reject(new Error(response.error));
              else resolve(response);
            },
          );
        });
      } else {
        await new Promise((resolve, reject) => {
          socket.emit(
            "resumeProducer",
            { producerId: audioProducer.id },
            (response) => {
              if (response.error) reject(new Error(response.error));
              else resolve(response);
            },
          );
        });
      }

      // Update track enabled state
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !audioEnabled;
        }
      }
    } catch (err) {
      console.error("Error toggling audio:", err);
      setError(err.message);
    }
  }, [socket, audioProducer, audioEnabled, localStream]);

  // Toggle screen sharing
  const toggleScreenShare = useCallback(async () => {
    try {
      if (isScreenSharing && screenProducer) {
        // Stop screen sharing
        screenProducer.close();

        await new Promise((resolve, reject) => {
          socket.emit(
            "closeProducer",
            { producerId: screenProducer.id },
            (response) => {
              if (response.error) reject(new Error(response.error));
              else resolve(response);
            },
          );
        });

        setScreenProducer(null);

        if (screenStream) {
          screenStream.getTracks().forEach((track) => track.stop());
          setScreenStream(null);
        }

        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        const producer = await producerTransport.produce({
          track: stream.getVideoTracks()[0],
          encodings: [
            { maxBitrate: 500000, scaleResolutionDownBy: 2 },
            { maxBitrate: 1000000, scaleResolutionDownBy: 1 },
          ],
          appData: { source: "screen" },
        });

        stream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };

        setScreenStream(stream);
        setScreenProducer(producer);
        setIsScreenSharing(true);
      }
    } catch (err) {
      console.error("Error toggling screen sharing:", err);
      setError(err.message);
    }
  }, [
    socket,
    producerTransport,
    isScreenSharing,
    screenProducer,
    screenStream,
  ]);

  // Consume a remote producer
  const consumeProducer = useCallback(
    async (producerId, producerPeerId, kind, appData) => {
      if (!device || !consumerTransport) return;

      try {
        const {
          id,
          producerId: prodId,
          kind: kindType,
          rtpParameters,
          type,
          producerPaused,
          error,
        } = await new Promise((resolve) => {
          socket.emit(
            "consume",
            {
              transportId: consumerTransport.id,
              producerId,
              rtpCapabilities: device.rtpCapabilities,
            },
            (response) => {
              resolve(response);
            },
          );
        });

        if (error) {
          throw new Error(error);
        }

        const consumer = await consumerTransport.consume({
          id,
          producerId: prodId,
          kind: kindType,
          rtpParameters,
          appData: { ...appData, producerPeerId },
        });

        console.log("Consumer created:", consumer);

        // Add consumer to state
        setConsumers((prevConsumers) => {
          const newConsumers = new Map(prevConsumers);
          newConsumers.set(consumer.id, { consumer, producerPeerId });
          return newConsumers;
        });

        // Resume the consumer
        await new Promise((resolve) => {
          socket.emit("resumeConsumer", { consumerId: id }, (response) => {
            resolve(response);
          });
        });

        return consumer;
      } catch (err) {
        console.error("Error consuming producer:", err);
        setError(err.message);
        return null;
      }
    },
    [socket, device, consumerTransport],
  );

  // Send chat message
  const sendMessage = useCallback(
    (message) => {
      if (!socket || !roomId || !message.trim()) return;

      socket.emit("chatMessage", { roomId, message: message.trim() });

      // Add message to local state
      const newMessage = {
        peerId: socket.id,
        name: userName,
        message: message.trim(),
        timestamp: new Date().toISOString(),
        isSelf: true,
      };

      setMessages((prev) => [...prev, newMessage]);
    },
    [socket, roomId, userName],
  );

  // Leave room
  const leaveRoom = useCallback(() => {
    // Close producers
    if (videoProducer) videoProducer.close();
    if (audioProducer) audioProducer.close();
    if (screenProducer) screenProducer.close();

    // Close transports
    if (producerTransport) producerTransport.close();
    if (consumerTransport) consumerTransport.close();

    // Stop local streams
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
    }

    // Emit leave room
    if (socket) {
      socket.emit("leaveRoom");
    }

    // Reset state
    setRoomId(null);
    setIsJoined(false);
    setPeers(new Map());
    setConsumers(new Map());
    setDevice(null);
    setRtpCapabilities(null);
    setProducerTransport(null);
    setConsumerTransport(null);
    setVideoProducer(null);
    setAudioProducer(null);
    setScreenProducer(null);
    setLocalStream(null);
    setScreenStream(null);
    setVideoEnabled(true);
    setAudioEnabled(true);
    setIsScreenSharing(false);
    setMessages([]);

    // Navigate to home
    navigate("/");
  }, [
    socket,
    videoProducer,
    audioProducer,
    screenProducer,
    producerTransport,
    consumerTransport,
    localStream,
    screenStream,
    navigate,
  ]);

  // Set up socket event listeners
  useEffect(() => {
    if (!socket || !isJoined) return;

    const onPeerJoined = ({ peerId, name }) => {
      console.log(`Peer joined: ${name} (${peerId})`);
      setPeers((prevPeers) => {
        const newPeers = new Map(prevPeers);
        newPeers.set(peerId, { id: peerId, name });
        return newPeers;
      });
    };

    const onPeerLeft = ({ peerId }) => {
      console.log(`Peer left: ${peerId}`);
      setPeers((prevPeers) => {
        const newPeers = new Map(prevPeers);
        newPeers.delete(peerId);
        return newPeers;
      });

      // Clean up consumers for this peer
      setConsumers((prevConsumers) => {
        const newConsumers = new Map(prevConsumers);
        Array.from(newConsumers.entries()).forEach(([consumerId, consumer]) => {
          if (consumer.producerPeerId === peerId) {
            consumer.consumer.close();
            newConsumers.delete(consumerId);
          }
        });
        return newConsumers;
      });
    };

    const onNewProducer = async ({
      producerId,
      producerPeerId,
      kind,
      appData,
    }) => {
      console.log(
        `New producer: ${producerId} (${kind}) from ${producerPeerId}`,
      );
      await consumeProducer(producerId, producerPeerId, kind, appData);
    };

    const onProducerPaused = ({ producerId, producerPeerId }) => {
      console.log(`Producer paused: ${producerId} from ${producerPeerId}`);
    };

    const onProducerResumed = ({ producerId, producerPeerId }) => {
      console.log(`Producer resumed: ${producerId} from ${producerPeerId}`);
    };

    const onConsumerClosed = ({ consumerId }) => {
      console.log(`Consumer closed: ${consumerId}`);
      setConsumers((prevConsumers) => {
        const newConsumers = new Map(prevConsumers);
        if (newConsumers.has(consumerId)) {
          newConsumers.get(consumerId).consumer.close();
          newConsumers.delete(consumerId);
        }
        return newConsumers;
      });
    };

    const onChatMessage = ({ peerId, name, message, timestamp }) => {
      const newMessage = {
        peerId,
        name,
        message,
        timestamp,
        isSelf: peerId === socket.id,
      };

      setMessages((prev) => [...prev, newMessage]);
    };

    // Register event handlers
    socket.on("peerJoined", onPeerJoined);
    socket.on("peerLeft", onPeerLeft);
    socket.on("newProducer", onNewProducer);
    socket.on("producerPaused", onProducerPaused);
    socket.on("producerResumed", onProducerResumed);
    socket.on("consumerClosed", onConsumerClosed);
    socket.on("chatMessage", onChatMessage);

    return () => {
      // Unregister event handlers
      socket.off("peerJoined", onPeerJoined);
      socket.off("peerLeft", onPeerLeft);
      socket.off("newProducer", onNewProducer);
      socket.off("producerPaused", onProducerPaused);
      socket.off("producerResumed", onProducerResumed);
      socket.off("consumerClosed", onConsumerClosed);
      socket.off("chatMessage", onChatMessage);
    };
  }, [socket, isJoined, consumeProducer]);

  const value = {
    roomId,
    userName,
    isJoined,
    isLoading,
    error,
    peers,
    consumers,
    device,
    videoEnabled,
    audioEnabled,
    isScreenSharing,
    localStream,
    messages,
    joinRoom,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    sendMessage,
    leaveRoom,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};
