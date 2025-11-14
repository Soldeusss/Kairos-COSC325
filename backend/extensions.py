from flask_sqlalchemy import SQLAlchemy # Holds database elements to be imported by models and app.py
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate

db = SQLAlchemy()
bcrypt = Bcrypt()
migrate = Migrate()