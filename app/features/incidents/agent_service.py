"""
Hands a new-incident report to the incident-management agent.

The agent runs in its own Railway project with a WhatsApp connection and posts
the report to the team's group. This module only delivers the report to it —
POST <AGENT_BASE_URL>/incident-report with AGENT_API_SECRET as a Bearer token — and says
whether the agent took it.

Delivery contract (the agent's side is src/reports/gateway.js in its repo):
  200  accepted, or already had it — the agent keeps it until WhatsApp is
       connected, so a 200 means "will be delivered", not "was delivered"
  401  the secret is wrong        } a configuration problem: retrying can't help,
  400  not a report it understands} so give up at once and let the caller fall back
  5xx / no answer                 retry a couple of times with a growing pause
The agent de-duplicates on incident_id, so a retry after a lost 200 is safe.

Best-effort like the other senders: never raises, returns True/False. It runs
on a background thread (see whatsapp_service), so the retry pauses never hold
up the caller who just opened the call.
"""

import time

import requests

from app.config import AGENT_API_SECRET, AGENT_BASE_URL

_TIMEOUT_SECONDS = 10
# The agent's endpoint for new-incident reports; the base address is configuration.
_REPORT_PATH = "/incident-report"
# Pause before the 2nd and 3rd attempt. Long enough to ride out an agent
# redeploy starting up, short enough that the WhatSable fallback isn't far behind.
_RETRY_PAUSES = (2, 8)


def is_configured() -> bool:
    return bool(AGENT_BASE_URL and AGENT_API_SECRET)


def send_report(payload: dict) -> bool:
    """POST the report payload to the agent. True once the agent accepted it."""
    if not is_configured():
        return False

    attempts = len(_RETRY_PAUSES) + 1
    for attempt, pause in enumerate((0, *_RETRY_PAUSES), start=1):
        if pause:
            time.sleep(pause)
        try:
            resp = requests.post(
                f"{AGENT_BASE_URL}{_REPORT_PATH}",
                json=payload,
                headers={"Authorization": f"Bearer {AGENT_API_SECRET}"},
                timeout=_TIMEOUT_SECONDS,
            )
        except requests.RequestException as e:
            print(f"[agent] attempt {attempt}/{attempts} failed: {e.__class__.__name__}")
            continue

        if resp.status_code == 200:
            return True
        if resp.status_code < 500:
            print(f"[agent] report refused: HTTP {resp.status_code} (check AGENT_API_SECRET matches the agent's)")
            return False
        print(f"[agent] attempt {attempt}/{attempts}: HTTP {resp.status_code}")

    print("[agent] gave up — the agent did not accept the report")
    return False
