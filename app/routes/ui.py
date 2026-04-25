"""
UI routes for Jarvis.
"""
from flask import Blueprint, render_template, send_from_directory, current_app
from pathlib import Path

ui_bp = Blueprint("jarvis_ui", __name__)


@ui_bp.route("/")
def index():
    return render_template("jarvis/index.html")


@ui_bp.route("/admin")
def admin():
    return render_template("jarvis/admin.html")


@ui_bp.route("/config.json")
def config_json():
    base_dir = Path(current_app.config["JARVIS_HOME"])
    return send_from_directory(base_dir, "config.json", mimetype="application/json")
