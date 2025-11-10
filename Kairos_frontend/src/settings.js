/* Settings page layout and programming: */
import "./chatbox_style.css";
import "./settings.css";
import React, { useState} from "react";
function Settings() {

    const [language, setLanguage] = useState("spanish");
    const [proficiency, setProficiency] = useState("beginner");

    /*user chooses their language preference*/
    const handleSave = (e) => { /* Essentially makes it so the page doesn't reload when user submits HTML form*/
        e.preventDefault();
        alert(`Saved preferences:
            Language: ${language}
            Proficiency: ${proficiency}`);
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
            <option value="german">German DE</option>  {/* language options */}
            <option value="spanish">Spanish ES</option>
        </select>

    </div> {/*All of the following deals with proficiency selection*/}
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