from datetime import datetime
from flask import Blueprint, jsonify
from app.features.incidents.service import fetch_monday_data, create_incident, update_incident, fetch_incidents_by_ids
from app.features.incidents.tracker_service import fetch_case_status
from app.features.incidents.donor_service import fetch_donor_by_token, is_valid_token_format, fetch_leaderboard
from app.features.incidents.feedback_service import (
    post_feedback_to_monday,
    fetch_all_feedback,
    fetch_approved_testimonials,
    set_approval,
    delete_item as delete_feedback_item,
)
from app.features.incidents.newsletter_service import post_subscriber_to_monday
from app.features.incidents.payment_service import (
    build_payment_url,
    parse_notify,
    new_order_id,
    is_configured as payment_configured,
    currency_code,
    SUPPORTED_CURRENCIES,
)
from app.features.incidents.donation_service import record_confirmed_payment
from app.features.incidents import email_service
from app.features.incidents.analysis import (
    count_incidents_per_type,
    get_incidents_current_year,
    get_incidents_last_year,
    get_incidents_year_before_last,
    get_incidents_current_month,
    get_incidents_last_month,
    get_countries_of_incidents,
    get_our_impact,
    count_by_incident_status,
    count_active_workload,
)
from app.features.incidents.constants import (
    GROUP_OPENED,
    INCIDENT_HANDLED_BY_RON,
    SIGNIFICANT_INCIDENT,
    ACTIVE_VOLUNTEERS_COUNT,
    PREMIUM_PRICE_USD,
    PREMIUM_PLAN_DEFAULT,
    USD_TO_ILS,
    INCIDENT_TYPE_TRANSLATIONS,
    GENDER_TRANSLATIONS,
    COUNTRIES,
    COUNTRY_NAME_BY_CODE,
    STATUS_TRANSLATIONS,
    INCIDENT_STATUS_TRANSLATIONS,
    CASE_STAGE_TRANSLATIONS,
    COMBAT_SERVICE_TRANSLATIONS,
    INSURANCE_TRANSLATIONS,
    CALL_SOURCE_TRANSLATIONS,
    CCC_OFFICIAL_TRANSLATIONS,
    INCIDENT_MANAGER_TRANSLATIONS,
    SUPERVISOR_TRANSLATIONS,
)

# Monday's country column returns the name text, not the ISO code — the
# admin edit form's country <select> needs the code to pre-select the
# current value, so this is the one reverse lookup _serialize_incident needs
# that COUNTRY_NAME_BY_CODE itself doesn't already provide.
_COUNTRY_CODE_BY_NAME = {v: k for k, v in COUNTRY_NAME_BY_CODE.items()}
from app.extensions import db
from app.services.auth_service import current_user
from app.services.account_service import user_has_role
from app.services import incident_service
from app.models import Incident, IncidentFollower, IncidentTask, IncidentTaskAssignee, IncidentVolunteer

incidents_bp = Blueprint('incidents', __name__)

HANDLED_STATUSES = {GROUP_OPENED, INCIDENT_HANDLED_BY_RON, SIGNIFICANT_INCIDENT}

# ── Admin auth ────────────────────────────────────────────────────────────────
import hmac, hashlib, time as _time
from collections import defaultdict

_rate_limit: dict = defaultdict(lambda: {'count': 0, 'window_start': 0.0})
_RATE_LIMIT_MAX    = 5     # max failed attempts
_RATE_LIMIT_WINDOW = 60    # seconds

_donor_rate: dict = defaultdict(lambda: {'count': 0, 'window_start': 0.0})
_DONOR_RATE_MAX    = 20    # donor pages are shared links — generous limit
_DONOR_RATE_WINDOW = 60

_track_rate: dict = defaultdict(lambda: {'count': 0, 'window_start': 0.0})
_TRACK_RATE_MAX    = 30
_TRACK_RATE_WINDOW = 60


def _check_admin_token(request, stored_token: str | None) -> bool:
    if not stored_token:
        return False

    ip = request.remote_addr or 'unknown'
    now = _time.time()
    bucket = _rate_limit[ip]

    # Reset window if expired
    if now - bucket['window_start'] > _RATE_LIMIT_WINDOW:
        bucket['count'] = 0
        bucket['window_start'] = now

    if bucket['count'] >= _RATE_LIMIT_MAX:
        return False

    # Read token from Authorization header: "Bearer <token>"
    auth_header = request.headers.get('Authorization', '')
    submitted = auth_header.removeprefix('Bearer ').strip()

    def _hash(s: str) -> bytes:
        return hashlib.sha256(s.encode()).digest()

    ok = hmac.compare_digest(_hash(submitted), _hash(stored_token))
    if not ok:
        bucket['count'] += 1
    else:
        bucket['count'] = 0  # reset on success
    return ok


@incidents_bp.route('/api/dashboard')
def get_dashboard_data():
    try:
        all_incidents = fetch_monday_data()

        if all_incidents is None:
            return jsonify({'success': False, 'message': 'Failed to fetch incidents', 'data': {}}), 500

        filtered = [r for r in all_incidents if r.get('color_mkvvrm1r') in HANDLED_STATUSES]

        year_all           = get_incidents_current_year(all_incidents)
        year_filtered      = get_incidents_current_year(filtered)
        last_year_all          = get_incidents_last_year(all_incidents)
        last_year_filtered     = get_incidents_last_year(filtered)
        year_before_last_all   = get_incidents_year_before_last(all_incidents)
        year_before_last_filtered = get_incidents_year_before_last(filtered)
        month_all          = get_incidents_current_month(all_incidents)
        month_filtered     = get_incidents_current_month(filtered)
        last_month_all     = get_incidents_last_month(all_incidents)
        last_month_filtered= get_incidents_last_month(filtered)

        return jsonify({
            'success': True,
            'data': {
                'summary': {
                    'total_all_incidents': len(all_incidents),
                    'total_handled_incidents': len(filtered),
                    'active_volunteers': ACTIVE_VOLUNTEERS_COUNT,
                    'countries_operated': len(get_countries_of_incidents(filtered)),
                    'regions': 6,
                },
                'all_time': {
                    'total_incidents': len(all_incidents),
                    'handled_incidents': len(filtered),
                    'incident_types': count_incidents_per_type(all_incidents),
                    'handled_incident_types': count_incidents_per_type(filtered),
                    'countries': get_countries_of_incidents(all_incidents),
                    'handled_countries': get_countries_of_incidents(filtered),
                },
                'current_year': {
                    'total_incidents': len(year_all),
                    'handled_incidents': len(year_filtered),
                    'incident_types': count_incidents_per_type(year_all),
                    'handled_incident_types': count_incidents_per_type(year_filtered),
                },
                'last_year': {
                    'total_incidents': len(last_year_all),
                    'handled_incidents': len(last_year_filtered),
                    'incident_types': count_incidents_per_type(last_year_all),
                    'handled_incident_types': count_incidents_per_type(last_year_filtered),
                },
                'year_before_last': {
                    'total_incidents': len(year_before_last_all),
                    'handled_incidents': len(year_before_last_filtered),
                    'incident_types': count_incidents_per_type(year_before_last_all),
                    'handled_incident_types': count_incidents_per_type(year_before_last_filtered),
                },
                'current_month': {
                    'total_incidents': len(month_all),
                    'handled_incidents': len(month_filtered),
                    'incident_types': count_incidents_per_type(month_all),
                    'handled_incident_types': count_incidents_per_type(month_filtered),
                    'countries': get_countries_of_incidents(month_all),
                    'handled_countries': get_countries_of_incidents(month_filtered),
                },
                'last_month': {
                    'total_incidents': len(last_month_all),
                    'handled_incidents': len(last_month_filtered),
                    'incident_types': count_incidents_per_type(last_month_all),
                    'handled_incident_types': count_incidents_per_type(last_month_filtered),
                    'countries': get_countries_of_incidents(last_month_all),
                    'handled_countries': get_countries_of_incidents(last_month_filtered),
                },
                'impact': get_our_impact(all_incidents),
            }
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e), 'data': {}}), 500


@incidents_bp.route('/api/incidents')
def get_incidents():
    incidents = fetch_monday_data()
    if incidents is None:
        return jsonify({'success': False, 'message': 'Failed to fetch incidents', 'data': []}), 500

    return jsonify({
        'success': True,
        'data': incidents,
        'count_received': len(incidents),
        'count_displayed': len(incidents),
    }), 200


@incidents_bp.route('/api/incidents/summary')
def get_incidents_summary():
    incidents = fetch_monday_data()
    if incidents is None:
        return jsonify({'success': False, 'message': 'Failed to fetch incidents', 'summary': {}}), 500
    return jsonify({
        'success': True,
        'summary': count_incidents_per_type(incidents),
        'total_incidents': len(incidents),
        'active_volunteers': ACTIVE_VOLUNTEERS_COUNT,
    }), 200


@incidents_bp.route('/api/debug/locations')
def debug_locations():
    import os
    from flask import request
    expected = os.getenv('DEBUG_TOKEN')
    if not expected or request.args.get('token') != expected:
        return jsonify({'error': 'Forbidden'}), 403

    incidents = fetch_monday_data()
    if incidents is None:
        return jsonify({'success': False}), 500

    locations: dict = {}
    countries: dict = {}
    for r in incidents:
        loc = (r.get('location_mkmbv7be') or '').strip()
        cty = (r.get('country_mkmb91h3')  or '').strip()
        if loc:
            locations[loc] = locations.get(loc, 0) + 1
        if cty:
            countries[cty] = countries.get(cty, 0) + 1

    return jsonify({
        'locations': dict(sorted(locations.items(), key=lambda x: -x[1])),
        'countries':  dict(sorted(countries.items(),  key=lambda x: -x[1])),
    }), 200


@incidents_bp.route('/api/track/<item_id>')
def get_case_tracking(item_id):
    from flask import request as _req
    ip  = _req.remote_addr or 'unknown'
    now = _time.time()
    bucket = _track_rate[ip]
    if now - bucket['window_start'] > _TRACK_RATE_WINDOW:
        bucket['count'] = 0
        bucket['window_start'] = now
    bucket['count'] += 1
    if bucket['count'] > _TRACK_RATE_MAX:
        return jsonify({'success': False, 'message': 'Too many requests'}), 429

    if not item_id.isdigit():
        return jsonify({'success': False, 'message': 'Invalid case ID'}), 400

    case_data = fetch_case_status(item_id)
    if case_data is None:
        return jsonify({'success': False, 'message': 'Case not found'}), 404

    return jsonify({'success': True, 'data': case_data}), 200


@incidents_bp.route('/api/feedback', methods=['POST'])
def submit_feedback():
    from flask import request
    body    = request.get_json(silent=True) or {}
    case_id = str(body.get('case_id', '')).strip()
    name    = str(body.get('name',    '')).strip()[:120]
    message = str(body.get('message', '')).strip()[:2000]
    rating  = body.get('rating')
    if rating is not None:
        try:
            rating = max(1, min(5, int(rating)))
        except (ValueError, TypeError):
            rating = None

    if not message or not name:
        return jsonify({'success': False, 'message': 'Name and message are required'}), 400

    timestamp = datetime.now().isoformat()
    post_feedback_to_monday(name, message, case_id, timestamp, rating)
    return jsonify({'success': True}), 200


@incidents_bp.route('/api/newsletter', methods=['POST'])
def subscribe_newsletter():
    import re
    from flask import request

    body      = request.get_json(silent=True) or {}
    name      = str(body.get('name',  '')).strip()[:120]
    email     = str(body.get('email', '')).strip()[:200]
    interests = body.get('interests') or []
    if not isinstance(interests, list):
        interests = []
    interests = [str(i).strip()[:40] for i in interests if str(i).strip()][:10]

    if not name:
        return jsonify({'success': False, 'message': 'Name is required'}), 400
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
        return jsonify({'success': False, 'message': 'A valid email is required'}), 400

    timestamp = datetime.now().isoformat()
    item_id = post_subscriber_to_monday(name, email, interests, timestamp)
    if item_id is None:
        return jsonify({'success': False, 'message': 'Could not save your sign-up. Please try again later.'}), 500

    return jsonify({'success': True}), 200


@incidents_bp.route('/api/testimonials')
def get_testimonials():
    try:
        return jsonify({'success': True, 'data': fetch_approved_testimonials()}), 200
    except Exception as ex:
        return jsonify({'success': False, 'message': str(ex)}), 500


@incidents_bp.route('/api/admin/feedback')
def admin_feedback():
    from flask import request
    from app.config import ADMIN_TOKEN
    if not _check_admin_token(request, ADMIN_TOKEN):
        return jsonify({'success': False, 'message': 'Forbidden'}), 403
    try:
        return jsonify({'success': True, 'data': fetch_all_feedback()}), 200
    except Exception as ex:
        return jsonify({'success': False, 'message': str(ex)}), 500


@incidents_bp.route('/api/admin/feedback/<item_id>', methods=['DELETE'])
def delete_feedback(item_id):
    from flask import request
    from app.config import ADMIN_TOKEN
    if not _check_admin_token(request, ADMIN_TOKEN):
        return jsonify({'success': False, 'message': 'Forbidden'}), 403
    ok = delete_feedback_item(item_id)
    return jsonify({'success': ok}), (200 if ok else 500)


@incidents_bp.route('/api/admin/feedback/<item_id>/approve', methods=['PATCH'])
def approve_feedback(item_id):
    from flask import request
    from app.config import ADMIN_TOKEN
    if not _check_admin_token(request, ADMIN_TOKEN):
        return jsonify({'success': False, 'message': 'Forbidden'}), 403
    body     = request.get_json(silent=True) or {}
    approved = bool(body.get('approved', True))
    ok       = set_approval(item_id, approved)
    return jsonify({'success': ok, 'approved': approved}), (200 if ok else 500)


@incidents_bp.route('/api/donor/<token>')
def get_donor_impact(token):
    from flask import request
    ip  = request.remote_addr or 'unknown'
    now = _time.time()
    bucket = _donor_rate[ip]
    if now - bucket['window_start'] > _DONOR_RATE_WINDOW:
        bucket['count'] = 0
        bucket['window_start'] = now
    if bucket['count'] >= _DONOR_RATE_MAX:
        return jsonify({'success': False, 'message': 'Too many requests'}), 429
    bucket['count'] += 1

    if not is_valid_token_format(token):
        return jsonify({'success': False, 'message': 'Not found'}), 404

    try:
        data = fetch_donor_by_token(token)
    except Exception as ex:
        print(f'[donor] error: {ex}')
        return jsonify({'success': False, 'message': 'Internal error'}), 500

    if data is None:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    resp = jsonify({'success': True, 'data': data})
    resp.headers['Cache-Control'] = 'private, no-store'
    return resp, 200


@incidents_bp.route('/api/leaderboard')
def get_leaderboard():
    try:
        board = fetch_leaderboard()
        resp = jsonify({'success': True, 'data': board, 'total': len(board)})
        resp.headers['Cache-Control'] = 'public, max-age=300'
        return resp, 200
    except Exception as ex:
        print(f'[leaderboard] error: {ex}')
        return jsonify({'success': False, 'message': str(ex)}), 500


# ── Donations (Tranzila) ────────────────────────────────────────────────────
_donate_rate: dict = defaultdict(lambda: {'count': 0, 'window_start': 0.0})
_DONATE_RATE_MAX    = 15
_DONATE_RATE_WINDOW = 60


@incidents_bp.route('/api/payment-config')
def payment_config():
    """
    Public config the donate/premium UI needs: the currencies a donor may
    choose, the USD→ILS rate, and the premium price. Serving these from here
    (not hardcoding in the bundle) keeps what the visitor sees and what the
    backend actually charges/checks on one source of truth.
    """
    from app.features.incidents.constants import USD_TO_ILS, PREMIUM_PRICE_USD
    resp = jsonify({
        'success': True,
        'currencies': SUPPORTED_CURRENCIES,
        'usd_to_ils': USD_TO_ILS,
        'premium_price_usd': PREMIUM_PRICE_USD,
    })
    resp.headers['Cache-Control'] = 'public, max-age=3600'
    return resp, 200


@incidents_bp.route('/api/donate/start', methods=['POST'])
def donate_start():
    """
    Begin a one-time donation. Validates the request, then returns the Tranzila
    hosted-page URL the browser should redirect to. No charge happens here — the
    money is confirmed later at /api/tranzilla/notify.
    """
    from flask import request

    ip  = request.remote_addr or 'unknown'
    now = _time.time()
    bucket = _donate_rate[ip]
    if now - bucket['window_start'] > _DONATE_RATE_WINDOW:
        bucket['count'] = 0
        bucket['window_start'] = now
    bucket['count'] += 1
    if bucket['count'] > _DONATE_RATE_MAX:
        return jsonify({'success': False, 'message': 'Too many requests'}), 429

    if not payment_configured():
        return jsonify({'success': False, 'message': 'Payments are not configured'}), 503

    body = request.get_json(silent=True) or {}

    try:
        amount = round(float(body.get('amount', 0)), 2)
    except (ValueError, TypeError):
        amount = 0
    if amount < 1 or amount > 500000:
        return jsonify({'success': False, 'message': 'Invalid amount'}), 400

    incident_id = str(body.get('incident_id', '')).strip()[:40]
    if incident_id and not incident_id.isdigit():
        return jsonify({'success': False, 'message': 'Invalid incident'}), 400

    currency_name = str(body.get('currency', 'USD')).strip().upper()
    if currency_name not in SUPPORTED_CURRENCIES:
        return jsonify({'success': False, 'message': 'Unsupported currency'}), 400

    order = {
        'order_id':      new_order_id(),
        'amount':        amount,
        'currency':      currency_code(currency_name),   # Tranzila numeric code
        'incident_id':   incident_id,
        'package_id':    str(body.get('package_id', '')).strip()[:60],
        'package_label': str(body.get('package_label', '')).strip()[:120],
        'donor_name':    str(body.get('donor_name', '')).strip()[:120],
        'donor_email':   str(body.get('donor_email', '')).strip()[:200],
        'donor_phone':   str(body.get('donor_phone', '')).strip()[:40],
    }

    url = build_payment_url(order)
    if not url:
        return jsonify({'success': False, 'message': 'Could not start payment'}), 500

    return jsonify({'success': True, 'payment_url': url, 'order_id': order['order_id']}), 200


# ── Premium membership (Tranzila) ────────────────────────────────────────────
_premium_rate: dict = defaultdict(lambda: {'count': 0, 'window_start': 0.0})
_PREMIUM_RATE_MAX    = 15
_PREMIUM_RATE_WINDOW = 60


@incidents_bp.route('/api/premium/start', methods=['POST'])
def premium_start():
    """
    Begin a premium-membership purchase — a fixed price (not user-adjustable,
    unlike a donation), one-time payment that grants permanent premium status
    on confirmation. See record_confirmed_premium_purchase in premium_service.
    """
    from flask import request
    from app.services.premium_service import create_pending_payment

    ip  = request.remote_addr or 'unknown'
    now = _time.time()
    bucket = _premium_rate[ip]
    if now - bucket['window_start'] > _PREMIUM_RATE_WINDOW:
        bucket['count'] = 0
        bucket['window_start'] = now
    bucket['count'] += 1
    if bucket['count'] > _PREMIUM_RATE_MAX:
        return jsonify({'success': False, 'message': 'Too many requests'}), 429

    if not payment_configured():
        return jsonify({'success': False, 'message': 'Payments are not configured'}), 503

    body = request.get_json(silent=True) or {}

    currency_name = str(body.get('currency', 'USD')).strip().upper()
    if currency_name not in SUPPORTED_CURRENCIES:
        return jsonify({'success': False, 'message': 'Unsupported currency'}), 400

    donor_name  = str(body.get('donor_name', '')).strip()[:120]
    donor_email = str(body.get('donor_email', '')).strip()[:200]
    donor_phone = str(body.get('donor_phone', '')).strip()[:40]
    if not donor_email:
        return jsonify({'success': False, 'message': 'Email is required'}), 400

    # Fixed product price — never trust a client-supplied amount here, unlike
    # a donation where the donor picks the amount.
    amount = PREMIUM_PRICE_USD if currency_name == 'USD' else round(PREMIUM_PRICE_USD * USD_TO_ILS, 2)
    order_id = new_order_id()

    try:
        create_pending_payment(
            order_id=order_id,
            donor_name=donor_name,
            donor_email=donor_email,
            donor_phone=donor_phone,
            amount=amount,
            currency=currency_code(currency_name),
            amount_usd=PREMIUM_PRICE_USD,
            plan=PREMIUM_PLAN_DEFAULT,
        )
    except Exception as e:
        print(f'[premium] failed to record pending payment: {e}')
        return jsonify({'success': False, 'message': 'Could not start payment'}), 500

    order = {
        'order_id':      order_id,
        'amount':        amount,
        'currency':      currency_code(currency_name),
        'package_id':    PREMIUM_PLAN_DEFAULT,
        'package_label': 'Premium Membership',
        'donor_name':    donor_name,
        'donor_email':   donor_email,
        'donor_phone':   donor_phone,
        'purpose':       'premium_membership',
    }

    url = build_payment_url(order)
    if not url:
        return jsonify({'success': False, 'message': 'Could not start payment'}), 500

    return jsonify({'success': True, 'payment_url': url, 'order_id': order_id}), 200


@incidents_bp.route('/api/tranzilla/notify', methods=['GET', 'POST'])
def tranzilla_notify():
    """
    Server-to-server callback from Tranzila — the SOURCE OF TRUTH for a payment.
    Only here do we record the donation to Monday. Always returns 200 so Tranzila
    does not retry indefinitely on our internal errors.
    """
    from flask import request

    values = request.form.to_dict() if request.form else {}
    if not values:
        values = request.args.to_dict()

    payment = parse_notify(values)
    if payment is None:
        # Not approved or failed verification — acknowledge without recording.
        return jsonify({'success': False}), 200

    if payment.get('purpose') == 'premium_membership':
        from app.extensions import db
        from app.services.premium_service import record_confirmed_premium_purchase
        try:
            result = record_confirmed_premium_purchase(payment, datetime.now().isoformat())
            db.session.commit()
            if result.get('duplicate'):
                print(f'[notify] duplicate premium order {payment.get("order_id")} — skipping')
            elif not result.get('user_id'):
                print(f'[notify] premium order {payment.get("order_id")} confirmed with no linked account')
            # TODO: premium welcome/confirmation email — not built yet.
        except Exception as ex:
            db.session.rollback()
            print(f'[notify] error recording premium order {payment.get("order_id")}: {ex}')
        return jsonify({'success': True}), 200

    try:
        result = record_confirmed_payment(payment, datetime.now().isoformat())

        if result.get('duplicate'):
            # A prior (retried) notify already recorded this order and emailed the
            # donor — don't record or email again.
            print(f'[notify] duplicate order {payment.get("order_id")} — skipping email')
        else:
            if not result.get('donation_id'):
                print(f'[notify] failed to record order {payment.get("order_id")}')

            # Best-effort donor thank-you email — never let a mail failure affect
            # the 200 we owe Tranzila, nor the fact that the money was recorded.
            try:
                email_service.send_donation_thankyou(
                    donor_name=payment.get('donor_name', ''),
                    donor_email=payment.get('donor_email', ''),
                    amount=payment.get('amount', 0),
                    currency=payment.get('currency', ''),
                    token=result.get('token'),
                    incident_id=payment.get('incident_id', ''),
                )
            except Exception as mail_ex:
                print(f'[notify] thank-you email error for order {payment.get("order_id")}: {mail_ex}')
    except Exception as ex:
        print(f'[notify] error recording order {payment.get("order_id")}: {ex}')

    return jsonify({'success': True}), 200


# ── My incidents (account dashboard) ────────────────────────────────────────
_open_call_rate: dict = defaultdict(lambda: {'count': 0, 'window_start': 0.0})
_OPEN_CALL_RATE_MAX    = 10
_OPEN_CALL_RATE_WINDOW = 60


def _serialize_incident(local_incident: Incident, monday_row: dict | None) -> dict:
    """Merge the local ownership row with its live Monday.com fields. Monday
    stays the source of truth for everything except who opened it and when —
    `monday_row` can be None if the item was since deleted on Monday.

    Every "pick one label" field is exposed twice: the raw board value
    (Hebrew, or English where the board's own labels already are — used for
    internal matching like HANDLED_STATUSES) and an "_en" English
    translation (used for display and to pre-select the admin edit form's
    dropdown). city/patient_phone/description each have a local override
    (see Incident.submitted_*) that wins over Monday's own text — an admin
    edit through this app updates both together (see staff_update_incident)
    so the two can never show something different from each other."""
    row = monday_row or {}
    hebrew_type = row.get('status_mkmb1zc6', '')
    # The requester's own submission time (Incident.created_at), not Monday's
    # timeline_mkmbcabh — self-service creation deliberately leaves that unset
    # (see create_incident); staff set it once the case is actually being
    # worked, which is a different date than when it was opened.
    opened_date = local_incident.created_at.date().isoformat()
    status_label = row.get('color_mkvvrm1r', '')
    incident_status = row.get('status_mkmbjwef', '') or ''
    case_stage = row.get('color_mm32c8wh', '') or ''
    insurance = row.get('color_mkmbwnzy', '') or ''
    combat_service = row.get('single_selectynfloxz', '') or ''
    call_source = row.get('color_mkmbpyxw', '') or ''
    ccc_official = row.get('color_mkmbwakp', '') or ''
    incident_manager = row.get('status_mkmb9hbk', '') or ''
    supervisor = row.get('status_mkmb6bm2', '') or ''
    country_name = row.get('country_mkmb91h3', '') or ''

    hebrew_gender = row.get('color_mkngmw3', '')

    return {
        'id': local_incident.id,
        'monday_item_id': local_incident.monday_item_id,
        # Monday's item title is the patient/missing person's name (matches
        # the convention already used by every existing item on this board).
        'name': row.get('name', ''),
        'patient_name': row.get('name', ''),
        'patient_age': row.get('numeric_mkng2emx', ''),
        'patient_gender': GENDER_TRANSLATIONS.get(hebrew_gender, hebrew_gender),
        # Prefer what the requester actually typed (see
        # Incident.submitted_patient_phone) over Monday's structured phone
        # column, which our minimal form never populates (it requires a
        # validated number + country code) but staff may fill in properly later.
        'patient_phone': local_incident.submitted_patient_phone or row.get('phone_mkz3dr0y', ''),
        'filer_info': row.get('text_mkz3yv22', ''),
        'incident_type': INCIDENT_TYPE_TRANSLATIONS.get(hebrew_type, hebrew_type),
        # City has no safe Monday column of its own (see create_incident) —
        # kept locally. Country IS a real structured Monday column now, so
        # its text comes straight from Monday like everything else.
        'city': local_incident.submitted_location or '',
        'country': country_name,
        'country_code': _COUNTRY_CODE_BY_NAME.get(country_name, ''),
        'location': ', '.join(p for p in [local_incident.submitted_location, country_name] if p),
        # Prefer the requester's own untouched text (see
        # Incident.submitted_description); falls back to Monday's raw column
        # for incidents opened any other way (no local row to prefer).
        'description': local_incident.submitted_description or row.get('long_text_mkpfvmh3', ''),
        'life_threatening': bool(row.get('check_mkn3c7v8')),
        'opened_date': opened_date,
        'status_label': status_label,
        # English translation of status_label, for the admin edit form's
        # dropdown to pre-select the current value — status_label itself
        # stays the raw Hebrew text everywhere else, unchanged.
        'status_label_en': STATUS_TRANSLATIONS.get(status_label, ''),
        'handled': status_label in HANDLED_STATUSES,
        'found_on_monday': monday_row is not None,
        'created_at': local_incident.created_at.isoformat(),

        # ── Extended case detail (admin dashboard + edit) ──────────────────
        'incident_status': incident_status,
        'incident_status_en': INCIDENT_STATUS_TRANSLATIONS.get(incident_status, ''),
        'case_stage': case_stage,
        'case_stage_en': CASE_STAGE_TRANSLATIONS.get(case_stage, ''),
        'insurance': insurance,
        'insurance_en': INSURANCE_TRANSLATIONS.get(insurance, ''),
        'combat_service': combat_service,
        'combat_service_en': COMBAT_SERVICE_TRANSLATIONS.get(combat_service, ''),
        'call_source': call_source,
        'call_source_en': CALL_SOURCE_TRANSLATIONS.get(call_source, ''),
        'ccc_official': ccc_official,
        'ccc_official_en': CCC_OFFICIAL_TRANSLATIONS.get(ccc_official, ''),
        'incident_manager': incident_manager,
        'incident_manager_en': INCIDENT_MANAGER_TRANSLATIONS.get(incident_manager, ''),
        'supervisor': supervisor,
        'supervisor_en': SUPERVISOR_TRANSLATIONS.get(supervisor, ''),
        'in_request_at': row.get('text_mkmbt7j5', '') or '',
        'closed_at': row.get('text_mm435fh9', '') or '',

        # Case-closure form (shown once incident_status is "Done" — see
        # IncidentDetailPage.tsx's CaseClosureCard).
        'closure_summary': row.get('long_text_mknd9c64', '') or '',
        'closure_lessons': row.get('long_text_mm31t5ky', '') or '',
        'closure_locating_point': row.get('text_mkmbref6', '') or '',

        # Set only if this item was ever declined at intake (see the reject
        # route) — the caller's own incident page shows it when
        # incident_status_en is 'Rejected'; harmless (unused) otherwise.
        'rejection_reason': incident_service.get_rejection_reason(local_incident.monday_item_id),
    }


def _serialize_monday_only_incident(row: dict) -> dict:
    """Same extended case-detail shape as _serialize_incident, for a board
    item with no local Incident row at all (the overwhelming majority — most
    incidents are entered by staff straight on Monday, never through this
    app). No owner, no local-override fields (city/phone/description come
    straight from Monday, unedited by any caller here), no local id."""
    hebrew_type = row.get('status_mkmb1zc6', '')
    status_label = row.get('color_mkvvrm1r', '')
    incident_status = row.get('status_mkmbjwef', '') or ''
    case_stage = row.get('color_mm32c8wh', '') or ''
    insurance = row.get('color_mkmbwnzy', '') or ''
    combat_service = row.get('single_selectynfloxz', '') or ''
    call_source = row.get('color_mkmbpyxw', '') or ''
    ccc_official = row.get('color_mkmbwakp', '') or ''
    incident_manager = row.get('status_mkmb9hbk', '') or ''
    supervisor = row.get('status_mkmb6bm2', '') or ''
    country_name = row.get('country_mkmb91h3', '') or ''
    hebrew_gender = row.get('color_mkngmw3', '')

    return {
        'id': None,
        'monday_item_id': row.get('id'),
        'name': row.get('name', ''),
        'patient_name': row.get('name', ''),
        'patient_age': row.get('numeric_mkng2emx', ''),
        'patient_gender': GENDER_TRANSLATIONS.get(hebrew_gender, hebrew_gender),
        'patient_phone': row.get('phone_mkz3dr0y', ''),
        'filer_info': row.get('text_mkz3yv22', ''),
        'incident_type': INCIDENT_TYPE_TRANSLATIONS.get(hebrew_type, hebrew_type),
        'city': '',
        'country': country_name,
        'country_code': _COUNTRY_CODE_BY_NAME.get(country_name, ''),
        'location': country_name,
        'description': row.get('long_text_mkpfvmh3', '') or '',
        'life_threatening': bool(row.get('check_mkn3c7v8')),
        'status_label': status_label,
        'status_label_en': STATUS_TRANSLATIONS.get(status_label, ''),
        'handled': status_label in HANDLED_STATUSES,
        'found_on_monday': True,

        'incident_status': incident_status,
        'incident_status_en': INCIDENT_STATUS_TRANSLATIONS.get(incident_status, ''),
        'case_stage': case_stage,
        'case_stage_en': CASE_STAGE_TRANSLATIONS.get(case_stage, ''),
        'insurance': insurance,
        'insurance_en': INSURANCE_TRANSLATIONS.get(insurance, ''),
        'combat_service': combat_service,
        'combat_service_en': COMBAT_SERVICE_TRANSLATIONS.get(combat_service, ''),
        'call_source': call_source,
        'call_source_en': CALL_SOURCE_TRANSLATIONS.get(call_source, ''),
        'ccc_official': ccc_official,
        'ccc_official_en': CCC_OFFICIAL_TRANSLATIONS.get(ccc_official, ''),
        'incident_manager': incident_manager,
        'incident_manager_en': INCIDENT_MANAGER_TRANSLATIONS.get(incident_manager, ''),
        'supervisor': supervisor,
        'supervisor_en': SUPERVISOR_TRANSLATIONS.get(supervisor, ''),
        'in_request_at': row.get('text_mkmbt7j5', '') or '',
        'closed_at': row.get('text_mm435fh9', '') or '',
        'closure_summary': row.get('long_text_mknd9c64', '') or '',
        'closure_lessons': row.get('long_text_mm31t5ky', '') or '',
        'closure_locating_point': row.get('text_mkmbref6', '') or '',
        'rejection_reason': incident_service.get_rejection_reason(row.get('id')),
    }


def _serialize_task(task: IncidentTask) -> dict:
    return {
        'id': task.id,
        'assignee': task.assignee.value,
        'title': task.title,
        'description': task.description,
        'status': task.status.value,
        'sort_order': task.sort_order,
        'completed_at': task.completed_at.isoformat() if task.completed_at else None,
    }


# A family/friend follower gets the "is my loved one okay" picture, never the
# operational detail (no raw phone numbers, no who-filed-this, no task list —
# that's caller-only). Deliberately an allowlist, not a blocklist: a new field
# added to _serialize_incident later is macro-hidden by default until someone
# decides it belongs here, not silently exposed.
_MACRO_INCIDENT_FIELDS = {
    'id', 'monday_item_id', 'incident_type', 'city', 'country', 'location',
    'patient_name', 'life_threatening', 'opened_date', 'handled', 'created_at',
}


def _to_macro_incident_view(serialized: dict, monday_item_id: str) -> dict:
    macro = {k: v for k, v in serialized.items() if k in _MACRO_INCIDENT_FIELDS}
    # The warm, step-based framing already built for the public case tracker —
    # "We are with you", "Family Notified with Care" — is exactly the tone a
    # family/friend view should have, not a clinical Monday status label.
    status = fetch_case_status(monday_item_id)
    macro['progress'] = status
    return macro


# A volunteer who hasn't been approved to actively assist this specific
# incident yet gets real operational context (what happened, patient
# demographics) so they can decide whether to request to join — but not raw
# contact info (phone, filer) or the task list, which stay behind that
# approval. Allowlist, same reasoning as the macro view above.
_VOLUNTEER_PREVIEW_FIELDS = _MACRO_INCIDENT_FIELDS | {
    'description', 'patient_age', 'patient_gender', 'status_label', 'found_on_monday',
}


def _to_volunteer_preview_view(serialized: dict) -> dict:
    return {k: v for k, v in serialized.items() if k in _VOLUNTEER_PREVIEW_FIELDS}


def _serialize_volunteer_request(request: IncidentVolunteer) -> dict:
    return {
        'id': request.id,
        'user': {'email': request.user.email, 'full_name': request.user.full_name} if request.user else None,
        'requested_at': request.requested_at.isoformat(),
    }


def _staff_role_check(*, admin_only: bool = False):
    """Returns the current user if they're allowed to act on staff incident
    endpoints, else None. Volunteers can view and mark tasks done; only
    admins can create/delete tasks or edit their title/description."""
    user = current_user()
    if user is None:
        return None
    required = ('admin',) if admin_only else ('admin', 'volunteer')
    return user if user_has_role(user, *required) else None


def _incident_staff_check(local_id: int, *, admin_only: bool = False):
    """Like _staff_role_check, but for actions scoped to one incident: a
    volunteer additionally has to be *approved to assist this specific
    incident* (see incident_service.is_approved_volunteer), not just hold
    the global role — that approval is the whole reason an unapproved
    volunteer only gets a preview of the page instead of the task journey.
    Admins are unrestricted, same as everywhere else."""
    user = current_user()
    if user is None:
        return None
    if user_has_role(user, 'admin'):
        return user
    if admin_only:
        return None
    if user_has_role(user, 'volunteer') and incident_service.is_approved_volunteer(local_id, user.id):
        return user
    return None


@incidents_bp.route('/api/incident-types')
def get_incident_types():
    """English labels for the 'Open a Call' form dropdown — derived from the
    same translation table used to display incidents, so the list can never
    drift out of sync with what the backend actually accepts."""
    return jsonify({'success': True, 'types': sorted(set(INCIDENT_TYPE_TRANSLATIONS.values()))}), 200


@incidents_bp.route('/api/staff/incident-field-options')
def get_incident_field_options():
    """Every dropdown option list the admin case-detail edit form needs, in
    one response — real board labels only (see the *_TRANSLATIONS dicts in
    constants.py), already translated to English, so an edit can never write
    a label Monday doesn't already recognize. Staff-only: some of this
    (duty-officer rosters, referral sources) is internal team info, not
    public-facing."""
    if _staff_role_check() is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403
    return jsonify({
        'success': True,
        'statuses': list(STATUS_TRANSLATIONS.values()),
        'incident_statuses': list(INCIDENT_STATUS_TRANSLATIONS.values()),
        'case_stages': list(CASE_STAGE_TRANSLATIONS.values()),
        'genders': list(GENDER_TRANSLATIONS.values()),
        'combat_services': list(COMBAT_SERVICE_TRANSLATIONS.values()),
        'insurances': list(INSURANCE_TRANSLATIONS.values()),
        'call_sources': list(CALL_SOURCE_TRANSLATIONS.values()),
        'ccc_officials': list(CCC_OFFICIAL_TRANSLATIONS.values()),
        'incident_managers': list(INCIDENT_MANAGER_TRANSLATIONS.values()),
        'supervisors': list(SUPERVISOR_TRANSLATIONS.values()),
    }), 200


@incidents_bp.route('/api/countries')
def get_countries():
    """Country list for the 'Open a Call' form's Country dropdown — same list
    create_incident uses to write Monday's structured country column, so the
    two can never drift apart (see COUNTRIES in constants.py)."""
    resp = jsonify({'success': True, 'countries': [{'code': c, 'name': n} for c, n in COUNTRIES]})
    resp.headers['Cache-Control'] = 'public, max-age=86400'
    return resp, 200


@incidents_bp.route('/api/incidents', methods=['POST'])
def open_incident():
    user = current_user()
    if user is None:
        return jsonify({'success': False, 'message': 'Please log in first.'}), 401

    from flask import request
    ip  = request.remote_addr or 'unknown'
    now = _time.time()
    bucket = _open_call_rate[ip]
    if now - bucket['window_start'] > _OPEN_CALL_RATE_WINDOW:
        bucket['count'] = 0
        bucket['window_start'] = now
    bucket['count'] += 1
    if bucket['count'] > _OPEN_CALL_RATE_MAX:
        return jsonify({'success': False, 'message': 'Too many requests'}), 429

    body = request.get_json(silent=True) or {}

    incident_type = str(body.get('incident_type', '')).strip()
    city          = str(body.get('city', '')).strip()[:200]
    country_code  = str(body.get('country_code', '')).strip().upper()
    description   = str(body.get('description', '')).strip()[:2000]

    filer_name    = str(body.get('filer_name', '')).strip()[:200]
    filer_phone   = str(body.get('filer_phone', '')).strip()[:40]
    patient_name  = str(body.get('patient_name', '')).strip()[:200]
    patient_phone = str(body.get('patient_phone', '')).strip()[:40]
    patient_gender = str(body.get('patient_gender', '')).strip()

    patient_age_raw = body.get('patient_age')
    patient_age = None
    if patient_age_raw not in (None, ''):
        try:
            patient_age = max(0, min(150, int(patient_age_raw)))
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'Please enter a valid age.'}), 400

    if patient_gender and patient_gender not in GENDER_TRANSLATIONS.values():
        return jsonify({'success': False, 'message': 'Please choose a valid gender.'}), 400

    if incident_type not in INCIDENT_TYPE_TRANSLATIONS.values():
        return jsonify({'success': False, 'message': 'Please choose a valid incident type.'}), 400
    if not city:
        return jsonify({'success': False, 'message': 'Please enter a city.'}), 400
    if country_code not in COUNTRY_NAME_BY_CODE:
        return jsonify({'success': False, 'message': 'Please choose a valid country.'}), 400
    if not description:
        return jsonify({'success': False, 'message': 'Please describe what happened and what you need.'}), 400
    if not filer_name:
        return jsonify({'success': False, 'message': 'Please enter the name of the person filling in this form.'}), 400
    if not filer_phone:
        return jsonify({'success': False, 'message': 'Please enter a phone number for the person filling in this form.'}), 400
    if not patient_name:
        return jsonify({'success': False, 'message': 'Please enter the full name of the patient/missing person.'}), 400

    monday_item_id = create_incident(
        incident_type=incident_type,
        city=city,
        country_code=country_code,
        description=description,
        patient_name=patient_name,
        filer_name=filer_name,
        filer_phone=filer_phone,
        patient_age=patient_age,
        patient_gender=patient_gender,
        patient_phone=patient_phone,
    )
    if monday_item_id is None:
        return jsonify({'success': False, 'message': 'Could not open the call. Please try again shortly.'}), 502

    incident = incident_service.create_incident_record(
        user_id=user.id,
        monday_item_id=monday_item_id,
        submitted_location=city,
        submitted_patient_phone=patient_phone or None,
        submitted_description=description,
    )
    db.session.commit()

    return jsonify({'success': True, 'incident': {'id': incident.id, 'monday_item_id': monday_item_id}}), 200


@incidents_bp.route('/api/my/incidents')
def my_incidents():
    user = current_user()
    if user is None:
        return jsonify({'success': False, 'message': 'Please log in first.'}), 401

    owned = [(inc, 'owner') for inc in incident_service.list_incidents_for_user(user.id)]
    followed = [(inc, 'follower') for inc in incident_service.list_followed_incidents(user.id)]
    all_incidents = owned + followed

    monday_rows = {
        row['id']: row
        for row in fetch_incidents_by_ids([inc.monday_item_id for inc, _ in all_incidents])
    }

    ongoing, past = [], []
    for inc, relation in all_incidents:
        serialized = _serialize_incident(inc, monday_rows.get(inc.monday_item_id))
        if relation == 'follower':
            serialized = _to_macro_incident_view(serialized, inc.monday_item_id)
            serialized['handled'] = serialized.get('handled', False)
        serialized['relation'] = relation
        (past if serialized.get('handled') else ongoing).append(serialized)

    return jsonify({'success': True, 'ongoing': ongoing, 'past': past}), 200


@incidents_bp.route('/api/incidents/<int:local_id>')
def incident_detail(local_id):
    """The one dedicated page for a single incident, shared by every kind of
    viewer — what comes back scales with `relation` (and, for volunteers,
    whether they've been approved to assist THIS incident), not the URL:
      owner    — the caller: full detail + editable task journey + share link
      follower — family/friend: macro progress card only, no task list
      admin    — full detail + task journey, can also add/edit/delete tasks
                 and approve/deny volunteer join requests
      volunteer, approved for this incident — same full detail + task
                 journey as admin, but can only toggle task status
      volunteer, not (yet) approved — a reduced preview (real operational
                 context, no raw contact info, no task list) plus whether
                 they've already asked to join
    Precedence is personal relation to *this* incident first (owner/follower),
    then role-based staff access — an admin who also happens to be this
    incident's own caller sees their own-case view, not the ops view.
    """
    user = current_user()
    if user is None:
        return jsonify({'success': False, 'message': 'Please log in first.'}), 401

    incident = db.session.get(Incident, local_id)
    if incident is None:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    if incident.user_id == user.id:
        relation = 'owner'
    elif IncidentFollower.query.filter_by(incident_id=incident.id, user_id=user.id).first() is not None:
        relation = 'follower'
    elif user_has_role(user, 'admin'):
        relation = 'admin'
    elif user_has_role(user, 'volunteer'):
        relation = 'volunteer'
    else:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    monday_rows = fetch_incidents_by_ids([incident.monday_item_id])
    monday_row = monday_rows[0] if monday_rows else None
    serialized = _serialize_incident(incident, monday_row)

    if relation == 'follower':
        # Macro-only: no task list, no raw contact details — the warm
        # progress framing instead of operational data.
        return jsonify({
            'success': True,
            'relation': relation,
            'incident': _to_macro_incident_view(serialized, incident.monday_item_id),
            'tasks': [],
        }), 200

    if relation == 'owner':
        tasks = incident_service.list_tasks(incident.id)
        return jsonify({
            'success': True,
            'relation': relation,
            'incident': serialized,
            'tasks': [_serialize_task(t) for t in tasks],
        }), 200

    serialized['owner'] = {'email': incident.user.email, 'full_name': incident.user.full_name} if incident.user else None

    if relation == 'admin':
        tasks = incident_service.list_tasks(incident.id)
        pending = incident_service.list_pending_volunteer_requests(incident.id)
        return jsonify({
            'success': True,
            'relation': relation,
            'incident': serialized,
            'tasks': [_serialize_task(t) for t in tasks],
            'volunteer_requests': [_serialize_volunteer_request(r) for r in pending],
        }), 200

    # relation == 'volunteer'
    vol_request = incident_service.get_volunteer_request(incident.id, user.id)
    if vol_request is not None and vol_request.approved_at is not None:
        tasks = incident_service.list_tasks(incident.id)
        return jsonify({
            'success': True,
            'relation': relation,
            'joined': True,
            'incident': serialized,
            'tasks': [_serialize_task(t) for t in tasks],
        }), 200

    return jsonify({
        'success': True,
        'relation': relation,
        'joined': False,
        'join_requested': vol_request is not None,
        'incident': _to_volunteer_preview_view(serialized),
        'tasks': [],
    }), 200


@incidents_bp.route('/api/incidents/<int:local_id>/share', methods=['POST'])
def share_incident(local_id):
    """Owner-only: mint (or return the existing) share link for family/
    friends to follow this incident at a macro level."""
    user = current_user()
    if user is None:
        return jsonify({'success': False, 'message': 'Please log in first.'}), 401

    incident = incident_service.get_owned_incident(local_id, user.id)
    if incident is None:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    token = incident_service.get_or_create_share_token(incident)
    db.session.commit()

    from app.config import PUBLIC_BASE_URL
    return jsonify({'success': True, 'share_token': token, 'share_url': f'{PUBLIC_BASE_URL}/join/{token}'}), 200


@incidents_bp.route('/api/incidents/join/<token>', methods=['POST'])
def join_incident(token):
    """A logged-in family/friend claims a share link. The owner visiting
    their own share link is a no-op (they already have full access)."""
    user = current_user()
    if user is None:
        return jsonify({'success': False, 'message': 'Please log in first.'}), 401

    incident = incident_service.get_incident_by_share_token(token)
    if incident is None:
        return jsonify({'success': False, 'message': 'This link is invalid or has expired.'}), 404

    if incident.user_id == user.id:
        return jsonify({'success': True, 'incident_id': incident.id, 'already_owner': True}), 200

    incident_service.join_incident(incident=incident, user=user)
    db.session.commit()
    return jsonify({'success': True, 'incident_id': incident.id, 'already_owner': False}), 200


@incidents_bp.route('/api/my/donations')
def my_donations():
    """Which incidents has this donor funded, and how is each one doing —
    the local `payments` audit trail (see donation_service._record_donation_payment)
    instead of a live Monday.com query per page load."""
    user = current_user()
    if user is None:
        return jsonify({'success': False, 'message': 'Please log in first.'}), 401

    from app.models import Payment, PaymentPurpose, PaymentStatus
    donations = (
        Payment.query
        .filter_by(user_id=user.id, purpose=PaymentPurpose.DONATION, status=PaymentStatus.CONFIRMED)
        .order_by(Payment.confirmed_at.desc())
        .all()
    )

    result = []
    for d in donations:
        entry = {
            'order_id': d.order_id,
            'amount_usd': float(d.amount_usd),
            'currency': d.currency,
            'confirmed_at': d.confirmed_at.isoformat() if d.confirmed_at else None,
            'monday_item_id': d.monday_item_id,
            'progress': fetch_case_status(d.monday_item_id) if d.monday_item_id else None,
        }
        result.append(entry)

    return jsonify({'success': True, 'donations': result}), 200


# ── Staff (admin + volunteer): view and work incidents ─────────────────────
# Real login/role auth, not the shared ADMIN_TOKEN the old /api/admin/feedback
# endpoints still use — this surface is used by volunteer accounts too, not
# just admins, so a shared secret token was never the right fit for it.

@incidents_bp.route('/api/staff/incidents')
def staff_list_incidents():
    if _staff_role_check() is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    local_incidents = Incident.query.order_by(Incident.created_at.desc()).all()
    monday_rows = {
        row['id']: row
        for row in fetch_incidents_by_ids([i.monday_item_id for i in local_incidents])
    }
    pending_counts = incident_service.count_pending_volunteer_requests([i.id for i in local_incidents])

    result = []
    for inc in local_incidents:
        serialized = _serialize_incident(inc, monday_rows.get(inc.monday_item_id))
        serialized['owner'] = {'email': inc.user.email, 'full_name': inc.user.full_name} if inc.user else None
        serialized['pending_volunteer_requests'] = pending_counts.get(inc.id, 0)
        result.append(serialized)

    return jsonify({'success': True, 'incidents': result}), 200


@incidents_bp.route('/api/staff/overview')
def staff_overview():
    """Admin-only management dashboard: workload and pipeline across the
    whole Monday.com board (not just incidents opened through the app —
    those are a small fraction of real cases), plus the volunteer-approval
    backlog, which is local-only (Monday has no concept of it). Deliberately
    separate from the Staff Console list: that page is "which case do I
    open", this one is "how is the team doing overall"."""
    if _staff_role_check(admin_only=True) is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    all_rows = fetch_monday_data()
    monday_by_item_id = {row['id']: row for row in all_rows}

    pending = incident_service.list_pending_volunteer_requests_by_incident()
    pending_incident_ids = [p['incident_id'] for p in pending]
    local_incidents_by_id = {
        inc.id: inc for inc in Incident.query.filter(Incident.id.in_(pending_incident_ids)).all()
    } if pending_incident_ids else {}
    pending_out = []
    for p in pending:
        inc = local_incidents_by_id.get(p['incident_id'])
        monday_row = monday_by_item_id.get(inc.monday_item_id) if inc else None
        pending_out.append({
            'incident_id': p['incident_id'],
            'incident_name': (monday_row.get('name') if monday_row else None) or f"Incident #{p['incident_id']}",
            'count': p['count'],
            'oldest_requested_at': p['oldest_requested_at'].isoformat(),
            'requesters': [
                {
                    'request_id': r['request_id'],
                    'full_name': r['full_name'],
                    'email': r['email'],
                    'requested_at': r['requested_at'].isoformat(),
                }
                for r in p['requesters']
            ],
        })

    return jsonify({
        'success': True,
        'total_incidents': len(all_rows),
        'incident_status_counts': count_by_incident_status(all_rows),
        'ccc_workload': sorted(count_active_workload(all_rows, 'color_mkmbwakp', CCC_OFFICIAL_TRANSLATIONS).items(), key=lambda kv: -kv[1]),
        'manager_workload': sorted(count_active_workload(all_rows, 'status_mkmb9hbk', INCIDENT_MANAGER_TRANSLATIONS).items(), key=lambda kv: -kv[1]),
        'supervisor_workload': sorted(count_active_workload(all_rows, 'status_mkmb6bm2', SUPERVISOR_TRANSLATIONS).items(), key=lambda kv: -kv[1]),
        'pending_volunteer_total': sum(p['count'] for p in pending),
        'pending_volunteer_incidents': pending_out,
    }), 200


@incidents_bp.route('/api/staff/incidents-by-status')
def staff_incidents_by_status():
    """The full board's worth of incidents in one workflow stage — behind
    the clickable pipeline tiles on the management overview (New Request by
    User / Working on it / ...). Deliberately whole-board, not just incidents
    opened through the app: most real incidents are entered by staff straight
    on Monday, so scoping this to app-only incidents would show a queue that
    doesn't remotely match the tile's own count."""
    if _staff_role_check(admin_only=True) is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    from flask import request
    status = (request.args.get('status') or '').strip()
    if status not in INCIDENT_STATUS_TRANSLATIONS.values():
        return jsonify({'success': False, 'message': 'Invalid status.'}), 400

    all_rows = fetch_monday_data()
    matching = [r for r in all_rows if INCIDENT_STATUS_TRANSLATIONS.get((r.get('status_mkmbjwef') or '').strip(), '') == status]

    monday_item_ids = [r['id'] for r in matching]
    local_by_monday_id = {
        inc.monday_item_id: inc for inc in Incident.query.filter(Incident.monday_item_id.in_(monday_item_ids)).all()
    } if monday_item_ids else {}

    hebrew_type = INCIDENT_TYPE_TRANSLATIONS
    result = []
    for row in matching:
        local_incident = local_by_monday_id.get(row['id'])
        result.append({
            'monday_item_id': row['id'],
            'local_id': local_incident.id if local_incident else None,
            'name': row.get('name', ''),
            'incident_type': hebrew_type.get(row.get('status_mkmb1zc6', ''), row.get('status_mkmb1zc6', '')),
            'country': row.get('country_mkmb91h3', '') or '',
            'life_threatening': bool(row.get('check_mkn3c7v8')),
            'owner': (
                {'email': local_incident.user.email, 'full_name': local_incident.user.full_name}
                if local_incident and local_incident.user else None
            ),
        })

    return jsonify({'success': True, 'status': status, 'incidents': result}), 200


@incidents_bp.route('/api/staff/monday-incidents/<monday_item_id>')
def staff_monday_incident_detail(monday_item_id):
    """Read view for a board incident with no local Incident row (the
    common case) — same extended case-detail fields as the app-opened
    incident page, but no task journey / edit form / closure form, since
    those are all tied to the app's own local ownership model, not
    something a Monday-only item has any use for here."""
    if _staff_role_check(admin_only=True) is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    rows = fetch_incidents_by_ids([monday_item_id])
    if not rows:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    local_incident = Incident.query.filter_by(monday_item_id=str(monday_item_id)).one_or_none()
    return jsonify({
        'success': True,
        'local_id': local_incident.id if local_incident else None,
        'incident': _serialize_monday_only_incident(rows[0]),
    }), 200


@incidents_bp.route('/api/staff/monday-incidents/<monday_item_id>/approve', methods=['POST'])
def approve_monday_incident(monday_item_id):
    """Accept a 'New Request by User' intake and start active work on it —
    just a status write-through to Monday, the same as any other case-detail
    edit; nothing local to update, since approval isn't caller-facing the
    way a rejection reason is."""
    if _staff_role_check(admin_only=True) is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    ok, warnings = update_incident(item_id=monday_item_id, fields={'incident_status': 'Working on it'})
    if not ok:
        return jsonify({'success': False, 'message': 'Could not update Monday.com. Please try again shortly.'}), 502
    return jsonify({'success': True, 'warnings': warnings}), 200


@incidents_bp.route('/api/staff/monday-incidents/<monday_item_id>/reject', methods=['POST'])
def reject_monday_incident(monday_item_id):
    """Decline a 'New Request by User' intake, with a reason the caller (if
    this incident was opened through the app) sees on their own incident
    page. Writes both Monday status columns straight through (status_mkmbjwef
    -> 'Rejected', color_mkvvrm1r -> 'Decided Not To Open' — the label the
    org already uses for 'CHAMAL decided not to open an incident'), and keeps
    the reason text locally since Monday has no column for it."""
    from flask import request

    user = _staff_role_check(admin_only=True)
    if user is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    body = request.get_json(silent=True) or {}
    reason = str(body.get('reason', '')).strip()[:2000]
    if not reason:
        return jsonify({'success': False, 'message': 'Please provide a reason for rejecting this request.'}), 400

    ok, warnings = update_incident(
        item_id=monday_item_id,
        fields={'incident_status': 'Rejected', 'status_label': 'Decided Not To Open'},
    )
    if not ok:
        return jsonify({'success': False, 'message': 'Could not update Monday.com. Please try again shortly.'}), 502

    incident_service.record_rejection(monday_item_id=monday_item_id, reason=reason, rejected_by_user_id=user.id)
    db.session.commit()
    return jsonify({'success': True, 'warnings': warnings}), 200


_LABEL_FIELD_VALIDATORS = {
    'incident_type':    INCIDENT_TYPE_TRANSLATIONS,
    'status_label':     STATUS_TRANSLATIONS,
    'incident_status':  INCIDENT_STATUS_TRANSLATIONS,
    'case_stage':       CASE_STAGE_TRANSLATIONS,
    'patient_gender':   GENDER_TRANSLATIONS,
    'combat_service':   COMBAT_SERVICE_TRANSLATIONS,
    'insurance':        INSURANCE_TRANSLATIONS,
    'call_source':      CALL_SOURCE_TRANSLATIONS,
    'ccc_official':     CCC_OFFICIAL_TRANSLATIONS,
    'incident_manager': INCIDENT_MANAGER_TRANSLATIONS,
    'supervisor':       SUPERVISOR_TRANSLATIONS,
}

_PLAIN_TEXT_BODY_FIELDS = (
    'description', 'caller_info', 'in_request_at', 'closed_at',
    'closure_locating_point', 'closure_summary', 'closure_lessons', 'city',
)


@incidents_bp.route('/api/staff/incidents/<int:local_id>', methods=['PATCH'])
def staff_update_incident(local_id):
    """Admin-only edit of an incident's own details — written straight
    through to its Monday.com item. Monday stays the source of truth; this
    is the write path that lets staff manage a case through the app instead
    of switching over to Monday's own UI."""
    from flask import request

    if _staff_role_check(admin_only=True) is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    incident = db.session.get(Incident, local_id)
    if incident is None:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    body = request.get_json(silent=True) or {}
    fields: dict = {}

    for field, translations in _LABEL_FIELD_VALIDATORS.items():
        if field not in body:
            continue
        value = body[field]
        if value not in translations.values():
            return jsonify({'success': False, 'message': f'Invalid value for {field}.'}), 400
        fields[field] = value

    for field in _PLAIN_TEXT_BODY_FIELDS:
        if field in body and body[field] is not None:
            fields[field] = str(body[field]).strip()[:5000]

    if 'patient_phone' in body and body['patient_phone'] is not None:
        fields['patient_phone'] = str(body['patient_phone']).strip()[:40]

    if 'patient_age' in body and body['patient_age'] is not None:
        try:
            fields['patient_age'] = max(0, min(150, int(body['patient_age'])))
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'Invalid patient age.'}), 400

    if 'life_threatening' in body:
        fields['life_threatening'] = bool(body['life_threatening'])

    if body.get('country_code'):
        country_code = str(body['country_code']).strip().upper()
        if country_code not in COUNTRY_NAME_BY_CODE:
            return jsonify({'success': False, 'message': 'Invalid country.'}), 400
        fields['country_code'] = country_code

    if not fields:
        return jsonify({'success': True, 'warnings': []}), 200

    ok, warnings = update_incident(item_id=incident.monday_item_id, fields=fields)
    if not ok:
        return jsonify({'success': False, 'message': "Could not save changes to Monday.com — this incident may not have a valid Monday item. Please try again shortly."}), 502

    # A few fields have a local override that _serialize_incident prefers
    # over Monday's own column — without updating it here too, an edit
    # would write to Monday but never actually show up anywhere in the app.
    if 'description' in fields:
        incident.submitted_description = fields['description']
    if 'city' in fields:
        incident.submitted_location = fields['city']
    if 'patient_phone' in fields:
        incident.submitted_patient_phone = fields['patient_phone']
    db.session.commit()

    return jsonify({'success': True, 'warnings': warnings}), 200


@incidents_bp.route('/api/staff/incidents/<int:local_id>/tasks', methods=['POST'])
def staff_incident_tasks(local_id):
    from flask import request

    # Creating a task is an admin-only action — volunteers can work the task
    # list an admin set up, not define it.
    if _incident_staff_check(local_id, admin_only=True) is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    incident = db.session.get(Incident, local_id)
    if incident is None:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    body = request.get_json(silent=True) or {}
    title = str(body.get('title', '')).strip()[:300]
    if not title:
        return jsonify({'success': False, 'message': 'Title is required.'}), 400
    try:
        assignee = IncidentTaskAssignee(str(body.get('assignee', 'staff')))
    except ValueError:
        return jsonify({'success': False, 'message': 'assignee must be "user" or "staff".'}), 400

    task = incident_service.create_task(
        incident_id=incident.id,
        assignee=assignee.value,
        title=title,
        description=str(body.get('description', '')).strip()[:2000] or None,
        sort_order=int(body.get('sort_order', 0) or 0),
    )
    return jsonify({'success': True, 'task': _serialize_task(task)}), 200


@incidents_bp.route('/api/staff/incidents/<int:local_id>/tasks/<int:task_id>', methods=['PATCH', 'DELETE'])
def staff_incident_task_detail(local_id, task_id):
    from flask import request

    if request.method == 'DELETE':
        # Deleting a task is admin-only, same reasoning as creating one.
        if _incident_staff_check(local_id, admin_only=True) is None:
            return jsonify({'success': False, 'message': 'Forbidden'}), 403
        task = db.session.get(IncidentTask, task_id)
        if task is None or task.incident_id != local_id:
            return jsonify({'success': False, 'message': 'Not found'}), 404
        incident_service.delete_task(task)
        return jsonify({'success': True}), 200

    body = request.get_json(silent=True) or {}
    # A volunteer may only toggle status (mark done/pending) — editing the
    # task's title/description/order is admin-only, same reasoning as above.
    only_status = set(body.keys()) <= {'status'}
    if _incident_staff_check(local_id, admin_only=not only_status) is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    task = db.session.get(IncidentTask, task_id)
    if task is None or task.incident_id != local_id:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    try:
        updated = incident_service.update_task(
            task,
            title=(str(body['title']).strip()[:300] if 'title' in body else None),
            description=(str(body['description']).strip()[:2000] if 'description' in body else None),
            status=body.get('status'),
            sort_order=(int(body['sort_order']) if 'sort_order' in body else None),
        )
    except ValueError:
        return jsonify({'success': False, 'message': 'status must be "pending" or "done".'}), 400

    return jsonify({'success': True, 'task': _serialize_task(updated)}), 200


@incidents_bp.route('/api/staff/incidents/<int:local_id>/volunteer-request', methods=['POST'])
def request_incident_volunteer(local_id):
    """A volunteer asks to actively assist this incident — admin approval
    is required (see approve/deny below) before it grants the fuller detail
    view and task-status actions."""
    if _staff_role_check() is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    incident = db.session.get(Incident, local_id)
    if incident is None:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    user = current_user()
    request_row = incident_service.request_to_volunteer(incident=incident, user=user)
    db.session.commit()
    return jsonify({'success': True, 'approved': request_row.approved_at is not None}), 200


@incidents_bp.route('/api/staff/incidents/<int:local_id>/volunteers/<int:request_id>/approve', methods=['POST'])
def approve_incident_volunteer(local_id, request_id):
    if _staff_role_check(admin_only=True) is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    request_row = db.session.get(IncidentVolunteer, request_id)
    if request_row is None or request_row.incident_id != local_id:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    incident_service.approve_volunteer_request(request_row)
    db.session.commit()
    return jsonify({'success': True}), 200


@incidents_bp.route('/api/staff/incidents/<int:local_id>/volunteers/<int:request_id>', methods=['DELETE'])
def deny_incident_volunteer(local_id, request_id):
    """Deny a pending request, or revoke an already-approved volunteer —
    both are just removing the row; nothing else distinguishes them."""
    if _staff_role_check(admin_only=True) is None:
        return jsonify({'success': False, 'message': 'Forbidden'}), 403

    request_row = db.session.get(IncidentVolunteer, request_id)
    if request_row is None or request_row.incident_id != local_id:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    db.session.delete(request_row)
    db.session.commit()
    return jsonify({'success': True}), 200


@incidents_bp.route('/api/health')
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()}), 200
