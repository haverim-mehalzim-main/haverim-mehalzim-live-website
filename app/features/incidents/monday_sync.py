"""
Keeps our own copy of Monday.com incidents (one local Incident row per board
item, plus the mirrored city / phone / description) in step with the board.

Monday is the source of truth; nothing here ever writes to it except
registering the webhooks. Two independent mechanisms feed the same
incident_service.sync_local_incidents_from_monday, so a missed one is
covered by the other:

  - a webhook: Monday calls us the moment an item is created or edited
    (near-real-time);
  - a reconcile job (`flask monday reconcile`, run on a schedule): re-reads
    the whole board and fixes anything the webhook missed (downtime, retries
    that gave up, items edited before the webhook existed).
"""

import hmac

import click
import requests
from flask import Blueprint, jsonify, request

from app.config import BOARD_ID, MONDAY_HEADERS, MONDAY_URL, MONDAY_WEBHOOK_SECRET, PUBLIC_BASE_URL
from app.extensions import db
from app.features.incidents.service import fetch_incidents_by_ids, fetch_monday_data
from app.models import Incident
from app.services import incident_service

monday_sync_bp = Blueprint('monday_sync', __name__, cli_group='monday')

_WEBHOOK_EVENTS = ('create_item', 'change_column_value')


def _secret_matches(candidate: str) -> bool:
    if not MONDAY_WEBHOOK_SECRET:
        return False
    return hmac.compare_digest(candidate.encode(), MONDAY_WEBHOOK_SECRET.encode())


@monday_sync_bp.route('/api/webhooks/monday/<secret>', methods=['POST'])
def monday_webhook(secret):
    # 404, not 403 — don't confirm to a stranger that this path exists.
    if not _secret_matches(secret):
        return jsonify({'success': False}), 404

    body = request.get_json(silent=True) or {}

    # Handshake Monday performs once, when the webhook is created.
    if 'challenge' in body:
        return jsonify({'challenge': body['challenge']}), 200

    event = body.get('event') or {}
    item_id = str(event.get('pulseId') or event.get('itemId') or '')
    event_board = str(event.get('boardId') or '')
    if not item_id.isdigit() or (event_board and event_board != str(BOARD_ID)):
        return jsonify({'success': True, 'ignored': True}), 200

    # Only the item id is taken from the payload; the values are re-read from
    # Monday, so a forged or stale payload can't write anything into our copy.
    rows = fetch_incidents_by_ids([item_id])
    if rows:
        incident_service.sync_local_incidents_from_monday(rows)
        db.session.commit()
    return jsonify({'success': True}), 200


def reconcile() -> dict:
    """Re-read the whole board and bring every local row in line with it.
    Never deletes: a local row whose Monday item is gone is only reported."""
    rows = fetch_monday_data(include_unlocated=True)
    if rows is None:
        raise RuntimeError('Could not read the Monday board — nothing was changed.')

    stats = incident_service.sync_local_incidents_from_monday(rows)
    db.session.commit()

    monday_ids = {str(r['id']) for r in rows}
    local_ids = {i for (i,) in db.session.query(Incident.monday_item_id).all() if i.isdigit()}
    stats['missing_on_monday'] = sorted(local_ids - monday_ids)
    stats['board_total'] = len(rows)
    return stats


@monday_sync_bp.cli.command('reconcile')
def reconcile_command():
    """Sync the local DB with the Monday board (run on a schedule)."""
    stats = reconcile()
    click.echo(
        f"reconcile: board={stats['board_total']} created={stats['created']} "
        f"updated={stats['updated']} missing_on_monday={len(stats['missing_on_monday'])}"
    )
    if stats['missing_on_monday']:
        click.echo(f"  local rows with no Monday item: {', '.join(stats['missing_on_monday'])}")


def _graphql(query: str) -> dict:
    resp = requests.post(MONDAY_URL, json={'query': query}, headers=MONDAY_HEADERS, timeout=15)
    data = resp.json()
    if 'errors' in data:
        raise click.ClickException(f"Monday error: {data['errors']}")
    return data['data']


@monday_sync_bp.cli.command('register-webhooks')
@click.option('--base-url', default=PUBLIC_BASE_URL, help='Public https URL of this app (defaults to PUBLIC_BASE_URL).')
@click.option('--dry-run', is_flag=True, help='Show what would be registered without calling Monday.')
def register_webhooks_command(base_url, dry_run):
    """Register the Monday webhooks that call /api/webhooks/monday/<secret>.
    Run once, only AFTER the app with MONDAY_WEBHOOK_SECRET set is deployed —
    Monday performs its handshake against the URL as part of registering."""
    if not MONDAY_WEBHOOK_SECRET:
        raise click.ClickException('MONDAY_WEBHOOK_SECRET is not set.')
    if not base_url.startswith('https://'):
        raise click.ClickException('--base-url (or PUBLIC_BASE_URL) must be the public https URL of this app.')
    url = f"{base_url.rstrip('/')}/api/webhooks/monday/{MONDAY_WEBHOOK_SECRET}"

    existing = _graphql(f'{{ webhooks(board_id: {BOARD_ID}) {{ id event }} }}')['webhooks']
    already = {w['event'] for w in existing}

    for event in _WEBHOOK_EVENTS:
        if event in already:
            click.echo(f"{event}: a webhook for this event already exists on the board — skipped")
            continue
        if dry_run:
            click.echo(f"{event}: would register (dry run)")
            continue
        created = _graphql(
            f'mutation {{ create_webhook(board_id: {BOARD_ID}, url: "{url}", event: {event}) {{ id }} }}'
        )['create_webhook']
        click.echo(f"{event}: registered (id {created['id']})")
