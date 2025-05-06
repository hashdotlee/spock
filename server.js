// server.js
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mediasoup = require("mediasoup");
const path = require("path");

// Thêm vào đầu file server.js
const dotenv = require("dotenv");
dotenv.config();

// Các hằng số sử dụng biến môi trường
const PORT = process.env.PORT || 3001;
const MEDIASOUP_WORKER_SETTINGS = {
  logLevel: process.env.MEDIASOUP_LOG_LEVEL || "warn",
  rtcMinPort: parseInt(process.env.MEDIASOUP_RTC_MIN_PORT || 10000),
  rtcMaxPort: parseInt(process.env.MEDIASOUP_RTC_MAX_PORT || 10100),
  workerCount: parseInt(process.env.MEDIASOUP_WORKER_THREADS || 1),
};

// Cấu hình CORS
const corsOptions = {
  origin: process.env.CORS_ORIGIN || false,
  methods: ["GET", "POST"],
  credentials: true,
};

// Constants
const MEDIASOUP_ROUTER_OPTIONS = {
  mediaCodecs: [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: {
        "x-google-start-bitrate": 1000,
      },
    },
    {
      kind: "video",
      mimeType: "video/VP9",
      clockRate: 90000,
      parameters: {
        "profile-id": 2,
        "x-google-start-bitrate": 1000,
      },
    },
    {
      kind: "video",
      mimeType: "video/h264",
      clockRate: 90000,
      parameters: {
        "packetization-mode": 1,
        "profile-level-id": "4d0032",
        "level-asymmetry-allowed": 1,
        "x-google-start-bitrate": 1000,
      },
    },
  ],
};

// App setup
const app = express();
const server = http.createServer(app);

// Thay đổi trong io initialization
const io = socketIO(server, {
  cors: corsOptions,
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Route for the home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Global variables
let worker;
const rooms = new Map(); // roomId => Room
const peers = new Map(); // socketId => Peer

// MediaSoup data structures
class Room {
  constructor(roomId, router) {
    this.id = roomId;
    this.router = router;
    this.peers = new Map(); // socketId => Peer
  }
}

class Peer {
  constructor(socketId, name) {
    this.id = socketId;
    this.name = name;
    this.transports = new Map(); // transportId => Transport
    this.producers = new Map(); // producerId => Producer
    this.consumers = new Map(); // consumerId => Consumer
    this.roomId = null;
  }
}

// Start MediaSoup worker
async function startMediasoup() {
  worker = await mediasoup.createWorker(MEDIASOUP_WORKER_SETTINGS);

  console.log("MediaSoup worker created");

  worker.on("died", () => {
    console.error("MediaSoup worker died, exiting...");
    process.exit(1);
  });
}

// Create a MediaSoup router
async function createRouter() {
  return await worker.createRouter(MEDIASOUP_ROUTER_OPTIONS);
}

// Create a room with a MediaSoup router
async function createRoom(roomId) {
  const router = await createRouter();
  const room = new Room(roomId, router);
  rooms.set(roomId, room);
  return room;
}

// Get or create a room
async function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = await createRoom(roomId);
  }
  return room;
}

// Thay đổi trong createWebRtcTransport
async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: process.env.SERVER_LISTEN_IP || "0.0.0.0",
        announcedIp: process.env.SERVER_ANNOUNCED_IP || "127.0.0.1",
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: parseInt(
      process.env.MEDIASOUP_INITIAL_AVAILABLE_OUTGOING_BITRATE || 1000000,
    ),
    minimumAvailableOutgoingBitrate: parseInt(
      process.env.MEDIASOUP_MINIMUM_AVAILABLE_OUTGOING_BITRATE || 600000,
    ),
    maxSctpMessageSize: 262144,
    maxIncomingBitrate: parseInt(
      process.env.MEDIASOUP_MAX_INCOMING_BITRATE || 1500000,
    ),
  });

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    sctpParameters: transport.sctpParameters,
    transport,
  };
}

// Start the server
async function start() {
  await startMediasoup();

  // Socket.IO connection handling
  io.on("connection", async (socket) => {
    console.log("Client connected:", socket.id);

    // Create a new peer
    const peer = new Peer(socket.id, socket.id);
    peers.set(socket.id, peer);

    console.log("Peers created:", peers);

    // Join a room
    socket.on("joinRoom", async ({ roomId, name }, callback) => {
      try {
        const room = await getOrCreateRoom(roomId);

        // Add peer to the room
        peer.name = name;
        peer.roomId = roomId;
        room.peers.set(socket.id, peer);

        // Join the socket.io room
        socket.join(roomId);

        // Notify other peers in the room
        socket.to(roomId).emit("peerJoined", {
          peerId: socket.id,
          name: peer.name,
        });

        // Get router RTP capabilities
        const routerRtpCapabilities = room.router.rtpCapabilities;

        // Get the list of peers already in the room
        const existingPeers = [];
        room.peers.forEach((existingPeer, peerId) => {
          if (peerId !== socket.id) {
            existingPeers.push({
              id: peerId,
              name: existingPeer.name,
            });
          }
        });

        // Send response back to the client
        callback({
          roomId,
          routerRtpCapabilities,
          existingPeers,
        });
      } catch (error) {
        console.error("Error joining room:", error);
        callback({ error: error.message });
      }
    });

    // Create WebRTC transport
    socket.on("createWebRtcTransport", async ({ direction }, callback) => {
      try {
        console.log("Peers error:", peers);
        const peer = peers.get(socket.id);
        if (!peer) throw new Error("Peer not found");

        const room = rooms.get(peer.roomId);
        if (!room) throw new Error("Room not found");

        const {
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters,
          transport,
        } = await createWebRtcTransport(room.router);

        // Store the transport
        peer.transports.set(id, transport);

        callback({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters,
        });
      } catch (error) {
        console.error("Error creating WebRTC transport:", error);
        callback({ error: error.message });
      }
    });

    // Connect transport
    socket.on(
      "connectTransport",
      async ({ transportId, dtlsParameters }, callback) => {
        try {
          const peer = peers.get(socket.id);
          if (!peer) throw new Error("Peer not found");

          const transport = peer.transports.get(transportId);
          if (!transport) throw new Error("Transport not found");

          await transport.connect({ dtlsParameters });

          callback({ connected: true });
        } catch (error) {
          console.error("Error connecting transport:", error);
          callback({ error: error.message });
        }
      },
    );

    // Produce (send media)
    socket.on(
      "produce",
      async ({ transportId, kind, rtpParameters, appData }, callback) => {
        try {
          const peer = peers.get(socket.id);
          if (!peer) throw new Error("Peer not found");

          const transport = peer.transports.get(transportId);
          if (!transport) throw new Error("Transport not found");

          const producer = await transport.produce({
            kind,
            rtpParameters,
            appData: { ...appData, peerId: socket.id },
          });

          // Store the producer
          peer.producers.set(producer.id, producer);

          // Notify all peers in the room about the new producer
          const room = rooms.get(peer.roomId);
          if (room) {
            socket.to(peer.roomId).emit("newProducer", {
              producerId: producer.id,
              producerPeerId: socket.id,
              kind,
              appData,
            });
          }

          producer.on("transportclose", () => {
            producer.close();
            peer.producers.delete(producer.id);
          });

          callback({ id: producer.id });
        } catch (error) {
          console.error("Error producing:", error);
          callback({ error: error.message });
        }
      },
    );

    // Consume (receive media)
    socket.on(
      "consume",
      async ({ transportId, producerId, rtpCapabilities }, callback) => {
        try {
          const peer = peers.get(socket.id);
          if (!peer) throw new Error("Peer not found");

          const room = rooms.get(peer.roomId);
          if (!room) throw new Error("Room not found");

          const transport = peer.transports.get(transportId);
          if (!transport) throw new Error("Transport not found");

          // Check if the router can consume the producer
          if (
            !room.router.canConsume({
              producerId,
              rtpCapabilities,
            })
          ) {
            throw new Error("Router cannot consume the producer");
          }

          // Create consumer
          const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true, // Start in paused state
          });

          // Store the consumer
          peer.consumers.set(consumer.id, consumer);

          consumer.on("transportclose", () => {
            consumer.close();
            peer.consumers.delete(consumer.id);
          });

          consumer.on("producerclose", () => {
            consumer.close();
            peer.consumers.delete(consumer.id);

            socket.emit("consumerClosed", { consumerId: consumer.id });
          });

          callback({
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            producerPaused: consumer.producerPaused,
          });
        } catch (error) {
          console.error("Error consuming:", error);
          callback({ error: error.message });
        }
      },
    );

    // Resume consumer
    socket.on("resumeConsumer", async ({ consumerId }, callback) => {
      try {
        const peer = peers.get(socket.id);
        if (!peer) throw new Error("Peer not found");

        const consumer = peer.consumers.get(consumerId);
        if (!consumer) throw new Error("Consumer not found");

        await consumer.resume();

        callback({ resumed: true });
      } catch (error) {
        console.error("Error resuming consumer:", error);
        callback({ error: error.message });
      }
    });

    // Pause/resume producer
    socket.on("pauseProducer", async ({ producerId }, callback) => {
      try {
        const peer = peers.get(socket.id);
        if (!peer) throw new Error("Peer not found");

        const producer = peer.producers.get(producerId);
        if (!producer) throw new Error("Producer not found");

        await producer.pause();

        // Notify all peers
        socket.to(peer.roomId).emit("producerPaused", {
          producerId,
          producerPeerId: socket.id,
        });

        callback({ paused: true });
      } catch (error) {
        console.error("Error pausing producer:", error);
        callback({ error: error.message });
      }
    });

    socket.on("resumeProducer", async ({ producerId }, callback) => {
      try {
        const peer = peers.get(socket.id);
        if (!peer) throw new Error("Peer not found");

        const producer = peer.producers.get(producerId);
        if (!producer) throw new Error("Producer not found");

        await producer.resume();

        // Notify all peers
        socket.to(peer.roomId).emit("producerResumed", {
          producerId,
          producerPeerId: socket.id,
        });

        callback({ resumed: true });
      } catch (error) {
        console.error("Error resuming producer:", error);
        callback({ error: error.message });
      }
    });

    // Close producer
    socket.on("closeProducer", async ({ producerId }, callback) => {
      try {
        const peer = peers.get(socket.id);
        if (!peer) throw new Error("Peer not found");

        const producer = peer.producers.get(producerId);
        if (!producer) throw new Error("Producer not found");

        producer.close();
        peer.producers.delete(producerId);

        callback({ closed: true });
      } catch (error) {
        console.error("Error closing producer:", error);
        callback({ error: error.message });
      }
    });

    // Leave room
    socket.on("leaveRoom", () => {
      leaveRoom(socket.id);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      leaveRoom(socket.id);
    });

    // Handle chat message
    socket.on("chatMessage", ({ roomId, message }) => {
      socket.to(roomId).emit("chatMessage", {
        peerId: socket.id,
        name: peer.name,
        message,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // Helper function to handle a peer leaving a room
  function leaveRoom(peerId) {
    const peer = peers.get(peerId);
    if (!peer) return;

    const roomId = peer.roomId;
    const room = rooms.get(roomId);

    if (room) {
      // Notify other peers
      io.to(roomId).emit("peerLeft", { peerId });

      // Remove peer from the room
      room.peers.delete(peerId);

      // Close all transports
      peer.transports.forEach((transport) => transport.close());

      // If the room is empty, close it
      if (room.peers.size === 0) {
        rooms.delete(roomId);
      }
    }

    // Clean up the peer
    peers.delete(peerId);
  }

  // Start server
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

// Catch unhandled errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

// Start the server
start();
