import os
from datetime import timedelta

from flask import Flask, request, redirect, send_from_directory
from flask_cors import CORS

from app import config
from app.extensions import db, migrate

_DIST = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')

# Path prefixes that must never be indexed by search engines. Kept out of
# robots.txt on purpose — that file is public, so listing sensitive paths
# there would advertise them. A noindex header protects without disclosing.
_NOINDEX_PREFIXES = ('/admin/', '/my-impact/', '/track/', '/api/', '/donate/', '/account')


def create_app():
    app = Flask(__name__)
    CORS(app)

    app.config['SQLALCHEMY_DATABASE_URI'] = config.SQLALCHEMY_DATABASE_URI
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'pool_pre_ping': True}
    db.init_app(app)
    migrate.init_app(app, db, directory=os.path.join(os.path.dirname(__file__), '..', 'migrations'))

    # Session cookie (login state) — server-side session, same-origin since
    # the SPA is served by this same Flask app. SECRET_KEY must be a fixed
    # value in production (set FLASK_SECRET_KEY there); an ephemeral one here
    # would log everyone out on every restart/deploy.
    app.config['SECRET_KEY'] = config.SECRET_KEY
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = True
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

    from app import models  # noqa: F401 — registers models on db.metadata before migrations run

    # API routes
    from app.features.incidents.routes import incidents_bp
    from app.features.auth.routes import auth_bp
    app.register_blueprint(incidents_bp)
    app.register_blueprint(auth_bp)

    # Tranzila POSTs the payment result back to the redirect URLs. The SPA
    # fallback below only serves GET, so a POST would 405. Bounce it to GET
    # (303) so React renders the thanks/failed page cleanly and a refresh
    # doesn't re-submit.
    @app.route('/donate/thanks', methods=['POST'])
    @app.route('/donate/failed', methods=['POST'])
    def donate_result_post():
        return redirect(request.path, code=303)

    # Serve React build for every non-API route
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_react(path: str):
        target = os.path.join(_DIST, path)
        if path and os.path.isfile(target):
            return send_from_directory(_DIST, path)
        return send_from_directory(_DIST, 'index.html')

    @app.after_request
    def add_security_headers(response):
        if request.path.startswith(_NOINDEX_PREFIXES):
            response.headers['X-Robots-Tag'] = 'noindex, nofollow'
        response.headers['X-Content-Type-Options']  = 'nosniff'
        response.headers['X-XSS-Protection']        = '1; mode=block'
        response.headers['Referrer-Policy']         = 'strict-origin-when-cross-origin'
        response.headers['X-Frame-Options']         = 'SAMEORIGIN'
        response.headers['Permissions-Policy']      = 'geolocation=(), microphone=(), camera=()'
        return response

    return app
