// media-quality-controller.js
class MediaQualityController {
  constructor(webrtcClient) {
    this.webrtcClient = webrtcClient;
    this.qualityLevels = {
      high: {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        bitrate: 2500000, // 2.5 Mbps
      },
      medium: {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 25 },
        },
        bitrate: 1000000, // 1 Mbps
      },
      low: {
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 20 },
        },
        bitrate: 400000, // 400 Kbps
      },
      minimal: {
        video: {
          width: { ideal: 160 },
          height: { ideal: 120 },
          frameRate: { ideal: 15 },
        },
        bitrate: 150000, // 150 Kbps
      },
    };

    this.currentQuality = "medium";
    this.participantCount = 1;
    this.bandwidthEstimates = {}; // Lưu trữ ước tính băng thông cho từng peer
    this.networkStats = {
      avgRtt: 0,
      avgPacketLoss: 0,
      avgBandwidth: 0,
    };

    // Các ngưỡng quyết định
    this.thresholds = {
      rtt: {
        good: 150, // ms
        acceptable: 300, // ms
      },
      packetLoss: {
        good: 0.02, // 2%
        acceptable: 0.05, // 5%
      },
      bandwidth: {
        high: 2500000, // 2.5 Mbps
        medium: 1000000, // 1 Mbps
        low: 400000, // 400 Kbps
        minimal: 150000, // 150 Kbps
      },
    };

    // Bắt đầu giám sát và điều chỉnh
    this.monitoringInterval = null;
  }

  // Bắt đầu giám sát và điều chỉnh chất lượng
  startMonitoring(intervalMs = 3000) {
    this.monitoringInterval = setInterval(() => {
      this._collectStats().then(() => {
        this._adjustQuality();
      });
    }, intervalMs);
  }

  // Dừng giám sát
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  // Thu thập thống kê từ các kết nối P2P
  async _collectStats() {
    const peerConnections = this.webrtcClient.peers;
    let totalRtt = 0;
    let totalPacketLoss = 0;
    let totalBandwidth = 0;
    let peerCount = 0;

    await Promise.all(
      Object.entries(peerConnections).map(async ([peerId, pc]) => {
        try {
          const stats = await pc.getStats();
          let rtt = 0;
          let packetLoss = 0;
          let availableBandwidth = 0;

          stats.forEach((report) => {
            // Lấy thông tin RTT từ các thống kê ICE candidate pair
            if (
              report.type === "candidate-pair" &&
              report.state === "succeeded"
            ) {
              if (report.currentRoundTripTime) {
                rtt = report.currentRoundTripTime * 1000; // Convert to ms
              }
            }

            // Lấy thông tin mất gói từ các thống kê outbound-rtp
            if (report.type === "outbound-rtp" && report.kind === "video") {
              if (report.packetsSent && report.packetsLost) {
                packetLoss =
                  report.packetsLost /
                  (report.packetsSent + report.packetsLost);
              }

              // Lấy thông tin băng thông
              if (
                report.bytesSent &&
                report.timestamp &&
                this.lastStats &&
                this.lastStats[peerId]
              ) {
                const lastReport = this.lastStats[peerId];
                const timeDiff =
                  (report.timestamp - lastReport.timestamp) / 1000; // seconds
                if (timeDiff > 0) {
                  const bytesDiff = report.bytesSent - lastReport.bytesSent;
                  availableBandwidth = (bytesDiff * 8) / timeDiff; // bits per second
                }
              }

              // Lưu thông tin cho lần sau
              if (!this.lastStats) this.lastStats = {};
              this.lastStats[peerId] = {
                timestamp: report.timestamp,
                bytesSent: report.bytesSent,
              };
            }
          });

          // Cập nhật thông tin cho peer
          if (rtt > 0) {
            this.bandwidthEstimates[peerId] = {
              rtt,
              packetLoss,
              availableBandwidth,
            };

            totalRtt += rtt;
            totalPacketLoss += packetLoss;
            totalBandwidth += availableBandwidth;
            peerCount++;
          }
        } catch (error) {
          console.error(`Error collecting stats for peer ${peerId}:`, error);
        }
      }),
    );

    // Tính trung bình
    if (peerCount > 0) {
      this.networkStats = {
        avgRtt: totalRtt / peerCount,
        avgPacketLoss: totalPacketLoss / peerCount,
        avgBandwidth: totalBandwidth / peerCount,
      };

      console.log("Network stats:", this.networkStats);
    }

    // Cập nhật số lượng người tham gia
    this.participantCount = Object.keys(peerConnections).length + 1; // +1 for self
  }

  // Điều chỉnh chất lượng dựa trên thông số mạng và số lượng người tham gia
  _adjustQuality() {
    const { avgRtt, avgPacketLoss, avgBandwidth } = this.networkStats;
    let newQuality = "medium"; // Mặc định

    // Chọn chất lượng dựa trên điều kiện mạng
    if (
      avgRtt < this.thresholds.rtt.good &&
      avgPacketLoss < this.thresholds.packetLoss.good &&
      avgBandwidth > this.thresholds.bandwidth.high
    ) {
      newQuality = "high";
    } else if (
      avgRtt < this.thresholds.rtt.acceptable &&
      avgPacketLoss < this.thresholds.packetLoss.acceptable &&
      avgBandwidth > this.thresholds.bandwidth.medium
    ) {
      newQuality = "medium";
    } else if (avgBandwidth > this.thresholds.bandwidth.low) {
      newQuality = "low";
    } else {
      newQuality = "minimal";
    }

    // Điều chỉnh chất lượng dựa trên số lượng người tham gia
    if (this.participantCount > 8) {
      // Giới hạn chất lượng tối đa là 'low' nếu có nhiều người tham gia
      if (newQuality === "high" || newQuality === "medium") {
        newQuality = "low";
      }
    } else if (this.participantCount > 4) {
      // Giới hạn chất lượng tối đa là 'medium' nếu có khá nhiều người tham gia
      if (newQuality === "high") {
        newQuality = "medium";
      }
    }

    // Áp dụng chất lượng mới nếu thay đổi
    if (newQuality !== this.currentQuality) {
      console.log(
        `Adjusting quality from ${this.currentQuality} to ${newQuality}`,
      );
      this.currentQuality = newQuality;
      this._applyQualitySettings();
    }
  }

  // Áp dụng cài đặt chất lượng
  async _applyQualitySettings() {
    if (!this.webrtcClient.localStream) return;

    const qualitySetting = this.qualityLevels[this.currentQuality];

    try {
      // Áp dụng cài đặt cho video track
      const videoTrack = this.webrtcClient.localStream.getVideoTracks()[0];
      if (videoTrack) {
        const constraints = { advanced: [qualitySetting.video] };
        await videoTrack.applyConstraints(constraints);

        // Cấu hình bitrate trên tất cả các peer connections
        Object.values(this.webrtcClient.peers).forEach((pc) => {
          try {
            const sender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === "video");
            if (sender) {
              const params = sender.getParameters();
              if (!params.encodings) {
                params.encodings = [{}];
              }

              params.encodings.forEach((encoding) => {
                encoding.maxBitrate = qualitySetting.bitrate;
              });

              sender.setParameters(params);
            }
          } catch (e) {
            console.warn("Failed to set encoding parameters:", e);
          }
        });
      }
    } catch (error) {
      console.error("Error applying quality settings:", error);
    }
  }

  // Đặt chất lượng thủ công
  setQuality(quality) {
    if (this.qualityLevels[quality]) {
      this.currentQuality = quality;
      this._applyQualitySettings();
    } else {
      console.error(`Invalid quality level: ${quality}`);
    }
  }

  // Lấy thông tin chất lượng hiện tại
  getCurrentQuality() {
    return {
      level: this.currentQuality,
      settings: this.qualityLevels[this.currentQuality],
    };
  }

  // Lấy thống kê mạng hiện tại
  getNetworkStats() {
    return this.networkStats;
  }
}

// Export class
if (typeof module !== "undefined" && module.exports) {
  module.exports = MediaQualityController;
} else {
  window.MediaQualityController = MediaQualityController;
}
