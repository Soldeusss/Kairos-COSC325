import React, { useState, useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import "./chatbox_style.css";
import Settings from "./settings";
import History from "./history";

// 💡 Inner component handles routing logic
function ChatRoutes() {
  const [messages, setMessages] = useState([
    { sender: "ai", text: "Hello! How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);

  const [topic, setTopic] = useState("general");
  const [language, setLanguage] = useState("spanish");
  const [proficiency, setProficiency] = useState("beginner");
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);
  const chatWindowRef = useRef(null);
  const [streamingText, setStreamingText] = useState(null);

  const location = useLocation();

  // 🧭 Load conversation passed from History
  useEffect(() => {
    if (location.state?.conversation) {
      setMessages(location.state.conversation.messages);
    }
  }, [location.state]);

  // 🧩 Load backend settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("http://127.0.0.1:5000/api/user/settings/1");
        if (!res.ok) throw new Error(`HTTP error! ${res.status}`);
        const data = await res.json();
        setTopic(data.topic?.toLowerCase() || "general");
        setLanguage(data.language?.toLowerCase() || "spanish");
        setProficiency(data.proficiency?.toLowerCase() || "beginner");
      } catch (err) {
        console.error("❌ Failed to load settings:", err);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (isMuted && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
  }, [isMuted]);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  // Typewriter effect
  useEffect(() => {
    if (!streamingText) return;
    let index = 0;
    const intervalId = setInterval(() => {
      setMessages((prev) => {
        const i = prev.length - 1;
        if (prev[i]?.sender !== "ai") {
          clearInterval(intervalId);
          setStreamingText(null);
          return prev;
        }
        const newText = streamingText.substring(0, index + 1);
        const updated = { ...prev[i], text: newText };
        return [...prev.slice(0, i), updated];
      });

      index++;
      if (index > streamingText.length) {
        clearInterval(intervalId);
        setStreamingText(null);
        setLoading(false);
      }
    }, 30);
    return () => clearInterval(intervalId);
  }, [streamingText]);

  const playSpeech = async (text) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    try {
      const res = await fetch("http://127.0.0.1:5000/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
      audioRef.current = audio;
    } catch (err) {
      console.error("❌ TTS error:", err);
    }
  };

  const speak = async (text) => {
    if (isMuted) return;
    await playSpeech(text);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage = { sender: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: 1,
          text: input,
          conversationId: null,
          topic,
          language,
          proficiency,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      const aiText = data?.aiResponse?.text || "Error: No AI response.";

      speak(aiText);
      setMessages((prev) => [...prev, { sender: "ai", text: "" }]);
      setStreamingText(aiText);

      // Save to history
      const existing = JSON.parse(localStorage.getItem("chatHistory")) || [];
      const newChat = {
        title: input.substring(0, 20) || "New Chat",
        date: new Date(),
        messages: [...messages, userMessage, { sender: "ai", text: aiText }],
      };
      localStorage.setItem("chatHistory", JSON.stringify([...existing, newChat]));
    } catch (err) {
      console.error("❌ Chat API error:", err);
      setMessages((prev) => [
        ...prev,
        { sender: "ai", text: "Sorry, I couldn't reach the server." },
      ]);
      setLoading(false);
    }
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <button className="toggle-btn" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? "❮" : "❯"}
        </button>
        <h2>Main Menu</h2>
        <ul>
          <li><Link to="/">Chat</Link></li>
          <li><Link to="/history">History</Link></li>
          <li><Link to="/settings">Settings</Link></li>
        </ul>
      </aside>

      {/* Main content */}
      <div className="chat-container">
        <Routes>
          <Route
            path="/"
            element={
              <>
                <header className="chat-header">
                  <h1>Kairos Chat</h1>
                  <button
                    className="mute-button"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? "🔇" : "🔊"}
                  </button>
                </header>

                <main className="chat-window" ref={chatWindowRef}>
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`message ${
                        msg.sender === "ai" ? "ai-message" : "user-message"
                      }`}
                    >
                      <p>{msg.text}</p>
                      {msg.sender === "ai" && (
                        <button
                          onClick={() => playSpeech(msg.text)}
                          className="speak-button"
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
          <Route
            path="/settings"
            element={
              <Settings
                topic={topic}
                setTopic={setTopic}
                language={language}
                setLanguage={setLanguage}
                proficiency={proficiency}
                setProficiency={setProficiency}
              />
            }
          />
          <Route path="/history" element={<History />} />
        </Routes>
      </div>
    </div>
  );
}

// 🧭 Wrap routes in Router at the top level
export default function App() {
  return (
    <Router>
      <ChatRoutes />
    </Router>
  );
}