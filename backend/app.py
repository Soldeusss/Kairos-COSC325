from flask import Flask, jsonify, request
from config import Config
from flask_cors import CORS
import openai
from openai import AzureOpenAI
import os
from datetime import datetime
from extensions import db, bcrypt, migrate  # <-- Removed duplicate import
import azure.cognitiveservices.speech as speechsdk
import io
from flask import send_file
# 1. Create the app and load config FIRST
app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# 2. Initialize extensions ONCE
db.init_app(app)
bcrypt.init_app(app)
migrate.init_app(app, db)



def ensure_default_user():
    """Create default user only when app is actually running (not during CLI import)."""
    from models import User  # local import to avoid early model use
    from sqlalchemy import inspect

    with app.app_context():
        insp = inspect(db.engine)
        # Only attempt if the 'user' table exists AND has the new 'topic' column
        if 'user' in insp.get_table_names():
            cols = {c['name'] for c in insp.get_columns('user')}
            if 'topic' in cols and User.query.get(1) is None:
                default_user = User(
                    id=1,
                    name="Default User",
                    email="default@example.com",
                    password_hash="placeholder",
                    target_language="Spanish",
                    fluency_level="Beginner",
                    topic="General",
                )
                db.session.add(default_user)
                db.session.commit()
                print("✅ Created default user (ID=1)")   
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
        fluency_level = user.fluency_level.lower()

        if fluency_level == "beginner":
            fluency_instructions = """
            Use short, simple sentences and very common vocabulary.
            Avoid idioms or slang.
            Correct mistakes explicitly and gently, explaining the rule in English.
            Keep responses under 3 sentences.
            Encourage the user often with praise.
            """
        elif fluency_level == "intermediate":
            fluency_instructions = """
            Use more natural phrasing and intermediate-level vocabulary.
            Include compound and complex sentences using connectors like 'because', 'although', etc.
            Correct errors naturally by restating them correctly in context, without full grammar explanations.
            Encourage longer replies and add small cultural references.
            """
        elif fluency_level == "advanced":
            fluency_instructions = """
            Use fluent, natural speech and idiomatic expressions.
            Challenge the user with nuanced questions, abstract topics, and humor.
            Correct errors subtly by prompting self-correction.
            Avoid basic grammar explanations unless explicitly asked.
            """
        else:
            fluency_instructions = """
            Speak clearly and adapt naturally to the user's responses.
            """

        
        # --- 1. Define the System Prompt ---
        system_prompt = f"""
        You are Kairos, an immersive AI language tutor. Your primary goal is to help me learn {user.target_language} by having a natural, engaging conversation, *not* by quizzing me.

        My Profile:
        - Language I'm Learning: {user.target_language}
        - My Fluency: {user.fluency_level}
        - Conversation Topic: {conversation.topic}

        Behavior Rules:
        {fluency_instructions}

        Your Rules:
        1. Immerse Me: Speak *only* in {user.target_language} unless I explicitly ask for help in English.
        2. Adapt to Me: Adjust your vocabulary and sentence complexity to my {user.fluency_level} level.
        3. Stay on Topic: Keep the conversation focused on our current topic: {conversation.topic}.
        4. Gentle Correction: When I make a grammatical or vocabulary mistake, correct it *naturally* as part of your response.
           - Example (if I'm learning English and say "I eated pizza.")
           - Your response should be: "Oh, you *ate* pizza? What kind was it?"
        5. Be Encouraging: Be patient, friendly, and supportive.
        6. If someone says translate followed by a phrase, translate that phrase to English.
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
 # Add this new route to app.py
@app.route('/api/user/settings', methods=['PUT'])
def update_user_settings():
    try:
        data = request.get_json()
        user_id = data.get('userId')
        new_language = data.get('language')
        new_proficiency = data.get('proficiency')
        new_topic = data.get('topic')
        

        if not user_id:
            return jsonify({"error": "User ID is required"}), 400

        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        if new_language:
            user.target_language = new_language
        if new_proficiency:
            user.fluency_level = new_proficiency
        if new_topic:
            user.topic = new_topic

        db.session.commit()
        print(f"✅ Updated user {user.id}: Lang={user.target_language}, Prof={user.fluency_level}, Topic={user.topic}")
        return jsonify({"message": "Settings saved successfully!"}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error updating settings: {e}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/user/settings/<int:user_id>', methods=['GET'])
def get_user_settings(user_id):
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "language": user.target_language,
            "proficiency": user.fluency_level,
            "topic": user.topic
        }), 200

    except Exception as e:
        print(f"Error getting user settings: {e}")
        return jsonify({"error": str(e)}), 500
        
#
# ----------------------------------------------------------------------
# NEW API ENDPOINT FOR CROSS-BROWSER TEXT-TO-SPEECH
# ----------------------------------------------------------------------
#
@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    try:
        data = request.get_json()
        text = data.get('text')
        language = data.get('language')
       

        if not text or not language:
            return jsonify({"error": "Text and language are required"}), 400

        # 1. Configure the Azure Speech SDK
        speech_key = app.config['AZURE_SPEECH_KEY']
        speech_region = app.config['AZURE_SPEECH_REGION']
        speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)

        # 2. Map our app's language name to a specific, high-quality Azure voice
        # (You can find more voices in the Azure documentation)
        voice_map = {
            "spanish": "es-ES-ElviraNeural",  # Spain (Female)
            "french": "fr-FR-DeniseNeural",   # France (Female)
            "german": "de-DE-KillianNeural",    # Germany (Female)
            "english": "en-US-JennyNeural"    # US (Female)
        }

        # Set the voice, defaulting to English if no match is found
        voice = voice_map.get(language, "en-US-JennyNeural")
        speech_config.speech_synthesis_voice_name = voice

        # 3. Synthesize the speech
        # We use 'None' for audio_config to get the audio data in memory
        speech_synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
        
        result = speech_synthesizer.speak_text_async(text).get()

        # 4. Check for errors from Azure
        if result.reason == speechsdk.ResultReason.Canceled:
            cancellation_details = result.cancellation_details
            print(f"❌ Azure TTS failed: {cancellation_details.reason}")
            if cancellation_details.reason == speechsdk.CancellationReason.Error:
                print(f"Error details: {cancellation_details.error_details}")
            return jsonify({"error": "Azure TTS failed"}), 500

        # 5. Send the MP3 audio data back to the frontend
        audio_data = result.audio_data
        return send_file(
            io.BytesIO(audio_data),
            mimetype='audio/mpeg',
            as_attachment=False
        )

    except Exception as e:
        print(f"Error in /api/tts: {e}")
        return jsonify({"error": str(e)}), 500        

# ----------------------------------------------------------------------
# NEW API ENDPOINT FOR SPEECH-TO-TEXT (STT) (user to ai)
# ----------------------------------------------------------------------
@app.route('/api/stt', methods=['POST'])
def speech_to_text():
    # Ensure these are imported
    import tempfile
    import os
    
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400
        
        audio_file = request.files['audio']
        language_code = request.form.get('language', 'en-US') 
        
        azure_langs = {
            "spanish": "es-ES",
            "french": "fr-FR",
            "german": "de-DE",
            "english": "en-US"
        }
        selected_lang = azure_langs.get(language_code.lower(), language_code)

        # # --- WINDOWS FIX START ---
        # # 1. Create a temp file, but CLOSE the handle immediately
        # # This releases the Windows file lock so other steps can use it.
        # temp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        # temp.close() 
        # temp_filename = temp.name

        # --- DEBUGGING START ---
        # Save to a real file so we can listen to it!
        temp_filename = "debug_record.wav" 
        # --- DEBUGGING END ---
        
        try:
            # 2. Now it is safe to write to the file path
            audio_file.save(temp_filename)

            # 3. Configure Azure
            speech_key = app.config['AZURE_SPEECH_KEY']
            speech_region = app.config['AZURE_SPEECH_REGION']
            speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
            speech_config.speech_recognition_language = selected_lang 

            audio_config = speechsdk.audio.AudioConfig(filename=temp_filename)
            speech_recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

            print(f"🎙️ Processing audio in {selected_lang}...")
            result = speech_recognizer.recognize_once_async().get()

        finally:
            # 4. Cleanup: Release Azure objects and delete file
            # We delete these objects to force them to let go of the file
            del audio_config
            del speech_recognizer
            
        #     if os.path.exists(temp_filename):
        #         try:
        #             os.remove(temp_filename)
        #         except Exception:
        #             pass # If Windows still holds it, just ignore. It's a temp file.
        # # --- WINDOWS FIX END ---

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            print(f"✅ Transcribed: {result.text}")
            return jsonify({"text": result.text}), 200
        elif result.reason == speechsdk.ResultReason.NoMatch:
            print("❌ No speech recognized")
            return jsonify({"error": "Could not recognize speech."}), 400
        elif result.reason == speechsdk.ResultReason.Canceled:
            print("❌ Azure Canceled")
            return jsonify({"error": "Azure configuration error."}), 500

    except Exception as e:
        print(f"Error in /api/stt: {e}")
        return jsonify({"error": str(e)}), 500
    

with app.app_context():
    ensure_default_user() 
     # safe to call now; DB is migrated when you run the server

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
