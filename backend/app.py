from flask import Flask, jsonify, request
from config import Config
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
import openai
from openai import AzureOpenAI  # <-- IMPORT THE NEW AZURE CLIENT
import os
from datetime import datetime

# 1. Create the app and load config FIRST
app = Flask(__name__)
app.config.from_object(Config)

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


# --- THIS IS THE UPDATED ROUTE FOR SCRUM-6 and SCRUM-8/11 ---
@app.route('/api/chat/message', methods=['POST'])
def process_message():
    data = request.get_json()
    user_id = data.get('userId')
    user_text = data.get('text')
    conversation_id = data.get('conversationId')

    # --- START of SCRUM-8/11 Logic ---
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
            conversation = Conversation(user_id=user.id, topic="New Chat")
            db.session.add(conversation)
            db.session.commit()

        # Step 3: Save the user's message
        user_message = Message(
            conversation_id=conversation.id,
            sender='user', 
            text=user_text
        )
        db.session.add(user_message)
        db.session.commit()
        # --- END of SCRUM-8/11 Logic ---

        # --- START of SCRUM-6 Logic (NEW v1.0.0 SYNTAX) ---
        # Step 4: Call the Azure AI
        
        deployment = app.config['AZURE_OPENAI_DEPLOYMENT_NAME']
        system_prompt = f"You are a helpful language tutor. The user is learning {user.target_language} at a {user.fluency_level} level."
        
        # This is the new way to call the API
        response = client.chat.completions.create(
            model=deployment, # Use 'model' instead of 'engine'
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text}
            ],
            temperature=0.7,
            max_tokens=150
        )
        
        # This is the new way to get the reply
        ai_text = response.choices[0].message.content.strip()
        # --- END of SCRUM-6 Logic ---

        # --- START of SCRUM-8/11 Logic (Part 2) ---
        # Step 5: Save the AI's response
        ai_message = Message(
            conversation_id=conversation.id,
            sender='ai', 
            text=ai_text
        )
        db.session.add(ai_message)
        db.session.commit()
        # --- END of SCRUM-8/11 Logic (Part 2) ---

        # --- NEW: Call the image function ---
        generated_image_url = get_image_for_text(ai_text)

        # Step 6: Send the full response
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
        # This will now catch errors from the AI call or DB
        print(f"Error processing message: {e}")
        db.session.rollback() 
        return jsonify({"error": str(e)}), 500