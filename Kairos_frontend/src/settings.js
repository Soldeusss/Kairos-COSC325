/* Settings page layout and programming: */
import "./chatbox_style.css";
import "./settings.css";
import React, { useState, useEffect } from "react";

function Settings({ topic, setTopic, language, setLanguage, proficiency, setProficiency }) {
  const [loading, setLoading] = useState(false);

  // 🧩 Load current settings when the component opens
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
  }, [setTopic, setLanguage, setProficiency]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);

    const userId = 1;
    try {
      const response = await fetch("http://127.0.0.1:5000/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId,
          language: language,
          proficiency: proficiency,
          topic: topic,
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const data = await response.json();
      alert(data.message);

      // ✅ Immediately update App.js state (no reload needed)
      console.log(`✅ Updated React states: ${language}, ${proficiency}, ${topic}`);

    } catch (err) {
      console.error("❌ Failed to save settings:", err);
      alert("Error: Could not save settings to the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <form className="settings-form" onSubmit={handleSave}>
        <div className="form-group">
          <label htmlFor="language">Language</label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="english">English US</option>
            <option value="german">German DE</option>
            <option value="spanish">Spanish ES</option>
            <option value="french">French FR</option>
            <option value="hindi">Hindi IN</option>
            <option value="chinese">Chinese CN</option>
            <option value="japanese">Japanese JP</option>
            <option value="thai">Thai TH</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="proficiency">Proficiency Level</label>
          <select
            id="proficiency"
            value={proficiency}
            onChange={(e) => setProficiency(e.target.value)}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="topic">Conversation Topic</label>
          <select
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="nature">Nature</option>
            <option value="medical">Medical</option>
            <option value="technology">Technology</option>
            <option value="school">School</option>
            <option value="food">Food</option>
            <option value="activities">Activities/Hobbies</option>
            <option value="travel">Travel</option>
            <option value="music">Music</option>
            <option value="whatever">General</option>

          </select>
        </div>

        <button type="submit" className="save-button" disabled={loading}>
          {loading ? "Saving..." : "Save Preferences"}
        </button>
      </form>
    </div>
  );
}

export default Settings;