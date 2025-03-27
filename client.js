// webrtc-client.js
class WebRTCClient {
  constructor(socketInstance, userId, roomId, config = {}) {
    this.socket = socketInstance;
    this.userId = userId;
    this.roomId = roomId;
    this.peers = {};
    this.localStream = null;
    this.screenStream = null;
    this.isScreenSharing = false;
    
    // Cấu hình ICE servers mặc định
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        ...config.iceServers || []
      ],
      iceCandidatePoolSize: 10,
    };
    
    // Gắn các event handlers cho tín hiệu WebRTC
    this._setupSocketListeners();
  }
  
  // Khởi tạo và lấy luồng media local
  async initLocalStream(options = { video: true, audio: true }) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(options);
      return this.localStream;
    } catch (error) {
      console.error('Error getting local stream:', error);
      throw error;
    }
  }
  
  // Thiết lập các hàm xử lý sự kiện socket
  _setupSocketListeners() {
    // Nhận offer từ peer khác
    this.socket.on('offer', async ({ from, sdp }) => {
      console.log(`Received offer from ${from}`);
      await this._handleOffer(from, sdp);
    });
    
    // Nhận answer từ peer khác
    this.socket.on('answer', async ({ from, sdp }) => {
      console.log(`Received answer from ${from}`);
      await this._handleAnswer(from, sdp);
    });
    
    // Nhận ICE candidate từ peer khác
    this.socket.on('ice-candidate', async ({ from, candidate }) => {
      console.log(`Received ICE candidate from ${from}`);
      await this._handleICECandidate(from, candidate);
    });
    
    // Xử lý khi có người tham gia mới
    this.socket.on('participant-joined', async ({ participant, participants }) => {
      console.log(`New participant joined: ${participant.name}`);
      
      // Tạo kết nối với người tham gia mới nếu không phải chính mình
      if (participant.socketId !== this.socket.id) {
        await this._createPeerConnection(participant.socketId);
      }
    });
    
    // Xử lý khi có người rời đi
    this.socket.on('participant-left', ({ participantId, participants }) => {
      console.log(`Participant left: ${participantId}`);
      
      // Đóng kết nối với người rời đi
      this._closePeerConnection(participantId);
    });
    
    // Xử lý yêu cầu tắt mic
    this.socket.on('request-mute', () => {
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }
    });
  }
  
  // Tham gia phòng và kết nối với những người hiện có
  async joinRoom(user) {
    this.socket.emit('join-room', { roomId: this.roomId, user });
  }
  
  // Tạo kết nối P2P với một peer
  async _createPeerConnection(peerId) {
    if (this.peers[peerId]) {
      console.warn(`Connection with ${peerId} already exists.`);
      return;
    }
    
    // Tạo đối tượng RTCPeerConnection
    const peerConnection = new RTCPeerConnection(this.rtcConfig);
    this.peers[peerId] = peerConnection;
    
    // Thêm local stream vào peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream);
      });
    }
    
    // Xử lý ICE candidate được tạo
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          targetId: peerId,
          candidate: event.candidate
        });
      }
    };
    
    // Xử lý track mới nhận được từ peer
    peerConnection.ontrack = (event) => {
      // Gọi callback được truyền vào để xử lý luồng media từ xa
      if (this.onRemoteStream) {
        this.onRemoteStream(peerId, event.streams[0]);
      }
    };
    
    // Xử lý thay đổi trạng thái ICE
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${peerId}: ${peerConnection.iceConnectionState}`);
      
      // Xử lý khi kết nối bị ngắt
      if (peerConnection.iceConnectionState === 'disconnected' || 
          peerConnection.iceConnectionState === 'failed' ||
          peerConnection.iceConnectionState === 'closed') {
        this._closePeerConnection(peerId);
      }
    };
    
    // Tạo và gửi offer nếu là bên khởi tạo kết nối
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerConnection.setLocalDescription(offer);
      
      this.socket.emit('offer', {
        targetId: peerId,
        sdp: peerConnection.localDescription
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
    
    return peerConnection;
  }
  
  // Xử lý khi nhận được offer từ peer khác
  async _handleOffer(peerId, sdp) {
    try {
      let peerConnection = this.peers[peerId];
      
      // Tạo kết nối mới nếu chưa có
      if (!peerConnection) {
        peerConnection = new RTCPeerConnection(this.rtcConfig);
        this.peers[peerId] = peerConnection;
        
        // Thêm local stream vào peer connection
        if (this.localStream) {
          this.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, this.localStream);
          });
        }
        
        // Xử lý ICE candidate được tạo
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            this.socket.emit('ice-candidate', {
              targetId: peerId,
              candidate: event.candidate
            });
          }
        };
        
        // Xử lý track mới nhận được từ peer
        peerConnection.ontrack = (event) => {
          if (this.onRemoteStream) {
            this.onRemoteStream(peerId, event.streams[0]);
          }
        };
        
        // Xử lý thay đổi trạng thái ICE
        peerConnection.oniceconnectionstatechange = () => {
          console.log(`ICE connection state with ${peerId}: ${peerConnection.iceConnectionState}`);
          
          if (peerConnection.iceConnectionState === 'disconnected' || 
              peerConnection.iceConnectionState === 'failed' ||
              peerConnection.iceConnectionState === 'closed') {
            this._closePeerConnection(peerId);
          }
        };
      }
      
      // Thiết lập remote description từ offer
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      
      // Tạo answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      // Gửi answer về
      this.socket.emit('answer', {
        targetId: peerId,
        sdp: peerConnection.localDescription
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }
  
  // Xử lý khi nhận được answer từ peer khác
  async _handleAnswer(peerId, sdp) {
    try {
      const peerConnection = this.peers[peerId];
      
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      } else {
        console.warn(`No connection found for peer: ${peerId}`);
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }
  
  // Xử lý khi nhận được ICE candidate từ peer khác
  async _handleICECandidate(peerId, candidate) {
    try {
      const peerConnection = this.peers[peerId];
      
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        console.warn(`No connection found for peer: ${peerId}`);
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }
  
  // Đóng kết nối P2P với một peer
  _closePeerConnection(peerId) {
    const peerConnection = this.peers[peerId];
    
    if (peerConnection) {
      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.oniceconnectionstatechange = null;
      
      // Đóng connection
      peerConnection.close();
      delete this.peers[peerId];
      
      // Gọi callback xử lý khi peer ngắt kết nối
      if (this.onPeerDisconnected) {
        this.onPeerDisconnected(peerId);
      }
    }
  }
  
  // Bắt đầu chia sẻ màn hình
  async startScreenSharing() {
    try {
      // Lấy stream từ màn hình
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always'
        },
        audio: false
      });
      
      // Thay thế video track hiện tại bằng screen track
      const videoTrack = this.screenStream.getVideoTracks()[0];
      
      // Cập nhật tất cả các peer connections
      Object.values(this.peers).forEach(peerConnection => {
        const senders = peerConnection.getSenders();
        const videoSender = senders.find(sender => 
          sender.track && sender.track.kind === 'video'
        );
        
        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
        }
      });
      
      // Lắng nghe sự kiện kết thúc chia sẻ màn hình
      videoTrack.addEventListener('ended', () => {
        this.stopScreenSharing();
      });
      
      this.isScreenSharing = true;
      
      // Thông báo bắt đầu chia sẻ màn hình
      this.socket.emit('start-screen-sharing', { roomId: this.roomId });
      
      return this.screenStream;
    } catch (error) {
      console.error('Error starting screen sharing:', error);
      throw error;
    }
  }
  
  // Kết thúc chia sẻ màn hình
  async stopScreenSharing() {
    if (this.screenStream) {
      // Dừng tất cả các track
      this.screenStream.getTracks().forEach(track => track.stop());
      
      // Khôi phục video track từ camera
      if (this.localStream) {
        const videoTrack = this.localStream.getVideoTracks()[0];
        
        if (videoTrack) {
          Object.values(this.peers).forEach(peerConnection => {
            const senders = peerConnection.getSenders();
            const videoSender = senders.find(sender => 
              sender.track && sender.track.kind === 'video'
            );
            
            if (videoSender) {
              videoSender.replaceTrack(videoTrack);
            }
          });
        }
      }
      
      this.screenStream = null;
      this.isScreenSharing = false;
      
      // Thông báo kết thúc chia sẻ màn hình
      this.socket.emit('stop-screen-sharing', { roomId: this.roomId });
    }
  }
  
  // Tắt/bật micro
  toggleAudio(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }
  
  // Tắt/bật camera
  toggleVideo(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }
  
  // Gửi tin nhắn chat
  sendChatMessage(message) {
    this.socket.emit('send-message', {
      roomId: this.roomId,
      message
    });
  }
  
  // Giơ tay
  raiseHand() {
    this.socket.emit('raise-hand', { roomId: this.roomId });
  }
  
  // Hạ tay
  lowerHand() {
    this.socket.emit('lower-hand', { roomId: this.roomId });
  }
  
  // Tắt micro của học sinh (chỉ dành cho giáo viên)
  muteParticipant(participantId) {
    this.socket.emit('mute-participant', {
      roomId: this.roomId,
      participantId
    });
  }
  
  // Rời khỏi phòng học và đóng tất cả kết nối
  leaveRoom() {
    // Đóng tất cả các kết nối
    Object.keys(this.peers).forEach(peerId => {
      this._closePeerConnection(peerId);
    });
    
    // Dừng local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    // Dừng screen sharing
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
      this.isScreenSharing = false;
    }
    
    // Ngắt kết nối socket
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }
}

// Export class
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebRTCClient;
} else {
  window.WebRTCClient = WebRTCClient;
}
