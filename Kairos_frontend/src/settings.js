/* Settings page layout and programming: */
import "./chatbox_style.css";
import "./settings.css";
import React, { useState } from "react";

function Settings() {
  const [language, setLanguage] = useState("spanish");
  const [proficiency, setProficiency] = useState("beginner");

 
  const handleSave = async (e) => {
    e.preventDefault();

    const userId = 1;

    try {
      const response = await fetch("http://127.0.0.1:5000/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId,
          language: language,
          proficiency: proficiency,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      alert(data.message); // Show "Settings saved successfully!"

    } catch (err) {
      console.error("❌ Failed to save settings:", err);
      alert("Error: Could not save settings to the server.");
    }
  };

  return (
    /* This chunk focuses on language selection e.g Spanish vs German*/
    <div className="settings-page">
      <h1>Settings</h1>
      <form className="settings-form" onSubmit={handleSave}>
        <div className="form-group">
          <label htmlFor="language">Language</label>
          <select /* Creates dropdown menu*/
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
		    <option value="english">English US</option>
            <option value="german">German DE</option> 
            <option value="spanish">Spanish ES</option>
            <option value="french">French FR</option>
          </select>
        </div>{" "}
        {/*All of the following deals with proficiency selection*/}
        <div className="form-group">
          <label htmlFor="proficiency">Proficiency Level</label>
          <select
            id="proficiency"
            value={proficiency}
            onChange={(e) => setProficiency(e.target.value)}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
          </select>
        </div>
        <button type="submit" className="save-button">
          Save Preferences
        </button>
      </form>
    </div>
  );
}

export default Settings;