import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom"; // ← add this line
import "./chatbox_style.css";
import Settings from "./settings"; 

function App() {
  const [messages, setMessages] = useState([
    { sender: "ai", text: "Hello! How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);

  // 🧠 Store user settings dynamically from backend
  const [topic, setTopic] = useState("general");
  const [language, setLanguage] = useState("spanish");
  const [proficiency, setProficiency] = useState("beginner");
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);// mute functions
  const chatWindowRef = useRef(null);
  const [streamingText, setStreamingText] = useState(null); // for type writer affect
  // 🧩 Load saved user settings on page load
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("http://127.0.0.1:5000/api/user/settings/1");
        if (!res.ok) throw new Error(`HTTP error! ${res.status}`);
        const data = await res.json();

        setTopic(data.topic?.toLowerCase() || "general");
        setLanguage(data.language?.toLowerCase() || "spanish");
        setProficiency(data.proficiency?.toLowerCase() || "beginner");

        console.log("✅ Loaded settings:", data);
      } catch (err) {
        console.error("❌ Failed to load settings:", err);
      }
    };

    loadSettings();
  }, []);

useEffect(() => {
    if (isMuted && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  }, [isMuted]);
  // useEffect scrolls the chat window to the bottom when new messages are added
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);
  
  // This useEffect handles the typewriter effect
  useEffect(() => {
    if (!streamingText) return; // Do nothing if we're not streaming

    let index = 0;
    const intervalId = setInterval(() => {
      setMessages(prevMessages => {
        // Get the last message
        const lastMsgIndex = prevMessages.length - 1;
        
        // This should always be true, but it's a good safety check
        if (prevMessages[lastMsgIndex]?.sender !== 'ai') {
          clearInterval(intervalId);
          setStreamingText(null);
          return prevMessages;
        };

        // Get the (new) text for the last message
        const newText = streamingText.substring(0, index + 1);
        const updatedLastMsg = { ...prevMessages[lastMsgIndex], text: newText };

        // Create the new, updated messages array
        const newMessages = [
          ...prevMessages.slice(0, lastMsgIndex),
          updatedLastMsg
        ];
        
        return newMessages;
      });

      index++;

      // Stop when we've typed out the whole message
      if (index > streamingText.length) {
        clearInterval(intervalId);
        setStreamingText(null);
        setLoading(false); // <-- Stop "Thinking..." message *after* typing is done
      }
    }, 30); // 30ms per character

    // Cleanup function in case the component unmounts
    return () => clearInterval(intervalId);

  }, [streamingText]); // This effect runs every time 'streamingText' changes
  

  // "master" function that ALWAYS plays (for the 🔊 button)
  // ASYNC function that calls our backend

  const playSpeech = async (text) => {
    
    // stops track if one is already playing 
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = ''; // Stop it from buffering
    }
    try {
      
      const response = await fetch("http://127.0.0.1:5000/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          language: language
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      
      const audio = new Audio(audioUrl);
      audio.play();

      
      audioRef.current = audio;
      

    } catch (err) {
      console.error("❌ Failed to play audio:", err);
    }
  };

  
 const speak = async (text) => { // <-- 1. Add 'async'
    if (isMuted) return; // If muted, do nothing.
    await playSpeech(text); // <-- 2. Add 'await'
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
          topic: topic, // dynamically pulled from backend settings
          language: language,
          proficiency: proficiency,
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const data = await response.json();
      const aiText = data?.aiResponse?.text || "Error: No AI response.";
      
      //starts the audio
      speak(aiText);
      setMessages((prev) => [...prev, { sender: "ai", text: "" }]);

      setStreamingText(aiText); 

    } catch (err) {
      console.error("❌ Chat API error:", err);
      setMessages((prev) => [
        ...prev,
        { sender: "ai", text: "Sorry, I couldn't reach the server." },
      ]);
      setLoading(false); // Set loading false *if* there's an error
    }
  }
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
                  <header className="chat-header">
					<h1>Kairos Chat</h1>
					<button 
					  className="mute-button"
				      onClick={() => setIsMuted(!isMuted)}
					  aria-label={isMuted ? "Unmute" : "Mute"}
					>					 
					 {isMuted ? '🔇' : '🔊'}
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
                        {msg.sender === 'ai' && (
                          <button 
                            onClick={() => playSpeech(msg.text)} 
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

            {/* You can add more pages later, like history, etc. */}
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;