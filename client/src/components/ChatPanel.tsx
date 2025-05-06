import { useEffect, useRef, useState } from "react";
import { Button, FormControl, InputGroup } from "react-bootstrap";
import { FaPaperPlane } from "react-icons/fa";
import { useRoom } from "../contexts/RoomContext";

const ChatPanel = () => {
  const { messages, sendMessage } = useRoom();
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<any>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (messageText.trim()) {
      sendMessage(messageText);
      setMessageText("");
    }
  };

  const handleKeyPress = (e: any) => {
    if (e.key === "Enter") {
      handleSendMessage();
    }
  };

  // Format timestamp
  const formatTime = (timestamp: any) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  };

  return (
    <div className="chat-container">
      <h4 className="mb-3">Chat</h4>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="text-center text-muted py-3">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg: any, index: number) => (
            <div
              key={index}
              className={`chat-message ${msg.isSelf ? "sent" : "received"}`}
            >
              <div className="chat-sender">
                {msg.isSelf ? "You" : msg.name}
                {msg.timestamp && (
                  <span className="ms-2 text-muted small">
                    {formatTime(msg.timestamp)}
                  </span>
                )}
              </div>
              <div className="chat-text">{msg.message}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <InputGroup>
        <FormControl
          placeholder="Type a message..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <Button
          variant="primary"
          onClick={handleSendMessage}
          disabled={!messageText.trim()}
        >
          <FaPaperPlane />
        </Button>
      </InputGroup>
    </div>
  );
};

export default ChatPanel;
