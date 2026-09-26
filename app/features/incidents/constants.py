GROUP_OPENED = "נפתח אירוע"
INCIDENT_HANDLED_BY_RON = "טופל על ידי רון"
SIGNIFICANT_INCIDENT = "אירוע משמעותי"

# color_mkvvrm1r ("סיווג הפנייה" — the internal case status HANDLED_STATUSES
# is matched against) Hebrew → English translations. All 6 labels queried
# directly from the board's real column settings — an admin editing this
# through the app must only ever be able to pick a label that actually
# exists on the board, never free text.
STATUS_TRANSLATIONS = {
    'הוחלט בחמ"ל לא לפתוח אירוע': 'Decided Not To Open',
    GROUP_OPENED:                  'Case Opened',
    'טופל על ידי חברת הביטוח':      'Handled By Insurance',
    INCIDENT_HANDLED_BY_RON:       'Handled By Ron',
    'לא נחתם הסכם מתן שירות':       'Service Agreement Not Signed',
    SIGNIFICANT_INCIDENT:          'Significant Incident',
}

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

# status_mkmbjwef ("סטטוס" — the workflow status the map layer already reads,
# see MAP_LIVE_STATUSES/MAP_HANDLED_STATUSES/NEW_REQUEST_STATUS above)
# labels — already English on the board itself, so this is an identity map
# rather than a real translation. Kept in the same {real_label: display_label}
# shape as every other *_TRANSLATIONS dict below so the admin-edit code path
# can treat every choice field uniformly regardless of whether the board's
# own labels happen to be Hebrew or English.
INCIDENT_STATUS_TRANSLATIONS = {
    NEW_REQUEST_STATUS: NEW_REQUEST_STATUS,
    'Working on it':    'Working on it',
    'Done':              'Done',
    'Rejected':          'Rejected',
}

# color_mm32c8wh ("Case Stage" — the public/family case-tracker step this
# drives, see tracker_service.STEP_DEFINITIONS) — already English. Identity
# map, same reasoning as INCIDENT_STATUS_TRANSLATIONS above. Kept as the
# exact real label strings (including the messy near-duplicate "Request
# Received" entries) — every option shown must be one that really exists on
# the board, never a cleaned-up rewrite of it.
CASE_STAGE_TRANSLATIONS = {
    '1. Request Received':                    '1. Request Received',
    'Request Received':                       'Request Received',
    '2. Situation Assessment':                '2. Situation Assessment',
    '3. Critical Information Verified':       '3. Critical Information Verified',
    '4. Case Officer Assigned':               '4. Case Officer Assigned',
    '5. Response Network Activated':          '5. Response Network Activated',
    '6. Action Plan in Motion':               '6. Action Plan in Motion',
    '7. Person’s Status Verified':            '7. Person’s Status Verified',
    '7 (loss). Family Notified with Care':    '7 (loss). Family Notified with Care',
    '8. Support & Next Steps':                '8. Support & Next Steps',
    '8 (loss). Family Support & Next Steps':  '8 (loss). Family Support & Next Steps',
}

# single_selectynfloxz ("שירות מילואים / סדיר קרבי" — is the patient/victim
# in active combat military service) Hebrew → English translations.
COMBAT_SERVICE_TRANSLATIONS = {
    'מילואים קרבי': 'Reserve (Combat)',
    'סדיר קרבי':    'Regular Service (Combat)',
    'לא':           'No',
}

# color_mkmbwnzy ("ביטוח" — the patient/victim's travel/medical insurer)
# Hebrew → English translations. The board also has one blank label
# (position 5) — deliberately excluded, it isn't a real selectable option.
INSURANCE_TRANSLATIONS = {
    'לא ידוע':           'Unknown',
    'ללא':               'None',
    'הראל':              'Harel',
    'פספורטקארד':        'PassportCard',
    'ביטוח ישיר':        'Direct Insurance',
    'לא רלוונטי':        'Not Relevant',
    'כלל':               'Clal',
    'מגדל':              'Migdal',
    'ביטוח לא ישראלי':   'Non-Israeli Insurance',
    'הייתה אזהרת מסע':   'Travel Warning Existed',
    'הפניקס':            'Phoenix',
    'מנורה':             'Menorah',
    'AIG':               'AIG',
    'כיסוי אירופי':      'European Coverage',
}

# color_mkmbpyxw ("איך פנו אלינו" — how this case first reached the org: a
# referral channel, or the name of whoever brought it to us) Hebrew →
# English translations. One blank label (position 5) excluded.
CALL_SOURCE_TRANSLATIONS = {
    'שהה באותו המקום':                    'Was At The Same Location',
    'עומר אביר':                          'Omer Avir',
    'נציג מחב"ד/הצלה Air לא ברור':        'Chabad/Air Rescue Rep — Unclear',
    '?':                                   '?',
    'משרד החוץ בהודו':                    'Foreign Ministry — India',
    'רון':                                'Ron',
    'רץ ברשת':                            'Went Viral Online',
    'יפתח':                               'Yiftach',
    'חמ"ל':                               'War Room (Chamal)',
    'אנחנו פנינו אליהם אחרי פרסום באינסטגרם': 'We Reached Out After Instagram Post',
    'חברים מקומיים של רון':               "Ron's Local Friends",
    'לירן':                               'Liran',
    'בקי':                                'Becky',
    'עידו':                               'Ido',
    'הלל':                                'Hillel',
    'LAYA':                               'LAYA',
    'משרד החוץ בישראל':                   'Foreign Ministry — Israel',
    'מגנוס':                              'Magnus',
    'דני':                                'Danny',
}

# color_mkmbwakp ("כונן/ת" — the duty officer / "CCC Official" on shift when
# the case came in) Hebrew → English. This column is a roster of staff/
# volunteer first names, not a set of categories — one blank label
# (position 5) excluded.
CCC_OFFICIAL_TRANSLATIONS = {
    'מימי':    'Mimi',
    'לירן':    'Liran',
    'רון':     'Ron',
    'יוני':    'Yoni',
    'עידו':    'Ido',
    'שחר דר':  'Shachar Dar',
    'לי-אור':  'Li-Or',
    'נופר':    'Nofar',
    'אביבית':  'Avivit',
    'הלל':     'Hillel',
    'דורון':   'Doron',
    'אחר (להוסיף ידנית אחרי מילוי הטופס)': 'Other (add manually after filling the form)',
    'זיו':     'Ziv',
    'בר':      'Bar',
    'גדעון':   'Gideon',
    'גיא שדות': 'Guy Sadot',
    'עומר':    'Omer',
    'ניר':     'Nir',
    'דור':     'Dor',
    'רוני':    'Roni',
    'גל':      'Gal',
    'גיא גלובקה': 'Guy Globka',
    'יפתח':    'Yiftach',
    'אריאלה':  'Ariela',
}

# status_mkmb9hbk ("מנהל/ת אירוע" — the staff member managing this case)
# Hebrew → English. Another staff-name roster, same reasoning as
# CCC_OFFICIAL_TRANSLATIONS. One blank label (position 5) excluded.
INCIDENT_MANAGER_TRANSLATIONS = {
    'לירן':          'Liran',
    'שחר בן ארצי':   'Shachar Ben Artzi',
    'בקי':           'Becky',
    'נופר':          'Nofar',
    'רון':           'Ron',
    'אבינועם':       'Avinoam',
    'יפתח':          'Yiftach',
    'בר':            'Bar',
    'עידו':          'Ido',
    'זיו':           'Ziv',
    'שרי':           'Sarai',
    'דפנה':          'Dafna',
    'הלל':           'Hillel',
    'יעל':           'Yael',
    'שחר דר':        'Shachar Dar',
    'דור':           'Dor',
    'גיא שדות':      'Guy Sadot',
    'פונדק':         'Pundak',
    'רוני':          'Roni',
    'אפרת אביסרור':  'Efrat Avisror',
    'עומר':          'Omer',
    'גיא גלובקה':    'Guy Globka',
}

# status_mkmb6bm2 ("סופרווייזר" — the supervisor overseeing this case)
# Hebrew → English.
SUPERVISOR_TRANSLATIONS = {
    'בקי':      'Becky',
    'אחיאב':    'Achiav',
    'יפתח':     'Yiftach',
    'רון':      'Ron',
    'אבינועם':  'Avinoam',
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