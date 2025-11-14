import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./history.css";

function History() {
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("chatHistory")) || [];
    setHistory(saved);
  }, []);

  const openConversation = (conversation) => {
    navigate("/", { state: { conversation } });
  };

  const clearHistory = () => {
    localStorage.removeItem("chatHistory");
    setHistory([]);
  };

  return (
    <div className="history-container">
      <h2 className="history-title">Chat History</h2>
      {history.length === 0 ? (
        <p className="history-empty">No previous conversations yet.</p>
      ) : (
        <>
          <ul className="history-list">
            {history.map((chat, index) => (
              <li
                key={index}
                className="history-item"
                onClick={() => openConversation(chat)}
              >
                <strong>{chat.title || `Conversation ${index + 1}`}</strong>
                <span className="history-date">
                  {chat.date ? new Date(chat.date).toLocaleString() : ""}
                </span>
              </li>
            ))}
          </ul>
          <button className="clear-history-btn" onClick={clearHistory}>
            Clear All History
          </button>
        </>
      )}
    </div>
  );
}

export default History;