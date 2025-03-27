# Cài đặt coturn trên Ubuntu server

sudo apt-get update
sudo apt-get install coturn -y

# Cấu hình coturn

sudo nano /etc/turnserver.conf

# Thêm cấu hình sau vào file

# ----------------------------

# Cấu hình cơ bản

listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=mySecretAuthKey
realm=myrealmname.com

# Cấu hình mạng

external-ip=EXTERNAL_IP_ADDRESS
no-udp
no-tcp

# Cấu hình bảo mật

min-port=49152
max-port=65535
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=172.16.0.0-172.31.255.255

# Cấu hình logging

no-cli
no-stderr-log
log-file=/var/log/coturn.log
simple-log

# ----------------------------

# Bật coturn service

sudo systemctl enable coturn
sudo systemctl start coturn

# Kiểm tra trạng thái

sudo systemctl status coturn

# Tạo file cấu hình cho ứng dụng WebRTC

cat > turnConfig.js << EOL
const turnConfig = {
iceServers: [
{
urls: [
'stun:stun.l.google.com:19302',
'stun:stun1.l.google.com:19302'
]
},
{
urls: [
'turn:YOUR_SERVER_IP:3478?transport=udp',
'turn:YOUR_SERVER_IP:3478?transport=tcp',
'turns:YOUR_SERVER_IP:5349?transport=tcp'
],
username: 'webrtc',
credential: 'mySecretAuthKey'
}
],
iceCandidatePoolSize: 10
};

export default turnConfig;
EOL

# Script để tạo temporary TURN credentials theo thời gian (cho bảo mật tốt hơn)

cat > generate_turn_credentials.js << EOL
const crypto = require('crypto');

function generateTurnCredentials(username, secretKey, ttl = 86400) {
// Thời gian hết hạn
const expiry = Math.floor(Date.now() / 1000) + ttl;

// Username dựa trên thời gian hết hạn
const turnUsername = \`\${expiry}:\${username}\`;

// Tạo HMAC dựa trên username và secret key
const hmac = crypto.createHmac('sha1', secretKey);
hmac.update(turnUsername);
const credential = hmac.digest('base64');

return {
username: turnUsername,
credential: credential,
urls: [
'turn:YOUR_SERVER_IP:3478?transport=udp',
'turn:YOUR_SERVER_IP:3478?transport=tcp',
'turns:YOUR_SERVER_IP:5349?transport=tcp'
]
};
}

// Sử dụng function
const turnCredentials = generateTurnCredentials('user123', 'mySecretAuthKey');
console.log(turnCredentials);
EOL

# Hướng dẫn cấu hình tường lửa

echo "# Cấu hình tường lửa để cho phép TURN server
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 49152:65535/udp
sudo ufw allow 49152:65535/tcp
"

# Kiểm tra hoạt động của máy chủ TURN

echo "# Sử dụng công cụ kiểm tra TURN server
npm install -g webrtc-utilities

# Kiểm tra kết nối tới TURN server

turn-tester -s YOUR_SERVER_IP:3478 -u webrtc -p mySecretAuthKey
"
