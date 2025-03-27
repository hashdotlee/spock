// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

// Khởi tạo ứng dụng Express
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Tạo HTTP server
const server = http.createServer(app);

// Khởi tạo Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Lưu trữ thông tin về các phòng và người dùng
const rooms = {};
const userSocketMap = {};

// API routes
app.get("/api/rooms", (req, res) => {
  res.json(
    Object.keys(rooms).map((roomId) => ({
      id: roomId,
      name: rooms[roomId].name,
      participants: Object.keys(rooms[roomId].participants).length,
    })),
  );
});

app.post("/api/rooms", (req, res) => {
  const { name, createdBy } = req.body;
  const roomId = uuidv4();

  rooms[roomId] = {
    id: roomId,
    name,
    createdBy,
    createdAt: new Date(),
    participants: {},
    messages: [],
  };

  res.status(201).json({ roomId });
});

// Socket.IO event handlers
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Xử lý khi người dùng tham gia phòng
  socket.on("join-room", ({ roomId, user }) => {
    socket.join(roomId);
    userSocketMap[socket.id] = { roomId, user };

    // Thêm người dùng vào phòng
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        name: "Unnamed Room",
        participants: {},
        messages: [],
      };
    }

    rooms[roomId].participants[socket.id] = {
      id: user.id || socket.id,
      name: user.name,
      role: user.role || "student",
      joinedAt: new Date(),
      socketId: socket.id,
    };

    // Thông báo cho mọi người trong phòng
    io.to(roomId).emit("participant-joined", {
      participant: rooms[roomId].participants[socket.id],
      participants: rooms[roomId].participants,
    });

    console.log(`User ${user.name} joined room ${roomId}`);
  });

  // Xử lý tín hiệu WebRTC
  socket.on("offer", ({ targetId, sdp }) => {
    io.to(targetId).emit("offer", {
      from: socket.id,
      sdp,
    });
  });

  socket.on("answer", ({ targetId, sdp }) => {
    io.to(targetId).emit("answer", {
      from: socket.id,
      sdp,
    });
  });

  socket.on("ice-candidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("ice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  // Xử lý tin nhắn chat
  socket.on("send-message", ({ roomId, message }) => {
    const newMessage = {
      id: uuidv4(),
      sender: userSocketMap[socket.id]?.user || { name: "Unknown" },
      content: message,
      timestamp: new Date(),
    };

    if (rooms[roomId]) {
      rooms[roomId].messages.push(newMessage);
      io.to(roomId).emit("new-message", newMessage);
    }
  });

  // Xử lý yêu cầu chia sẻ màn hình
  socket.on("start-screen-sharing", ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].participants[socket.id]) {
      rooms[roomId].participants[socket.id].isSharing = true;
      io.to(roomId).emit("user-screen-sharing", {
        userId: socket.id,
        isSharing: true,
      });
    }
  });

  socket.on("stop-screen-sharing", ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].participants[socket.id]) {
      rooms[roomId].participants[socket.id].isSharing = false;
      io.to(roomId).emit("user-screen-sharing", {
        userId: socket.id,
        isSharing: false,
      });
    }
  });

  // Xử lý khi người dùng giơ tay
  socket.on("raise-hand", ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].participants[socket.id]) {
      rooms[roomId].participants[socket.id].handRaised = true;
      io.to(roomId).emit("hand-raised", {
        userId: socket.id,
        participant: rooms[roomId].participants[socket.id],
      });
    }
  });

  socket.on("lower-hand", ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].participants[socket.id]) {
      rooms[roomId].participants[socket.id].handRaised = false;
      io.to(roomId).emit("hand-lowered", {
        userId: socket.id,
        participant: rooms[roomId].participants[socket.id],
      });
    }
  });

  // Xử lý khi giáo viên tắt micro của học sinh
  socket.on("mute-participant", ({ roomId, participantId }) => {
    const user = userSocketMap[socket.id];
    if (
      user &&
      rooms[roomId] &&
      rooms[roomId].participants[socket.id].role === "teacher"
    ) {
      io.to(participantId).emit("request-mute");
      io.to(roomId).emit("participant-muted", { participantId });
    }
  });

  // Xử lý khi ngắt kết nối
  socket.on("disconnect", () => {
    const user = userSocketMap[socket.id];

    if (user && user.roomId && rooms[user.roomId]) {
      const { roomId } = user;

      // Xóa người dùng khỏi phòng
      if (rooms[roomId].participants[socket.id]) {
        delete rooms[roomId].participants[socket.id];

        // Thông báo cho mọi người trong phòng
        io.to(roomId).emit("participant-left", {
          participantId: socket.id,
          participants: rooms[roomId].participants,
        });
      }

      // Nếu phòng trống, xóa phòng
      if (Object.keys(rooms[roomId].participants).length === 0) {
        delete rooms[roomId];
      }
    }

    delete userSocketMap[socket.id];
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Khởi động server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
