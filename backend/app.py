from flask import Flask, jsonify, request
from config import Config
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
from flask_cors import CORS
import openai
from openai import AzureOpenAI  # <-- IMPORT THE NEW AZURE CLIENT
import os
from datetime import datetime

# 1. Create the app and load config FIRST
app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# 2. Create the db and other extensions
db = SQLAlchemy(app) 
bcrypt = Bcrypt(app)
migrate = Migrate(app, db)

# 3. NOW, we can safely import the models.
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
        # result = client.images.generate(
        #     model=dalle_deployment,
        #     prompt=f"A simple, clear digital art image of: {text_to_image}",
        #     n=1
        # )
        # image_url = result.data[0].url
        # return image_url
        
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
            # Add each message to the history in {role: ..., content: ...} format
            message_history.append({"role": msg.sender, "content": msg.text})

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

