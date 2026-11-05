"""Install only this channel; back up config first. Never restart a running Hermes."""
import argparse
import json
import io
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path


def install(home, pairing_file):
    from ruamel.yaml import YAML  # Already part of Hermes; preserve comments and unrelated settings.
    yaml = YAML()
    home, source = Path(home).resolve(), Path(__file__).resolve().parent
    if not (home / "config.yaml").is_file():
        raise ValueError("Choose the existing Hermes home containing config.yaml")
    pairing = json.loads(Path(pairing_file).read_text(encoding="utf-8-sig"))
    values = {"EO_SUPABASE_URL": pairing["url"], "EO_SUPABASE_KEY": pairing["key"], "EO_BRIDGE_TOKEN": pairing["token"], "EO_ALLOWED_USERS": str(uuid.UUID(pairing["userId"]))}
    if not values["EO_SUPABASE_URL"].startswith("https://") or not re.fullmatch(r"eo_[A-Za-z0-9_-]{43}", values["EO_BRIDGE_TOKEN"]):
        raise ValueError("Invalid connection file")
    if any(not isinstance(value, str) or "\n" in value or "\r" in value for value in values.values()):
        raise ValueError("Connection values must be single-line strings")
    target = home / "plugins" / "evaorbit-platform"
    target.resolve().relative_to(home)
    config_path, env_path = home / "config.yaml", home / ".env"
    config = yaml.load(config_path.read_text(encoding="utf-8-sig")) or {}
    plugins = config.setdefault("plugins", {})
    enabled = plugins.setdefault("enabled", [])
    if not isinstance(enabled, list):
        raise ValueError("Unexpected plugins.enabled format; configuration was not changed")
    if "evaorbit-platform" not in enabled:
        enabled.append("evaorbit-platform")
    disabled = plugins.get("disabled", [])
    if isinstance(disabled, list):
        plugins["disabled"] = [name for name in disabled if name != "evaorbit-platform"]
    buffer = io.StringIO()
    yaml.dump(config, buffer)
    rendered = buffer.getvalue()
    if YAML(typ="safe").load(rendered) != config:
        raise ValueError("Configuration round-trip failed")
    old_env = env_path.read_text(encoding="utf-8-sig") if env_path.exists() else ""
    lines = [line for line in old_env.splitlines() if not any(re.match(rf"\s*(?:export\s+)?{key}\s*=", line) for key in values)]
    lines += [f"{key}={json.dumps(value)}" for key, value in values.items()]
    backup = home / "backups" / ("evaorbit-channel-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    backup.mkdir(parents=True)
    for path in (config_path, env_path):
        if path.exists():
            shutil.copy2(path, backup / path.name)
    files = ("plugin.yaml", "__init__.py", "adapter.py", "transport.py")
    target.mkdir(parents=True, exist_ok=True)
    for name in files:
        previous = target / name
        if previous.exists():
            shutil.copy2(previous, backup / name)
        shutil.copy2(source / name, previous)
    # Atomic file replacements. All unrelated config keys and environment lines are retained.
    for path, content in ((config_path, rendered), (env_path, "\n".join(lines) + "\n")):
        temporary = path.with_name(path.name + ".eo-" + uuid.uuid4().hex)
        temporary.write_text(content, encoding="utf-8")
        os.replace(temporary, path)
    print(json.dumps({"installed": True, "home": str(home), "backup": str(backup), "gatewayRestarted": False}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True)
    parser.add_argument("--pairing", required=True)
    args = parser.parse_args()
    install(args.home, args.pairing)
