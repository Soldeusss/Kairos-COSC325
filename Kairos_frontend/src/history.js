import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./history.css";

function History() {
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();

  // Load history on page load
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("chatHistory")) || [];
    setHistory(saved);
  }, []);

  // Open a selected conversation
  const openConversation = (conversation) => {
    navigate("/", { state: { conversation } });
  };

  // NEW: Delete a single conversation
  const deleteConversation = (index) => {
    const updated = history.filter((_, i) => i !== index);
    setHistory(updated);
    localStorage.setItem("chatHistory", JSON.stringify(updated));
  };

  // Delete all
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
              <li key={index} className="history-item">
                <div className="history-text" onClick={() => openConversation(chat)}>
                  <strong>{chat.title || `Conversation ${index + 1}`}</strong>
                  <span className="history-date">
                    {chat.date ? new Date(chat.date).toLocaleString() : ""}
                  </span>
                </div>

                {/* DELETE BUTTON */}
                <button
                  className="delete-btn"
                  onClick={() => deleteConversation(index)}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>

          {/* CLEAR ALL BUTTON */}
          <button className="clear-history-btn" onClick={clearHistory}>
            Clear All History
          </button>
        </>
      )}
    </div>
  );
}

export default History;