GROUP_OPENED = "נפתח אירוע"
INCIDENT_HANDLED_BY_RON = "טופל על ידי רון"
SIGNIFICANT_INCIDENT = "אירוע משמעותי"

# status_mkmbjwef values — used by the map layer
MAP_LIVE_STATUSES     = {'Live', 'Active', 'Working on it'}
MAP_HANDLED_STATUSES  = {'Done', 'Completed'}

# status_mkmb1zc6 Hebrew → English translations
INCIDENT_TYPE_TRANSLATIONS = {
    'רפואי':            'Medical',
    'נפשי':             'Mental Health',
    'חילוץ':            'Rescue',
    'איתור':            'Search & Locate',
    'אנטישמיות':        'Antisemitism',
    'חברות מחלצות':     'Sexual Assault',
    'אחר':              'Other',
}

ACTIVE_VOLUNTEERS_COUNT = 30

# ── Donations / payments ─────────────────────────────────────────────────────
# These are plain, hardcoded business constants (NOT read from the environment)
# so a missing/mistyped env var can never break a donation. Edit them here.

# Fixed USD→ILS conversion rate. Used to (a) convert preset package prices for
# display and (b) value a non-USD gift against the impact-link threshold below,
# and to normalise amounts stored on the Donors board to USD. Update when it
# drifts. Shared with the frontend via /api/payment-config so the price a donor
# sees and the server-side threshold check never diverge.
USD_TO_ILS = 3.7

# The personal donor impact page (/my-impact/<token>) is a perk reserved for
# top-tier gifts: only a donation worth this many USD or more generates a token
# and includes the impact link in the thank-you email. 14000 = the "Scoop & Run"
# top package. Donors may pay in any supported currency; the gift is converted to
# USD (via USD_TO_ILS) before it is compared against this bar.
IMPACT_LINK_MIN_USD = 14000

# Average cost in USD to fund one rescue mission. Translates a donor's cumulative
# USD giving into "missions funded" on the my-impact page.
AVG_MISSION_COST = 350

# Cost in USD attributed to saving one life. Used to rank donors on the
# leaderboard (lives saved = cumulative USD // this). Donor amounts are stored in
# USD, so this is USD-denominated too.
COST_PER_LIFE = 5000

# ── Premium membership ───────────────────────────────────────────────────────
# Fixed one-time price for permanent premium status (24/7 availability, plus
# more benefits still being defined). A hardcoded business constant like the
# ones above, not env-driven, for the same reason: a bad/missing env var must
# never change what someone is charged.
PREMIUM_PRICE_USD = 500

# Single plan for now; kept as a named constant (not inlined at call sites) so
# adding a second tier later is a matter of introducing more plan names, not
# hunting down every place "standard" was typed.
PREMIUM_PLAN_DEFAULT = "standard"