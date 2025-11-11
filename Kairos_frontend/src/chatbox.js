/** MAIN controller for website. Sidebar and main chat display is here. */
import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom"; // ← add this line
import "./chatbox_style.css";
import Settings from "./settings"; // ← import your new Settings component

function App() {
  const [messages, setMessages] = useState([
    { sender: "ai", text: "Hello! How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const speak = (text) => {
    // Stop any speech that is currently playing
    window.speechSynthesis.cancel();

    // Create the new "utterance" (the thing to be spoken)
    const utterance = new SpeechSynthesisUtterance(text);

    // will add code here later to select a Spanish/French/German voice

    // Tell the browser to speak
    window.speechSynthesis.speak(utterance);
  };
  // same sendMessage function here …
 const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { sender: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("http://127.0.0.1:5000/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: 1,
          text: input,
          conversationId: null,
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const data = await response.json();
      const aiText = data?.aiResponse?.text || "Error: No AI response.";

      setMessages((prev) => [...prev, { sender: "ai", text: aiText }]);
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
    <Router> {/* ← wraps everything */}
      <div className="app-layout">
        {/* Sidebar */}
        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <button className="toggle-btn" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? "❮" : "❯"}
          </button>
          <h2>Main Menu</h2>
          <ul>
            {/* Use Links instead of <li> click handlers */}
            <li><Link to="/">Chat</Link></li>
            <li><Link to="/history">History</Link></li>
            <li><Link to="/settings">Settings</Link></li>
          </ul>
        </aside>

        {/* Chat section (main area changes based on route) */}
        <div className="chat-container">
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <header className="chat-header"><h1>Kairos Chat</h1></header>
                  <main className="chat-window">
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`message ${
                          msg.sender === "ai" ? "ai-message" : "user-message"
                        }`}
                      >
                        <p>{msg.text}</p>
						{msg.sender === 'ai' && (
						  <button 
							onClick={() => speak(msg.text)} 
							className="speak-button"
							aria-label="Speak message"
							>
							  🔊
							</button>
									)}
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
                </>
              }
            />

            {/* NEW: when URL is /settings, show the Settings component */}
            <Route path="/settings" element={<Settings />} />

            {/* You can add more pages later, like history, etc. */}
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;