// room-manager.js
class RoomManager {
  constructor(socketIoInstance, userId, config = {}) {
    this.socket = socketIoInstance;
    this.userId = userId;
    this.currentRoom = null;
    this.webrtcClient = null;
    this.participants = {};
    this.remoteStreams = {};
    this.localStream = null;
    this.isTeacher = config.isTeacher || false;
    this.config = {
      iceServers: config.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      ...config
    };
    
    // Event handlers
    this.onParticipantJoined = null;
    this.onParticipantLeft = null;
    this.onRemoteStreamReceived = null;
    this.onChatMessageReceived = null;
    this.onHandRaised = null;
    this.onHandLowered = null;
    this.onScreenSharingStarted = null;
    this.onScreenSharingStopped = null;
    
    // Cài đặt event listeners
    this._setupSocketListeners();
  }
  
  // Thiết lập các listeners cho socket
  _setupSocketListeners() {
    // Xử lý khi có người tham gia mới
    this.socket.on('participant-joined', ({ participant, participants }) => {
      console.log(`New participant joined: ${participant.name}`);
      this.participants = participants;
      
      if (this.onParticipantJoined) {
        this.onParticipantJoined(participant, participants);
      }
    });
    
    // Xử lý khi có người rời đi
    this.socket.on('participant-left', ({ participantId, participants }) => {
      console.log(`Participant left: ${participantId}`);
      this.participants = participants;
      
      // Xóa stream từ xa
      if (this.remoteStreams[participantId]) {
        delete this.remoteStreams[participantId];
      }
      
      if (this.onParticipantLeft) {
        this.onParticipantLeft(participantId, participants);
      }
    });
    
    // Nhận tin nhắn chat mới
    this.socket.on('new-message', (message) => {
      console.log(`New message from ${message.sender.name}: ${message.content}`);
      
      if (this.onChatMessageReceived) {
        this.onChatMessageReceived(message);
      }
    });
    
    // Xử lý khi có người giơ tay
    this.socket.on('hand-raised', ({ userId, participant }) => {
      console.log(`${participant.name} raised hand`);
      
      if (this.participants[userId]) {
        this.participants[userId].handRaised = true;
      }
      
      if (this.onHandRaised) {
        this.onHandRaised(userId, participant);
      }
    });
    
    // Xử lý khi có người hạ tay
    this.socket.on('hand-lowered', ({ userId, participant }) => {
      console.log(`${participant.name} lowered hand`);
      
      if (this.participants[userId]) {
        this.participants[userId].handRaised = false;
      }
      
      if (this.onHandLowered) {
        this.onHandLowered(userId, participant);
      }
    });
    
    // Xử lý khi có người chia sẻ màn hình
    this.socket.on('user-screen-sharing', ({ userId, isSharing }) => {
      console.log(`User ${userId} ${isSharing ? 'started' : 'stopped'} screen sharing`);
      
      if (this.participants[userId]) {
        this.participants[userId].isSharing = isSharing;
      }
      
      if (isSharing && this.onScreenSharingStarted) {
        this.onScreenSharingStarted(userId);
      } else if (!isSharing && this.onScreenSharingStopped) {
        this.onScreenSharingStopped(userId);
      }
    });
  }
  
  // Tạo phòng học mới
  async createRoom(roomName) {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: roomName,
          createdBy: this.userId
        })
      });
      
      const data = await response.json();
      this.currentRoom = data.roomId;
      return data.roomId;
    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  }
  
  // Lấy danh sách phòng học
  async getRooms() {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/rooms`);
      const rooms = await response.json();
      return rooms;
    } catch (error) {
      console.error('Error getting rooms:', error);
      throw error;
    }
  }
  
  // Tham gia phòng học
  async joinRoom(roomId, userName) {
    try {
      this.currentRoom = roomId;
      
      // Tạo WebRTC client
      const WebRTCClient = window.WebRTCClient;
      this.webrtcClient = new WebRTCClient(this.socket, this.userId, roomId, {
        iceServers: this.config.iceServers
      });
      
      // Khởi tạo local stream
      this.localStream = await this.webrtcClient.initLocalStream();
      
      // Thiết lập callback cho stream từ xa
      this.webrtcClient.onRemoteStream = (peerId, stream) => {
        console.log(`Received remote stream from ${peerId}`);
        this.remoteStreams[peerId] = stream;
        
        if (this.onRemoteStreamReceived) {
          this.onRemoteStreamReceived(peerId, stream);
        }
      };
      
      // Thiết lập callback cho peer ngắt kết nối
      this.webrtcClient.onPeerDisconnected = (peerId) => {
        console.log(`Peer ${peerId} disconnected`);
        
        // Xóa stream từ xa
        if (this.remoteStreams[peerId]) {
          delete this.remoteStreams[peerId];
        }
      };
      
      // Tham gia phòng
      await this.webrtcClient.joinRoom({
        id: this.userId,
        name: userName,
        role: this.isTeacher ? 'teacher' : 'student'
      });
      
      return this.localStream;
    } catch (error) {
      console.error('Error joining room:', error);
      throw error;
    }
  }
  
  // Rời khỏi phòng học
  leaveRoom() {
    if (this.webrtcClient) {
      this.webrtcClient.leaveRoom();
      this.webrtcClient = null;
    }
    
    this.currentRoom = null;
    this.participants = {};
    this.remoteStreams = {};
    this.localStream = null;
  }
  
  // Gửi tin nhắn chat
  sendChatMessage(message) {
    if (this.webrtcClient && this.currentRoom) {
      this.webrtcClient.sendChatMessage(message);
    }
  }
  
  // Giơ tay
  raiseHand() {
    if (this.webrtcClient && this.currentRoom) {
      this.webrtcClient.raiseHand();
    }
  }
  
  // Hạ tay
  lowerHand() {
    if (this.webrtcClient && this.currentRoom) {
      this.webrtcClient.lowerHand();
    }
  }
  
  // Bắt đầu chia sẻ màn hình
  async startScreenSharing() {
    if (this.webrtcClient && this.currentRoom) {
      return await this.webrtcClient.startScreenSharing();
    }
  }
  
  // Kết thúc chia sẻ màn hình
  stopScreenSharing() {
    if (this.webrtcClient && this.currentRoom) {
      this.webrtcClient.stopScreenSharing();
    }
  }
  
  // Tắt/bật micro
  toggleAudio(enabled) {
    if (this.webrtcClient) {
      this.webrtcClient.toggleAudio(enabled);
    }
  }
  
  // Tắt/bật camera
  toggleVideo(enabled) {
    if (this.webrtcClient) {
      this.webrtcClient.toggleVideo(enabled);
    }
  }
  
  // Tắt micro của học sinh (chỉ dành cho giáo viên)
  muteParticipant(participantId) {
    if (this.isTeacher && this.webrtcClient) {
      this.webrtcClient.muteParticipant(participantId);
    }
  }
  
  // Lấy danh sách người tham gia hiện tại
  getParticipants() {
    return this.participants;
  }
  
  // Lấy stream từ xa của một người tham gia
  getRemoteStream(participantId) {
    return this.remoteStreams[participantId];
  }
  
  // Lấy tất cả các stream từ xa
  getAllRemoteStreams() {
    return this.remoteStreams;
  }
}

// Export class
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RoomManager;
} else {
  window.RoomManager = RoomManager;
}
