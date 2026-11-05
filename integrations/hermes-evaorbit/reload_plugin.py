"""Use Hermes' supported plugin reload verb; never stop or restart its gateway."""
import argparse
import json
import os
import site
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--root", required=True)
parser.add_argument("--packages", required=True)
parser.add_argument("--home", required=True)
args = parser.parse_args()
os.environ["HERMES_HOME"] = args.home
site.addsitedir(args.packages)
sys.path.insert(0, args.root)
from gateway.control_socket import reload_gateway_plugins
result = reload_gateway_plugins(Path(args.home), timeout=20)
print(json.dumps({"responded": result is not None, "reloaded": result.get("reloaded") if result else False,
                  "eoDiscovered": "evaorbit-platform" in (result.get("plugins", []) if result else []),
                  "adaptersRewired": result.get("adapters_rewired") if result else None,
                  "gatewayRestarted": False}))
