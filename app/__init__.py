"""
Jarvis Flask application factory.
"""
from pathlib import Path

from flask import Flask
from flask_cors import CORS


def create_app():
    base_dir = Path(__file__).resolve().parents[1]
    template_folder = base_dir / "app" / "templates"
    static_folder = base_dir / "app" / "static"

    app = Flask(
        __name__,
        template_folder=str(template_folder),
        static_folder=str(static_folder),
    )
    app.config["JARVIS_HOME"] = str(base_dir)

    CORS(app)

    from .routes.ui import ui_bp
    from .routes.api import api_bp

    app.register_blueprint(ui_bp)
    app.register_blueprint(api_bp, url_prefix="/api")

    return app
