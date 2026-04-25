"""
Config read/write utilities for Jarvis.
"""
import json
from pathlib import Path


def _config_path(app) -> Path:
    base_dir = Path(app.config["JARVIS_HOME"])
    return base_dir / "config.json"


def read_config(app) -> dict:
    path = _config_path(app)
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_config(app, data: dict) -> None:
    path = _config_path(app)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")
