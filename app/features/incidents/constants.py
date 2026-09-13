GROUP_OPENED = "נפתח אירוע"
INCIDENT_HANDLED_BY_RON = "טופל על ידי רון"
SIGNIFICANT_INCIDENT = "אירוע משמעותי"

# status_mkmbjwef values — used by the map layer
MAP_LIVE_STATUSES     = {'Live', 'Active', 'Working on it'}
MAP_HANDLED_STATUSES  = {'Done', 'Completed'}

# status_mkmbjwef value set on a freshly self-service-opened incident (see
# create_incident in service.py). Deliberately outside both sets above — an
# unreviewed incident must not show on the live map or count as handled until
# staff have actually looked at it and set a real status themselves.
NEW_REQUEST_STATUS = "New Request by User"

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

# color_mkngmw3 (patient/victim gender) Hebrew → English translations
GENDER_TRANSLATIONS = {
    'זכר':  'Male',
    'נקבה': 'Female',
    'אחר':  'Other',
}

# ISO-3166-1 alpha-2 country list for the "Open a Call" form's Country field.
# Monday's country_mkmb91h3 column is a structured "country" type — writing to
# it requires BOTH a valid ISO-2 code and matching name (see create_incident
# in service.py); a free-text guess isn't accepted the way a status label is.
# Served to the frontend via /api/countries so the dropdown and the value we
# actually write can never drift apart — same reasoning as
# INCIDENT_TYPE_TRANSLATIONS / get_incident_types.
COUNTRIES = [
    ("AF", "Afghanistan"), ("AL", "Albania"), ("DZ", "Algeria"), ("AD", "Andorra"),
    ("AO", "Angola"), ("AG", "Antigua and Barbuda"), ("AR", "Argentina"), ("AM", "Armenia"),
    ("AU", "Australia"), ("AT", "Austria"), ("AZ", "Azerbaijan"), ("BS", "Bahamas"),
    ("BH", "Bahrain"), ("BD", "Bangladesh"), ("BB", "Barbados"), ("BY", "Belarus"),
    ("BE", "Belgium"), ("BZ", "Belize"), ("BJ", "Benin"), ("BT", "Bhutan"),
    ("BO", "Bolivia"), ("BA", "Bosnia and Herzegovina"), ("BW", "Botswana"), ("BR", "Brazil"),
    ("BN", "Brunei"), ("BG", "Bulgaria"), ("BF", "Burkina Faso"), ("BI", "Burundi"),
    ("CV", "Cabo Verde"), ("KH", "Cambodia"), ("CM", "Cameroon"), ("CA", "Canada"),
    ("CF", "Central African Republic"), ("TD", "Chad"), ("CL", "Chile"), ("CN", "China"),
    ("CO", "Colombia"), ("KM", "Comoros"), ("CG", "Congo"), ("CD", "Congo (DRC)"),
    ("CR", "Costa Rica"), ("CI", "Côte d'Ivoire"), ("HR", "Croatia"), ("CU", "Cuba"),
    ("CY", "Cyprus"), ("CZ", "Czechia"), ("DK", "Denmark"), ("DJ", "Djibouti"),
    ("DM", "Dominica"), ("DO", "Dominican Republic"), ("EC", "Ecuador"), ("EG", "Egypt"),
    ("SV", "El Salvador"), ("GQ", "Equatorial Guinea"), ("ER", "Eritrea"), ("EE", "Estonia"),
    ("SZ", "Eswatini"), ("ET", "Ethiopia"), ("FJ", "Fiji"), ("FI", "Finland"),
    ("FR", "France"), ("GA", "Gabon"), ("GM", "Gambia"), ("GE", "Georgia"),
    ("DE", "Germany"), ("GH", "Ghana"), ("GR", "Greece"), ("GD", "Grenada"),
    ("GT", "Guatemala"), ("GN", "Guinea"), ("GW", "Guinea-Bissau"), ("GY", "Guyana"),
    ("HT", "Haiti"), ("HN", "Honduras"), ("HK", "Hong Kong"), ("HU", "Hungary"),
    ("IS", "Iceland"), ("IN", "India"), ("ID", "Indonesia"), ("IR", "Iran"),
    ("IQ", "Iraq"), ("IE", "Ireland"), ("IL", "Israel"), ("IT", "Italy"),
    ("JM", "Jamaica"), ("JP", "Japan"), ("JO", "Jordan"), ("KZ", "Kazakhstan"),
    ("KE", "Kenya"), ("KI", "Kiribati"), ("KW", "Kuwait"), ("KG", "Kyrgyzstan"),
    ("LA", "Laos"), ("LV", "Latvia"), ("LB", "Lebanon"), ("LS", "Lesotho"),
    ("LR", "Liberia"), ("LY", "Libya"), ("LI", "Liechtenstein"), ("LT", "Lithuania"),
    ("LU", "Luxembourg"), ("MO", "Macao"), ("MG", "Madagascar"), ("MW", "Malawi"),
    ("MY", "Malaysia"), ("MV", "Maldives"), ("ML", "Mali"), ("MT", "Malta"),
    ("MH", "Marshall Islands"), ("MR", "Mauritania"), ("MU", "Mauritius"), ("MX", "Mexico"),
    ("FM", "Micronesia"), ("MD", "Moldova"), ("MC", "Monaco"), ("MN", "Mongolia"),
    ("ME", "Montenegro"), ("MA", "Morocco"), ("MZ", "Mozambique"), ("MM", "Myanmar"),
    ("NA", "Namibia"), ("NR", "Nauru"), ("NP", "Nepal"), ("NL", "Netherlands"),
    ("NZ", "New Zealand"), ("NI", "Nicaragua"), ("NE", "Niger"), ("NG", "Nigeria"),
    ("KP", "North Korea"), ("MK", "North Macedonia"), ("NO", "Norway"), ("OM", "Oman"),
    ("PK", "Pakistan"), ("PW", "Palau"), ("PS", "Palestine"), ("PA", "Panama"),
    ("PG", "Papua New Guinea"), ("PY", "Paraguay"), ("PE", "Peru"), ("PH", "Philippines"),
    ("PL", "Poland"), ("PT", "Portugal"), ("QA", "Qatar"), ("RO", "Romania"),
    ("RU", "Russia"), ("RW", "Rwanda"), ("KN", "Saint Kitts and Nevis"), ("LC", "Saint Lucia"),
    ("VC", "Saint Vincent and the Grenadines"), ("WS", "Samoa"), ("SM", "San Marino"),
    ("ST", "Sao Tome and Principe"), ("SA", "Saudi Arabia"), ("SN", "Senegal"), ("RS", "Serbia"),
    ("SC", "Seychelles"), ("SL", "Sierra Leone"), ("SG", "Singapore"), ("SK", "Slovakia"),
    ("SI", "Slovenia"), ("SB", "Solomon Islands"), ("SO", "Somalia"), ("ZA", "South Africa"),
    ("KR", "South Korea"), ("SS", "South Sudan"), ("ES", "Spain"), ("LK", "Sri Lanka"),
    ("SD", "Sudan"), ("SR", "Suriname"), ("SE", "Sweden"), ("CH", "Switzerland"),
    ("SY", "Syria"), ("TW", "Taiwan"), ("TJ", "Tajikistan"), ("TZ", "Tanzania"),
    ("TH", "Thailand"), ("TL", "Timor-Leste"), ("TG", "Togo"), ("TO", "Tonga"),
    ("TT", "Trinidad and Tobago"), ("TN", "Tunisia"), ("TR", "Turkey"), ("TM", "Turkmenistan"),
    ("TV", "Tuvalu"), ("UG", "Uganda"), ("UA", "Ukraine"), ("AE", "United Arab Emirates"),
    ("GB", "United Kingdom"), ("US", "United States"), ("UY", "Uruguay"), ("UZ", "Uzbekistan"),
    ("VU", "Vanuatu"), ("VA", "Vatican City"), ("VE", "Venezuela"), ("VN", "Vietnam"),
    ("YE", "Yemen"), ("ZM", "Zambia"), ("ZW", "Zimbabwe"),
]
COUNTRY_NAME_BY_CODE = dict(COUNTRIES)

# color_mkmby5dg ("חודש") status labels are formatted "<Hebrew month> <year>"
# (e.g. "ספטמבר 2026"). Used to auto-set the incident's month on creation —
# create_labels_if_missing covers any month/year combo not seen on the board
# before. Not user-facing: computed from the server clock at submission time.
HEBREW_MONTHS = {
    1: "ינואר", 2: "פברואר", 3: "מרץ", 4: "אפריל", 5: "מאי", 6: "יוני",
    7: "יולי", 8: "אוגוסט", 9: "ספטמבר", 10: "אוקטובר", 11: "נובמבר", 12: "דצמבר",
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