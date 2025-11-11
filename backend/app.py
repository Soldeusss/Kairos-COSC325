from flask import Flask, jsonify, request
from config import Config
from flask_cors import CORS
import openai
from openai import AzureOpenAI
import os
from datetime import datetime
from extensions import db, bcrypt, migrate  # <-- Removed duplicate import

# 1. Create the app and load config FIRST
app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# 2. Initialize extensions ONCE
db.init_app(app)
bcrypt.init_app(app)
migrate.init_app(app, db)

# 3. Create a default user in the database if one doesn't exist
# This block runs only when the application starts
with app.app_context():
    from models import User # Import models inside context for this check
    if not User.query.filter_by(id=1).first():
        default_user = User(
            id=1,
            name="Default User",
            email="default@example.com",
            password_hash="placeholder", # You should hash this!
            target_language="Spanish",
            fluency_level="Beginner"
        )
        db.session.add(default_user)
        db.session.commit()
        print("✅ Created default user (ID=1)")
        
# 4. NOW, we can safely import the rest of the models for the routes
from models import User, Conversation, Message 

# --- SCRUM-36: Configure Azure Client (NEW v1.0.0 SYNTAX) ---
try:
    # Instantiate the client, passing all credentials
    client = AzureOpenAI(
        api_key=app.config['AZURE_OPENAI_KEY'],
        api_version="2023-05-15", # A common API version
        azure_endpoint=app.config['AZURE_OPENAI_ENDPOINT']
    )
    print("✅ AzureOpenAI client configured successfully (v1.0.0 syntax).")
except Exception as e:
    print(f"❌ FAILED to configure AzureOpenAI client: {e}")
# --- End of SCRUM-36 code ---

@app.route('/')
def index():
    return "Hello, Pickle Inc. Backend is running!"

# User account endpoints - For Sign up and Log in
@app.route('/api/register', methods=['POST'])
def register_user():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        # Check if user already exists
        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            return jsonify({"error": "Email already in use"}), 400

        # Hash the password
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')

        # Create new user
        new_user = User(
            email=email,
            password_hash=hashed_password,
            name=data.get('name', 'New User'),
            target_language=data.get('target_language', 'Spanish'),
            fluency_level=data.get('fluency_level', 'Beginner')
        )

        db.session.add(new_user)
        db.session.commit()

        print(f"✅ New user created: {new_user.email}")
        # Return the new user's data (excluding password)
        return jsonify({
            "id": new_user.id,
            "email": new_user.email,
            "name": new_user.name
        }), 201 # 201 means "Created"

    except Exception as e:
        db.session.rollback()
        print(f"Error in /api/register: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login_user():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        user = User.query.filter_by(email=email).first()

        # Check if user exists and password is correct
        if user and bcrypt.check_password_hash(user.password_hash, password):
            print(f"✅ User login successful: {user.email}")
            return jsonify({
                "message": "Login successful",
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email
                }
            }), 200
        else:
            print(f"❌ Login failed for: {email}")
            return jsonify({"error": "Invalid email or password"}), 401 # 401 means "Unauthorized"

    except Exception as e:
        print(f"Error in /api/login: {e}")
        return jsonify({"error": str(e)}), 500

# Function to handle unimplemented image API
# This function will call DALL-E, but only if it's configured
def get_image_for_text(text_to_image):
    dalle_deployment = app.config.get('AZURE_DALLE_DEPLOYMENT_NAME')
    
    # Check if the DALL-E deployment name is set in our .env
    if not dalle_deployment:
        print("Image generation skipped: AZURE_DALLE_DEPLOYMENT_NAME is not set.")
        return None # Return nothing if not configured
    
    try:
        # (Code if it were enabled)
        # ...
        
        # placeholder to show it's skipped
        return None 
        
    except Exception as e:
        print(f"DALL-E call failed: {e}")
        return None


# Method for processing a message in chat
@app.route('/api/chat/message', methods=['POST'])
def process_message():
    data = request.get_json()
    user_id = data.get('userId')
    user_text = data.get('text')
    conversation_id = data.get('conversationId')

    try:
        # Step 1: Find the user
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Step 2: Find or create the conversation
        if conversation_id:
            conversation = Conversation.query.get(conversation_id)
            if not conversation:
                return jsonify({"error": "Conversation not found"}), 404
        else:
            # Let's use the topic from the frontend, or a default
            topic = data.get('topic', 'General Conversation') 
            conversation = Conversation(user_id=user.id, topic=topic)
            db.session.add(conversation)
            db.session.commit() # Commit here to get conversation.id

        # Step 3: Save the user's message (You already do this!)
        user_message = Message(
            conversation_id=conversation.id,
            sender='user', 
            text=user_text
        )
        db.session.add(user_message)
        db.session.commit()

        # --- START of SCRUM-6 Logic (UPGRADED) ---
        
        deployment = app.config['AZURE_OPENAI_DEPLOYMENT_NAME']

        # --- 1. Define the System Prompt ---
        system_prompt = f"""
        You are Kairos, an immersive AI language tutor. Your primary goal is to help me learn {user.target_language} by having a natural, engaging conversation, *not* by quizzing me.

        My Profile:
        - Language I'm Learning: {user.target_language}
        - My Fluency: {user.fluency_level}
        - Conversation Topic: {conversation.topic}

        Your Rules:
        1. Immerse Me: Speak *only* in {user.target_language} unless I explicitly ask for help in English.
        2. Adapt to Me: Adjust your vocabulary and sentence complexity to my {user.fluency_level} level.
        3. Stay on Topic: Keep the conversation focused on our current topic: {conversation.topic}.
        4. Gentle Correction: When I make a grammatical or vocabulary mistake, correct it *naturally* as part of your response.
           - Example (if I'm learning English and say "I eated pizza.")
           - Your response should be: "Oh, you *ate* pizza? What kind was it?"
        5. Be Encouraging: Be patient, friendly, and supportive.
        """
        
        # --- 2. Build the Message History ---
        message_history = [{"role": "system", "content": system_prompt}]

        # Fetch all messages for this conversation, in order
        previous_messages = Message.query.filter_by(conversation_id=conversation.id).order_by(Message.timestamp).all()
        
        for msg in previous_messages:
            # Translate your database role ('user' or 'ai') to the API role ('user' or 'assistant')
            role = "assistant" if msg.sender == "ai" else "user"
            message_history.append({"role": role, "content": msg.text})

        # --- 3. Call the Azure AI with the FULL history ---
        response = client.chat.completions.create(
            model=deployment,
            messages=message_history, # Pass the entire conversation history
            temperature=0.7,
            max_tokens=150
        )
        
        ai_text = response.choices[0].message.content.strip()
        # --- END of SCRUM-6 Logic ---

        # Step 5: Save the AI's response (You already do this!)
        ai_message = Message(
            conversation_id=conversation.id,
            sender='ai', 
            text=ai_text
        )
        db.session.add(ai_message)
        db.session.commit()

        # Step 6: Send the full response back to the frontend
        response_json = {
            "conversationId": conversation.id,
            "aiResponse": {
                "sender": "ai",
                "text": ai_message.text,
                "timestamp": ai_message.timestamp.isoformat()
            },
            "userMessage": {
                "sender": "user",
                "text": user_message.text,
                "timestamp": user_message.timestamp.isoformat()
            }
        }
        
        return jsonify(response_json), 200

    except Exception as e:
        print(f"Error processing message: {e}")
        db.session.rollback() 
        return jsonify({"error": str(e)}), 500

# Method for getting chat history 
# Add this new route to backend/app.py
@app.route('/api/chat/history/<int:convo_id>', methods=['GET'])
def get_chat_history(convo_id):
    try:
        # Find the conversation
        conversation = Conversation.query.get(convo_id)
        if not conversation:
            return jsonify({"error": "Conversation not found"}), 404

        # Get all messages for this conversation, ordered by time
        messages = Message.query.filter_by(conversation_id=convo_id).order_by(Message.timestamp.asc()).all()

        # Format the messages into a simple list
        message_list = []
        for msg in messages:
            message_list.append({
                "sender": msg.sender,
                "text": msg.text,
                "timestamp": msg.timestamp.isoformat()
            })

        return jsonify(message_list), 200

    except Exception as e:
        print(f"Error getting history: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)