import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import "./chatbox_style.css";
import Settings from "./settings";
import History from "./history";

// === MDBootstrap Imports ===
import {
  MDBContainer,
  MDBRow,
  MDBCol,
  MDBCard,
  MDBCardBody,
  MDBBtn,
  MDBIcon,
  MDBInputGroup,
  MDBTypography,
  MDBSpinner
} from 'mdb-react-ui-kit';

function ChatRoutes() {
  const [messages, setMessages] = useState([
    { sender: "ai", text: "Hello! I am Kairos. How can I help you learn today?" },
  ]);
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);

  const [topic, setTopic] = useState("general");
  const [language, setLanguage] = useState("spanish");
  const [proficiency, setProficiency] = useState("beginner");
  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // === 1. RESTORED: Streaming Text State ===
  const [streamingText, setStreamingText] = useState(null);

  const audioRef = useRef(null);
  const chatWindowRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const location = useLocation();

  // 🧭 Load conversation passed from History
  useEffect(() => {
    if (location.state?.conversation) {
      setMessages(location.state.conversation.messages);
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

  // Mute Logic
  useEffect(() => {
    if (isMuted && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
  }, [isMuted]);

  // Auto-scroll
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  // === 2. RESTORED: Typewriter Effect Logic ===
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
        
        // Save to history (Moved here so it saves the FULL message)
        const existing = JSON.parse(localStorage.getItem("chatHistory")) || [];
        const aiMessage = { sender: "ai", text: streamingText }; 
        const userMessage = messages[messages.length - 1];
        const newChat = {
          id: conversationId, 
          title: userMessage?.text?.substring(0, 20) || "New Chat",
          date: new Date(),
          messages: [...messages, aiMessage], 
        };
        localStorage.setItem("chatHistory", JSON.stringify([...existing, newChat]));
      }
    }, 30); // Speed: 30ms per character
    return () => clearInterval(intervalId);
  }, [streamingText]); 

  // TTS Logic
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

  // Mic Logic (Path 1)
  const handleMicClick = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } 
      });

      let mimeType = "audio/webm"; 
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4"; 
      }

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
          const wavBlob = await exportWAV(audioChunksRef.current, mimeType);
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
             alert(data.error || "Voice not recognized.");
          }
        } catch (err) {
          console.error("Upload failed", err);
        } finally {
          setLoading(false);
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

    } catch (err) {
      console.error("Microphone Error:", err);
      alert("Microphone access denied.");
    }
  };

  const sendMessage = async (e) => {
    if (e) e.preventDefault();
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
          conversationId: conversationId, 
          topic,
          language,
          proficiency,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json(); 
      if (data.conversationId) setConversationId(data.conversationId);

      const aiText = data?.aiResponse?.text || "Error: No AI response.";
      
      // ===  RESTORED: Trigger Typewriter instead of showing text immediately ===
      speak(aiText);
      
      // Add a BLANK message for AI
      setMessages((prev) => [...prev, { sender: "ai", text: "" }]);
      
      // Start the typewriter effect
      setStreamingText(aiText);
      // ==========================================================================
      
    } catch (err) {
      console.error("❌ Chat API error:", err);
      setMessages((prev) => [
        ...prev,
        { sender: "ai", text: "Sorry, I couldn't reach the server." },
      ]);
      setLoading(false); // Only stop loading here on error. Otherwise typewriter handles it.
    } 
  };

  // === MDBootstrap "Modern Dark" UI ===
  return (
    <MDBContainer fluid className="d-flex vh-100 p-0 overflow-hidden">
      <MDBRow className="w-100 m-0 flex-nowrap h-100">
        
        {/* Sidebar */}
        <MDBCol md="3" lg="2" 
          className="d-none d-md-flex flex-column text-white p-3 border-end border-secondary"
          style={{ backgroundColor: "#151515" }} 
        >
          <div className="d-flex align-items-center mb-4 text-primary">
            <MDBIcon fas icon="robot" className="me-2 fa-2x" />
            <span className="fs-4 fw-bold">Kairos</span>
          </div>
          
          <div className="d-grid gap-2">
            <Link to="/" className="btn btn-outline-light text-start border-0">
              <MDBIcon fas icon="comments" className="me-2" /> Chat
            </Link>
            <Link to="/history" className="btn btn-outline-light text-start border-0">
              <MDBIcon fas icon="history" className="me-2" /> History
            </Link>
            <Link to="/settings" className="btn btn-outline-light text-start border-0">
              <MDBIcon fas icon="cog" className="me-2" /> Settings
            </Link>
          </div>
          
          <div className="mt-auto pt-3 border-top border-secondary">
            <small className="text-white-50">User Profile</small>
            <div className="fw-bold">Student</div>
          </div>
        </MDBCol>

        {/* Main Content */}
        <MDBCol md="9" lg="10" className="d-flex flex-column p-0 position-relative">
          <Routes>
            <Route
              path="/"
              element={
                <>
                  {/* Header */}
                  <div 
                    className="p-3 shadow-4-strong d-flex justify-content-between align-items-center z-index-1 border-bottom border-secondary"
                    style={{ backgroundColor: "#1f1f1f" }}
                  >
                    <MDBTypography tag="h5" className="mb-0 text-white">
                      <MDBIcon fas icon="graduation-cap" className="me-2 text-primary" />
                      Kairos Chat
                    </MDBTypography>
                    <MDBBtn 
                      color={isMuted ? "danger" : "light"} 
                      outline 
                      floating 
                      size="sm" 
                      onClick={() => setIsMuted(!isMuted)}
                    >
                      <MDBIcon fas icon={isMuted ? "volume-mute" : "volume-up"} />
                    </MDBBtn>
                  </div>

                  {/* Chat Area */}
                  <div 
                    className="flex-grow-1 p-4 overflow-auto" 
                    ref={chatWindowRef}
                    style={{ backgroundColor: "#252525" }} 
                  >
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`d-flex mb-4 ${
                          msg.sender === "user" ? "justify-content-end" : "justify-content-start"
                        }`}
                      >
                        {msg.sender === "ai" && (
                          <div className="d-flex flex-column align-items-center me-2">
                             <MDBIcon fas icon="robot" className="text-primary fa-lg mt-2" />
                          </div>
                        )}

                        <MDBCard 
                          className={`shadow-2-strong ${
                            msg.sender === "user" 
                              ? "bg-primary text-white" 
                              : "text-white"
                          }`}
                          style={{ 
                            borderRadius: "15px", 
                            maxWidth: "75%",
                            backgroundColor: msg.sender === "ai" ? "#333333" : "" 
                          }}
                        >
                          <MDBCardBody className="p-3">
                            <p className="mb-0" style={{whiteSpace: "pre-wrap"}}>{msg.text}</p>
                            {msg.sender === "ai" && (
                              <div className="text-end mt-2">
                                <MDBIcon 
                                  fas icon="volume-up" 
                                  className="text-white-50 pointer-cursor hover-white"
                                  style={{cursor: 'pointer'}}
                                  onClick={() => playSpeech(msg.text)}
                                />
                              </div>
                            )}
                          </MDBCardBody>
                        </MDBCard>
                        
                        {msg.sender === "user" && (
                           <div className="d-flex flex-column align-items-center ms-2">
                             <MDBIcon fas icon="user" className="text-white-50 fa-lg mt-2" />
                           </div>
                        )}
                      </div>
                    ))}
                    
                    {loading && (
                       <div className="d-flex justify-content-start mb-4">
                          <div className="d-flex align-items-center p-3 rounded-5 shadow-1-strong text-white-50" style={{ backgroundColor: "#333333" }}>
                            <MDBSpinner size="sm" role="status" tag="span" className="me-2 text-primary" />
                            <span>Thinking...</span>
                          </div>
                       </div>
                    )}
                  </div>

                  {/* Input Area */}
                  <div 
                    className="p-3 border-top border-secondary"
                    style={{ backgroundColor: "#1f1f1f" }}
                  >
                    <MDBInputGroup className="mb-0">
                      <MDBBtn 
                        color={isRecording ? "danger" : "light"}
                        className="shadow-0"
                        outline
                        onClick={handleMicClick}
                      >
                         <MDBIcon fas icon={isRecording ? "stop" : "microphone"} className={isRecording ? "fa-beat-fade" : ""} />
                      </MDBBtn>
                      
                      <input
                        className="form-control text-white border-secondary"
                        placeholder={isRecording ? "Listening..." : "Type a message..."}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage(e)}
                        disabled={loading || isRecording}
                        style={{ backgroundColor: "#333333" }} 
                      />
                      
                      <MDBBtn color="primary" onClick={sendMessage} disabled={loading || isRecording}>
                        <MDBIcon fas icon="paper-plane" />
                      </MDBBtn>
                    </MDBInputGroup>
                  </div>
                </>
              }
            />
            <Route path="/settings" element={<Settings topic={topic} setTopic={setTopic} language={language} setLanguage={setLanguage} proficiency={proficiency} setProficiency={setProficiency} />} />
            <Route path="/history" element={<History />} />
          </Routes>
        </MDBCol>
      </MDBRow>
    </MDBContainer>
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

// Helper: Export WAV
const exportWAV = (audioChunks, mimeType) => {
  return new Promise((resolve, reject) => {
    const blob = new Blob(audioChunks, { type: mimeType });
    const fileReader = new FileReader();
    fileReader.onload = () => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContext.decodeAudioData(fileReader.result, (buffer) => {
        const wavBuffer = audioBufferToWav(buffer);
        resolve(new Blob([wavBuffer], { type: "audio/wav" }));
      }, reject);
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
  setUint32(0x46464952); 
  setUint32(length - 8); 
  setUint32(0x45564157); 
  setUint32(0x20746d66); 
  setUint32(16); 
  setUint16(1); 
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); 
  setUint16(numOfChan * 2); 
  setUint16(16); 
  setUint32(0x61746164); 
  setUint32(length - pos - 4); 
  for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
  while (pos < buffer.length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos])); 
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