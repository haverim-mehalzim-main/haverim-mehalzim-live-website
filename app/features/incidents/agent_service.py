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
from urllib.parse import urlparse

import requests

from app.config import AGENT_API_SECRET, AGENT_BASE_URL

_TIMEOUT_SECONDS = 10
# The agent's endpoint for new-incident reports; the base address is configuration.
_REPORT_PATH = "/incident-report"
# The agent's endpoint for the list of officers allowed to message it.
_OFFICERS_PATH = "/api/officers"
# Pause before the 2nd and 3rd attempt. Long enough to ride out an agent
# redeploy starting up, short enough that the WhatSable fallback isn't far behind.
_RETRY_PAUSES = (2, 8)


_warned_insecure = False


def _is_secure(base_url: str) -> bool:
    """https only. This address receives AGENT_API_SECRET on every call; over plain
    http it would cross the network in the clear (and requests would send it again on a
    redirect). A local address is allowed so the agent can be run next to the site for
    development."""
    parsed = urlparse(base_url)
    return parsed.scheme == "https" or (parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1"))


def is_configured() -> bool:
    """True only when the agent is configured AND reachable over https. An insecure
    address is treated as not configured (with a loud, once-only log), so the secret is
    never sent in the clear and reports simply take the WhatSable fallback."""
    global _warned_insecure
    if not (AGENT_BASE_URL and AGENT_API_SECRET):
        return False
    if not _is_secure(AGENT_BASE_URL):
        if not _warned_insecure:
            _warned_insecure = True
            print("[agent] AGENT_BASE_URL must start with https:// — the agent is disabled so the secret is never sent in the clear")
        return False
    return True


def _post(path: str, payload: dict, *, pauses: tuple, what: str) -> bool:
    """POST `payload` to the agent. True once it answered 200. `pauses` are the waits
    before each retry (empty = a single attempt)."""
    if not is_configured():
        return False

    attempts = len(pauses) + 1
    for attempt, pause in enumerate((0, *pauses), start=1):
        if pause:
            time.sleep(pause)
        try:
            resp = requests.post(
                f"{AGENT_BASE_URL}{path}",
                json=payload,
                headers={"Authorization": f"Bearer {AGENT_API_SECRET}"},
                timeout=_TIMEOUT_SECONDS,
            )
        except requests.RequestException as e:
            print(f"[agent] {what}: attempt {attempt}/{attempts} failed: {e.__class__.__name__}")
            continue

        if resp.status_code == 200:
            return True
        if resp.status_code < 500:
            print(f"[agent] {what} refused: HTTP {resp.status_code} (check AGENT_API_SECRET matches the agent's)")
            return False
        print(f"[agent] {what}: attempt {attempt}/{attempts}: HTTP {resp.status_code}")

    print(f"[agent] gave up — the agent did not accept the {what}")
    return False


def send_report(payload: dict) -> bool:
    """POST a new-incident report to the agent. True once the agent accepted it."""
    return _post(_REPORT_PATH, payload, pauses=_RETRY_PAUSES, what="report")


def push_officers(officers: list, *, retry: bool = True) -> bool:
    """Replace the agent's list of officers allowed to message it. `officers` is the
    FULL active list ([{number, name}]); the agent swaps its copy for it, so sending
    it twice changes nothing. An admin clicking "add" gets a single quick attempt
    (retry=False) so the page answers fast and says plainly if the agent could not
    be updated; the startup sync retries."""
    return _post(_OFFICERS_PATH, {"officers": officers}, pauses=_RETRY_PAUSES if retry else (), what="officers list")
