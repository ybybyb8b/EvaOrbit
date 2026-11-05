"""Read-only local gateway identification. Never sends a message or a control mutation."""
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
from gateway.control_socket import identify_gateway, query_gateway_control
result = identify_gateway(Path(args.home))
summary = {"responded": result is not None}
if result:
    summary.update({key: result.get(key) for key in ("pid", "state", "supervisor", "runtime_protocol")})
    work = query_gateway_control(Path(args.home), "active-work", timeout=5)
    if work:
        summary["activeAgents"] = work.get("active_agents")
        active = work.get("active_work")
        summary["activeWorkCount"] = len(active) if isinstance(active, (list, dict)) else active if isinstance(active, (int, bool)) else None
print(json.dumps(summary))
