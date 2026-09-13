import time as _time
from collections import defaultdict

from flask import Blueprint, jsonify, redirect, request, session

from app.config import PUBLIC_BASE_URL
from app.features.incidents import email_service
from app.services.auth_service import (
    AuthError, authenticate, current_user, request_signup, serialize_user_summary, verify_email,
)

auth_bp = Blueprint('auth', __name__)

_signup_rate: dict = defaultdict(lambda: {'count': 0, 'window_start': 0.0})
_SIGNUP_RATE_MAX    = 10
_SIGNUP_RATE_WINDOW = 60

_login_rate: dict = defaultdict(lambda: {'count': 0, 'window_start': 0.0})
_LOGIN_RATE_MAX    = 10
_LOGIN_RATE_WINDOW = 60


def _rate_limited(bucket_store: dict, max_count: int, window: int) -> bool:
    ip = request.remote_addr or 'unknown'
    now = _time.time()
    bucket = bucket_store[ip]
    if now - bucket['window_start'] > window:
        bucket['count'] = 0
        bucket['window_start'] = now
    bucket['count'] += 1
    return bucket['count'] > max_count


@auth_bp.route('/api/auth/signup', methods=['POST'])
def signup():
    if _rate_limited(_signup_rate, _SIGNUP_RATE_MAX, _SIGNUP_RATE_WINDOW):
        return jsonify({'success': False, 'message': 'Too many requests'}), 429

    body = request.get_json(silent=True) or {}
    try:
        user, token = request_signup(
            email=str(body.get('email', '')),
            password=str(body.get('password', '')),
            full_name=str(body.get('full_name', ''))[:120],
            phone=str(body.get('phone', ''))[:40] or None,
        )
    except AuthError as e:
        return jsonify({'success': False, 'message': e.message}), e.status_code

    verify_url = f"{PUBLIC_BASE_URL}/api/auth/verify/{token}"
    sent = email_service.send_verification_email(user.email, user.full_name, verify_url)
    if not sent:
        # The account exists but has no way to be activated — tell the truth
        # rather than claim success on an email that never arrived.
        return jsonify({
            'success': False,
            'message': 'Your account was created, but we could not send the verification email. Please try again shortly.',
        }), 502

    return jsonify({'success': True, 'message': 'Check your email to verify your account.'}), 200


@auth_bp.route('/api/auth/verify/<token>')
def verify(token):
    try:
        user = verify_email(token)
    except AuthError as e:
        return redirect(f"{PUBLIC_BASE_URL}/account?error={e.message}", code=302)

    session.clear()
    session['user_id'] = user.id
    session.permanent = True
    return redirect(f"{PUBLIC_BASE_URL}/account?verified=1", code=302)


@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    if _rate_limited(_login_rate, _LOGIN_RATE_MAX, _LOGIN_RATE_WINDOW):
        return jsonify({'success': False, 'message': 'Too many requests'}), 429

    body = request.get_json(silent=True) or {}
    try:
        user = authenticate(email=str(body.get('email', '')), password=str(body.get('password', '')))
    except AuthError as e:
        return jsonify({'success': False, 'message': e.message}), e.status_code

    session.clear()
    session['user_id'] = user.id
    session.permanent = True
    return jsonify({'success': True, 'user': serialize_user_summary(user)}), 200


@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True}), 200


@auth_bp.route('/api/auth/me')
def me():
    user = current_user()
    if user is None:
        return jsonify({'success': False}), 401
    return jsonify({'success': True, 'user': serialize_user_summary(user)}), 200
