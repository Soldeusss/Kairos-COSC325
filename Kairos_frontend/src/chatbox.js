import React, { useState } from "react";
import "./chatbox_style.css";

function App() {
  const [messages, setMessages] = useState([
    { sender: "ai", text: "Hello! How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Send message to backend
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { sender: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:5000/api/chat/message',  {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: 1, // <-- change this if your backend uses another user id
          text: input,
          conversationId: null, // or a saved one from state
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      const aiText = data?.aiResponse?.text || "Error: No AI response.";

      setMessages((prev) => [
        ...prev,
        { sender: "ai", text: aiText },
      ]);
    } catch (err) {
      console.error("❌ Chat API error:", err);
      setMessages((prev) => [
        ...prev,
        { sender: "ai", text: "Sorry, I couldn't reach the server." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <div className="chat-container">
        <header className="chat-header">
          <h1>Kairos Chat</h1>
        </header>

        <main className="chat-window">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`message ${
                msg.sender === "ai" ? "ai-message" : "user-message"
              }`}
            >
              <p>{msg.text}</p>
            </div>
          ))}
          {loading && (
            <div className="message ai-message">
              <p>Thinking...</p>
            </div>
          )}
        </main>

        <footer className="chat-input-area">
          <form className="chat-input-form" onSubmit={sendMessage}>
            <input
              type="text"
              placeholder="Type your message..."
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" id="send-button" disabled={loading}>
              Send
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}

export default App;