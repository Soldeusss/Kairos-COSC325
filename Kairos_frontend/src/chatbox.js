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
  const [conversationId, setConversationId] = useState(null);
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
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const location = useLocation();

  // 🧭 Load conversation passed from History
  useEffect(() => {
    if (location.state?.conversation) {
      setMessages(location.state.conversation.messages);

      // Conversation history check:
      if (location.state.conversation.id) {
        setConversationId(location.state.conversation.id);
      }
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
        method: "POST",git 
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

  const handleMicClick = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    try {
      // 1. Force Mono Audio (Better for Speech-to-Text)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
            channelCount: 1, 
            echoCancellation: true, 
            noiseSuppression: true 
        } 
      });

      // 2. Check supported mimeTypes
      let mimeType = "audio/webm"; // Default
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4"; // Safari fallback
      }

      console.log(`🎤 Starting recording with mimeType: ${mimeType}`);
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setLoading(true);
        try {
          console.log("🛑 Recording stopped. Processing...");
          
          // Convert to WAV
          const wavBlob = await exportWAV(audioChunksRef.current, mimeType);
          console.log(`📤 Sending WAV file: ${(wavBlob.size / 1024).toFixed(2)} KB`);

          const formData = new FormData();
          formData.append("audio", wavBlob, "recording.wav");
          formData.append("language", language);

          const response = await fetch("http://127.0.0.1:5000/api/stt", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();
          
          if (response.ok && data.text) {
             setInput(data.text); 
          } else {
             console.error("STT Error:", data.error);
             // If it's a "No Match" error, it means the audio was received but not understood
             alert(data.error || "Voice not recognized.");
          }

        } catch (err) {
          console.error("Upload/Conversion failed", err);
        } finally {
          setLoading(false);
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

    } catch (err) {
      console.error("Microphone Error:", err);
      alert("Microphone access denied or not available.");
    }
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
          conversationId: conversationId, // <--- CHANGE 1: Use the state variable
          topic,
          language,
          proficiency,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      
      const data = await res.json(); // Parse JSON first
      
      // <--- CHANGE 2: Capture the ID from the backend!
      let currentConvoId = conversationId; 
      if (data.conversationId) {
          setConversationId(data.conversationId);
          currentConvoId = data.conversationId; // Update local var for saving below
      }

      const aiText = data?.aiResponse?.text || "Error: No AI response.";

      speak(aiText);
      setMessages((prev) => [...prev, { sender: "ai", text: "" }]);
      setStreamingText(aiText);

      // Save to history
      const existing = JSON.parse(localStorage.getItem("chatHistory")) || [];
      
      // <--- CHANGE 3: Save the ID into LocalStorage too
      const newChat = {
        id: currentConvoId, // Save the Backend ID here
        title: input.substring(0, 20) || "New Chat",
        date: new Date(),
        messages: [...messages, userMessage, { sender: "ai", text: aiText }],
      };
      
      // Logic to update existing chat in history vs adding new one could go here
      // For now, we just append to keep it simple as per your current code:
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
                    {/* Mic Button */}
                    <button
                      type="button"
                      className={`mic-button ${isRecording ? "recording" : ""}`}
                      onClick={handleMicClick}
                      disabled={loading}
                    >
                      {isRecording ? "🟥" : "🎤"}
                    </button>

                    <input
                      type="text"
                      placeholder={isRecording ? "Listening... (Click Red to Stop)" : "Type your message..."}
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

// -----------------------------------------------------------------------------
// 🛠️ UPDATED HELPER: More robust WAV conversion
// -----------------------------------------------------------------------------

const exportWAV = (audioChunks, mimeType) => {
  return new Promise((resolve, reject) => {
    const blob = new Blob(audioChunks, { type: mimeType });
    const fileReader = new FileReader();

    fileReader.onload = () => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Decode the compressed browser audio (WebM/MP4) into raw PCM
      audioContext.decodeAudioData(fileReader.result, (buffer) => {
        // Encode raw PCM into WAV
        const wavBuffer = audioBufferToWav(buffer);
        resolve(new Blob([wavBuffer], { type: "audio/wav" }));
      }, (e) => {
        console.error("Decoding error:", e);
        reject(e);
      });
    };
    fileReader.readAsArrayBuffer(blob);
  });
};

function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const channels = [];
  let i, sample, offset = 0, pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit
  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // Interleave channels
  for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

  while (pos < buffer.length) {
    for (i = 0; i < numOfChan; i++) {
      // Clamp the value to -1.0 to 1.0
      sample = Math.max(-1, Math.min(1, channels[i][pos])); 
      // Scale to 16-bit integer
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(44 + offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return out;

  function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}