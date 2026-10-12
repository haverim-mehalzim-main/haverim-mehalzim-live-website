"""
Hands a new-incident report to the incident-management agent.

The agent runs in its own Railway project with a WhatsApp connection and posts
the report to the team's group. This module only delivers the report to it —
POST <AGENT_BASE_URL>/api/incident-report with AGENT_API_SECRET as a Bearer token — and says
whether the agent took it.

Delivery contract (the agent's side is src/reports/gateway.js in its repo):
  200  accepted, or already had it. The agent tries to send the report to the
       group BEFORE it answers (waiting up to ~7s), and says what happened:
       {"accepted": true, "sent": false, "reason": "send_failed", ...}. sent=false
       means the report is safe in the agent's outbox but did NOT reach the team
       (its WhatsApp is disconnected, the wweb.js library threw, the send hung):
       send_report() then answers False and the WhatSable fallback sends it too.
       The cost is a second copy when the agent catches up (marked "sent late");
       a report that waits is worse. An older agent without the `sent` field is
       judged by `whatsapp_connected` if it has that, else treated as delivered.
  401  the secret is wrong        } a configuration problem: retrying can't help,
  400  not a report it understands} so give up at once and let the caller fall back
  5xx / no answer                 transient: send_report() makes ONE attempt (10s) and
                                  reports the failure, so the caller can send its
                                  backup at once instead of waiting out retries;
                                  retry_report() then keeps trying in the background
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
_REPORT_PATH = "/api/incident-report"
# The agent's endpoint for the list of officers allowed to message it.
_OFFICERS_PATH = "/api/officers"
# Pauses before the 2nd and 3rd attempt of the BACKGROUND retry (retry_report):
# the backup has already gone out by then, so these only decide how long the
# site keeps offering the report to the agent. A healthy agent answers within
# ~7s, so one 10s attempt is enough to know something is wrong — waiting out
# retries before the backup (as it used to: up to ~40s) only delays the team.
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


def _post_response(path: str, payload: dict, *, pauses: tuple, what: str):
    """POST `payload` to the agent. Returns (response, why): the 200 response and
    "" once it answered, else (None, a short reason code). `pauses` are the waits
    before each retry (empty = a single attempt)."""
    if not is_configured():
        return None, "agent_not_configured"

    attempts = len(pauses) + 1
    why = "agent_unreachable"
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
            why = "agent_unreachable"
            continue

        if resp.status_code == 200:
            return resp, ""
        if resp.status_code < 500:
            print(f"[agent] {what} refused: HTTP {resp.status_code} (check AGENT_API_SECRET matches the agent's)")
            return None, f"agent_refused_{resp.status_code}"
        print(f"[agent] {what}: attempt {attempt}/{attempts}: HTTP {resp.status_code}")
        why = f"agent_error_{resp.status_code}"

    print(f"[agent] gave up — the agent did not accept the {what}")
    return None, why


def _post(path: str, payload: dict, *, pauses: tuple, what: str) -> bool:
    """True once the agent answered 200."""
    return _post_response(path, payload, pauses=pauses, what=what)[0] is not None


def is_transient(reason: str) -> bool:
    """Would offering the report to the agent again later plausibly work?
    True for no answer / a 5xx; False for a refusal (wrong secret, bad body)
    and for an agent that took the report but could not send it — it retries
    that one itself every few minutes."""
    return reason == "agent_unreachable" or reason.startswith("agent_error_")


def send_report(payload: dict, *, pauses: tuple = ()) -> tuple[bool, str]:
    """POST a new-incident report to the agent — one attempt unless `pauses` is
    given. Returns (delivered, reason). delivered is True only when the agent
    took it AND got it to the group; on False the caller should use the
    fallback, and `reason` is a short code saying why (agent_unreachable,
    agent_refused_401, whatsapp_disconnected, send_failed, send_timeout, ...)."""
    resp, why = _post_response(_REPORT_PATH, payload, pauses=pauses, what="report")
    if resp is None:
        return False, why
    try:
        body = resp.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        if body.get("sent") is False:
            reason = str(body.get("reason") or "not_sent")[:60]
            print(f"[agent] took the report but did not send it to WhatsApp ({reason}) — it will go out late from the agent")
            return False, reason
        if "sent" not in body and body.get("whatsapp_connected") is False:
            print("[agent] took the report, but its WhatsApp is disconnected — it will go out late from the agent")
            return False, "whatsapp_disconnected"
    return True, ""


def retry_report(payload: dict) -> tuple[bool, str]:
    """Keep offering a report the agent did not answer for — after the caller's
    backup has already gone out. Same result as send_report(). Blocks for the
    pauses, so call it from the background thread only."""
    time.sleep(_RETRY_PAUSES[0])
    return send_report(payload, pauses=_RETRY_PAUSES[1:])


def push_officers(officers: list, *, retry: bool = True) -> bool:
    """Replace the agent's list of officers allowed to message it. `officers` is the
    FULL active list ([{number, name}]); the agent swaps its copy for it, so sending
    it twice changes nothing. An admin clicking "add" gets a single quick attempt
    (retry=False) so the page answers fast and says plainly if the agent could not
    be updated; the startup sync retries."""
    return _post(_OFFICERS_PATH, {"officers": officers}, pauses=_RETRY_PAUSES if retry else (), what="officers list")
