from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

# Shared extension instances. Created here (not in app/__init__.py) so model
# modules can `from app.extensions import db` without triggering a circular
# import against the app factory.
db = SQLAlchemy()
migrate = Migrate()
