import './chatbox_style.css';

function App() {
  return (
    // Your HTML goes inside this outer div, replacing the old header
    <div className="App">

      {/* PASTE YOUR CODE HERE */}
      <div class="chat-container">
        
        <header class="chat-header">
            <h1>Kairos Chat</h1>
        </header>

        <main class="chat-window">
            
            <div class="message ai-message">
                <p>Hello! How can I help you today?</p>
            </div>
            
            <div class="message user-message">
                <p>Please translate this text that im writing from english to spanish.</p>
            </div>

        </main>

        <footer class="chat-input-area">
            <form class="chat-input-form" id="chat-form">
                <input
                    type="text" 
                    id="message-input"
                    placeholder="Type your message..."
                    autocomplete="off"
                />
                <button type="submit" id="send-button">Send</button>
            </form>
        </footer>

      </div>
      

    </div>
  );
}



export default App;