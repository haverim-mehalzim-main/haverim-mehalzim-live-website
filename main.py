import os
from app import create_app

app = create_app()

if __name__ == '__main__':
    # Local development entry point only. In production the app is served by
    # gunicorn (see render.yaml), which imports `app` directly and never runs
    # this block. Debug is OFF unless FLASK_DEBUG is explicitly set — the
    # Werkzeug debugger must never be enabled in production (it exposes source
    # code and an interactive console to any visitor who triggers an error).
    debug = os.getenv('FLASK_DEBUG', '').lower() in ('1', 'true', 'yes')
    port  = int(os.getenv('PORT', '5000'))
    # threaded=True: several routes make a blocking outbound call (Monday.com,
    # Tranzila, Brevo) — without this, Werkzeug's dev server handles one
    # request at a time and can drop/reset a request from a proxy (e.g. the
    # Vite dev server) sitting in front of it while a prior request is still
    # blocked on one of those calls. gunicorn (production) is unaffected either way.
    app.run(debug=debug, host='0.0.0.0', port=port, threaded=True)
