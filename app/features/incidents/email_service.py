"""
Email service — sends the donor thank-you email through Brevo's transactional
API (https://api.brevo.com/v3/smtp/email) after a CONFIRMED donation.

Design mirrors payment_service: STATELESS and best-effort. Sending never raises
into the notify flow — a mail failure must not stop us from recording the money
or cause Tranzila to retry. Every send is logged; failures return False.

The thank-you email carries three things the donor asked for:
  1. A warm thank-you letter (RTL Hebrew, matching the site's language).
  2. The donor's PERMANENT personal impact link  →  /my-impact/<token>
     (the same token stored on the Donors board; lets them see their lifetime
     impact at any time — the link never changes).
  3. A link to follow the specific incident they funded  →  /track/<incident_id>
     (the public case-tracker page). Omitted when the donation is not tied to a
     specific incident.

Config (app.config):
  BREVO_API_KEY         — secret; when unset, is_configured() is False and we skip
  EMAIL_SENDER_NAME     — display name on the From header
  EMAIL_SENDER_ADDRESS  — verified Brevo sender / authenticated-domain address
  EMAIL_REPLY_TO        — where replies go
  PUBLIC_BASE_URL       — absolute base for the impact / track links
"""

import html
import requests

from app.config import (
    BREVO_API_KEY,
    EMAIL_SENDER_NAME,
    EMAIL_SENDER_ADDRESS,
    EMAIL_REPLY_TO,
    PUBLIC_BASE_URL,
)

_BREVO_URL = "https://api.brevo.com/v3/smtp/email"

# Brevo currency code (as echoed by Tranzila) → display symbol.
_CURRENCY_SYMBOL = {"1": "₪", "2": "$"}


def is_configured() -> bool:
    return bool(BREVO_API_KEY and EMAIL_SENDER_ADDRESS and PUBLIC_BASE_URL)


def _format_amount(amount: float, currency: str) -> str:
    symbol = _CURRENCY_SYMBOL.get(str(currency or "").strip(), "₪")
    # Whole shekels/dollars read cleaner without trailing .00 on round amounts.
    if float(amount).is_integer():
        return f"{symbol}{int(amount):,}"
    return f"{symbol}{amount:,.2f}"


def _first_name(name: str) -> str:
    name = (name or "").strip()
    return name.split()[0] if name else ""


def send_verification_email(to_email: str, to_name: str, verify_url: str) -> bool:
    """Send the "confirm your email" link required before a new account can
    log in (see app/services/auth_service.py). Same best-effort contract as
    send_donation_thankyou: never raises, returns True/False."""
    if not is_configured():
        print("[email_service] BREVO_API_KEY / sender / PUBLIC_BASE_URL not set — skipping verification email")
        return False
    if not to_email:
        print("[email_service] no recipient email — skipping verification email")
        return False

    first_name = _first_name(to_name)
    he_greeting = f"שלום {html.escape(first_name)}," if first_name else "שלום,"
    en_greeting = f"Hi {html.escape(first_name)}," if first_name else "Hi there,"

    html_body = f"""<!DOCTYPE html>
<html lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;
                    font-family:'Segoe UI',Arial,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.06);">
        <tr>
          <td style="background:#0f172a;padding:26px 32px;text-align:center;">
            <div style="color:#5eead4;font-size:13px;letter-spacing:2px;font-weight:700;">חברים מחלצים</div>
            <div style="color:#e5e7eb;font-size:12px;margin-top:4px;">HAVERIM MEHALZIM</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;direction:rtl;text-align:right;">
            <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">אימות כתובת אימייל</h1>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1f2937;">{he_greeting}</p>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1f2937;">
              כדי להפעיל את החשבון שלכם, יש לאשר את כתובת האימייל הזו. הקישור בתוקף ל-24 שעות.
            </p>
            <div style="text-align:center;">{_button(verify_url, "אימות כתובת האימייל שלי ←", True)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px;direction:ltr;text-align:left;border-top:1px dashed #cbd5e1;">
            <h1 style="margin:24px 0 12px;font-size:20px;color:#0f172a;">Confirm your email</h1>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1f2937;">{en_greeting}</p>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1f2937;">
              To activate your account, please confirm this email address. This link expires in 24 hours.
            </p>
            <div style="text-align:center;">{_button(verify_url, "Confirm my email →", True)}</div>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #eceff3;">
            <div style="font-size:12px;color:#9ca3af;line-height:1.6;">
              חברים מחלצים · Haverim Mehalzim<br>
              אם לא ביקשתם זאת, ניתן להתעלם מהודעה זו · If you didn't request this, you can ignore this email.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    text_body = "\n".join([
        he_greeting, "", "כדי להפעיל את החשבון שלכם, יש לאשר את כתובת האימייל שלכם (בתוקף ל-24 שעות):", verify_url,
        "", "──────────  ENGLISH  ──────────", "",
        en_greeting, "", "To activate your account, please confirm your email address (link expires in 24 hours):", verify_url,
    ])

    payload = {
        "sender":      {"name": EMAIL_SENDER_NAME, "email": EMAIL_SENDER_ADDRESS},
        "to":          [{"email": to_email, "name": (to_name or "").strip() or to_email}],
        "replyTo":     {"email": EMAIL_REPLY_TO, "name": EMAIL_SENDER_NAME},
        "subject":     "אימות כתובת אימייל | Confirm your email",
        "htmlContent": html_body,
        "textContent": text_body,
        "tags":        ["email-verification"],
    }
    headers = {
        "api-key":      BREVO_API_KEY,
        "content-type": "application/json",
        "accept":       "application/json",
    }

    try:
        resp = requests.post(_BREVO_URL, json=payload, headers=headers, timeout=15)
        if resp.status_code // 100 == 2:
            print(f"[email_service] verification email sent to {to_email}")
            return True
        print(f"[email_service] Brevo error {resp.status_code}: {resp.text[:300]}")
        return False
    except Exception as e:
        print(f"[email_service] send failed: {e}")
        return False


def send_donation_thankyou(
    donor_name: str,
    donor_email: str,
    amount: float,
    currency: str,
    token: str | None,
    incident_id: str | None,
) -> bool:
    """
    Send the post-donation thank-you email. Returns True on a 2xx from Brevo,
    False on any misconfiguration / failure (always logged, never raised).
    """
    if not is_configured():
        print("[email_service] BREVO_API_KEY / sender / PUBLIC_BASE_URL not set — skipping thank-you email")
        return False
    if not donor_email:
        print("[email_service] no donor email — skipping thank-you email")
        return False

    impact_url = f"{PUBLIC_BASE_URL}/my-impact/{token}" if token else ""
    track_url  = f"{PUBLIC_BASE_URL}/track/{incident_id}" if incident_id else ""

    subject = "תודה על תרומתך ❤️ | Thank you for your donation"
    html_body = _build_html(
        first_name=_first_name(donor_name),
        amount_str=_format_amount(amount, currency),
        impact_url=impact_url,
        track_url=track_url,
    )
    text_body = _build_text(
        first_name=_first_name(donor_name),
        amount_str=_format_amount(amount, currency),
        impact_url=impact_url,
        track_url=track_url,
    )

    payload = {
        "sender":      {"name": EMAIL_SENDER_NAME, "email": EMAIL_SENDER_ADDRESS},
        "to":          [{"email": donor_email, "name": (donor_name or "").strip() or donor_email}],
        "replyTo":     {"email": EMAIL_REPLY_TO, "name": EMAIL_SENDER_NAME},
        "subject":     subject,
        "htmlContent": html_body,
        "textContent": text_body,
        "tags":        ["donation-thankyou"],
    }
    headers = {
        "api-key":      BREVO_API_KEY,
        "content-type": "application/json",
        "accept":       "application/json",
    }

    try:
        resp = requests.post(_BREVO_URL, json=payload, headers=headers, timeout=15)
        if resp.status_code // 100 == 2:
            print(f"[email_service] thank-you email sent to {donor_email}")
            return True
        print(f"[email_service] Brevo error {resp.status_code}: {resp.text[:300]}")
        return False
    except Exception as e:
        print(f"[email_service] send failed: {e}")
        return False


# ── HTML / text composition ──────────────────────────────────────────────────

def _button(url: str, label: str, primary: bool) -> str:
    bg     = "#0d9488" if primary else "#ffffff"
    color  = "#ffffff" if primary else "#0d9488"
    border = "#0d9488"
    return (
        f'<a href="{html.escape(url)}" '
        f'style="display:inline-block;padding:13px 26px;margin:6px 0;'
        f'background:{bg};color:{color};border:2px solid {border};'
        f'border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;">'
        f'{html.escape(label)}</a>'
    )


def _hebrew_section(first_name: str, amount_str: str, impact_url: str, track_url: str) -> str:
    greeting = f"שלום {html.escape(first_name)}," if first_name else "שלום,"

    impact_block = ""
    if impact_url:
        impact_block = f"""
          <p style="margin:22px 0 6px;font-size:15px;line-height:1.7;color:#1f2937;">
            רצינו שתדעו בדיוק לאן הולכת התרומה שלכם. הכנו לכם עמוד אישי וקבוע
            שבו תוכלו לראות בכל רגע את האימפקט המצטבר שלכם — כמה משימות מימנתם
            וכמה חיים עזרתם להציל:
          </p>
          <div style="text-align:center;">{_button(impact_url, "לצפייה באימפקט האישי שלי ←", True)}</div>
          <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
            הקישור הזה קבוע ואישי — שמרו אותו וחזרו אליו מתי שתרצו.
          </p>
        """

    track_block = ""
    if track_url:
        track_block = f"""
          <p style="margin:22px 0 6px;font-size:15px;line-height:1.7;color:#1f2937;">
            כדי לעקוב אחר ההתקדמות של האירוע שאותו תרמתם לסייע בו, לחצו כאן:
          </p>
          <div style="text-align:center;">{_button(track_url, "מעקב אחר האירוע ←", False)}</div>
        """

    return f"""
      <td style="padding:32px;direction:rtl;text-align:right;">
        <div style="display:inline-block;background:#ecfeff;color:#0d9488;font-size:11px;font-weight:700;
                    letter-spacing:1px;padding:4px 12px;border-radius:999px;margin-bottom:16px;">עברית</div>
        <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">תודה מכל הלב ❤️</h1>
        <p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#1f2937;">{greeting}</p>
        <p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#1f2937;">
          תרומתכם בסך <strong>{html.escape(amount_str)}</strong> התקבלה בהצלחה, ואנחנו אסירי תודה.
          בזכות אנשים כמוכם אנחנו יכולים להיות שם בשביל ישראלים ויהודים בסכנת חיים בכל רחבי העולם,
          בכל שעה ובכל מקום.
        </p>
        {impact_block}
        {track_block}
        <p style="margin:26px 0 4px;font-size:15px;line-height:1.7;color:#1f2937;">
          בהוקרה ובהערכה,<br><strong>צוות חברים מחלצים</strong>
        </p>
      </td>
    """


def _english_section(first_name: str, amount_str: str, impact_url: str, track_url: str) -> str:
    greeting = f"Dear {html.escape(first_name)}," if first_name else "Dear friend,"

    impact_block = ""
    if impact_url:
        impact_block = f"""
          <p style="margin:22px 0 6px;font-size:15px;line-height:1.7;color:#1f2937;">
            We want you to see exactly where your donation goes. We've created a
            permanent personal page where you can see your cumulative impact at
            any time — how many missions you've funded and how many lives you've
            helped save:
          </p>
          <div style="text-align:center;">{_button(impact_url, "View my personal impact →", True)}</div>
          <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
            This link is permanent and personal — save it and come back anytime.
          </p>
        """

    track_block = ""
    if track_url:
        track_block = f"""
          <p style="margin:22px 0 6px;font-size:15px;line-height:1.7;color:#1f2937;">
            To follow the progress of the case you helped support, click here:
          </p>
          <div style="text-align:center;">{_button(track_url, "Track this case →", False)}</div>
        """

    return f"""
      <td style="padding:32px;direction:ltr;text-align:left;">
        <div style="display:inline-block;background:#ecfeff;color:#0d9488;font-size:11px;font-weight:700;
                    letter-spacing:1px;padding:4px 12px;border-radius:999px;margin-bottom:16px;">ENGLISH</div>
        <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">Thank you from the bottom of our hearts ❤️</h1>
        <p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#1f2937;">{greeting}</p>
        <p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#1f2937;">
          Your donation of <strong>{html.escape(amount_str)}</strong> was received successfully, and we are
          deeply grateful. Because of people like you, we can be there for Israelis and Jewish people
          whose lives are in danger anywhere in the world, at any hour.
        </p>
        {impact_block}
        {track_block}
        <p style="margin:26px 0 4px;font-size:15px;line-height:1.7;color:#1f2937;">
          With gratitude and appreciation,<br><strong>The Haverim Mehalzim team</strong>
        </p>
      </td>
    """


def _build_html(first_name: str, amount_str: str, impact_url: str, track_url: str) -> str:
    hebrew  = _hebrew_section(first_name, amount_str, impact_url, track_url)
    english = _english_section(first_name, amount_str, impact_url, track_url)

    # A clear, unmistakable divider between the two language versions.
    divider = """
      <td style="padding:0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-top:1px dashed #cbd5e1;"></td>
            <td style="padding:0 14px;white-space:nowrap;font-size:11px;font-weight:700;
                       letter-spacing:1px;color:#94a3b8;">עברית ↑ &nbsp;·&nbsp; ENGLISH ↓</td>
            <td style="border-top:1px dashed #cbd5e1;"></td>
          </tr>
        </table>
      </td>
    """

    return f"""<!DOCTYPE html>
<html lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;
                    font-family:'Segoe UI',Arial,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.06);">
        <tr>
          <td style="background:#0f172a;padding:26px 32px;text-align:center;">
            <div style="color:#5eead4;font-size:13px;letter-spacing:2px;font-weight:700;">חברים מחלצים</div>
            <div style="color:#e5e7eb;font-size:12px;margin-top:4px;">HAVERIM MEHALZIM</div>
          </td>
        </tr>
        <tr>{hebrew}</tr>
        <tr>{divider}</tr>
        <tr>{english}</tr>
        <tr>
          <td style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #eceff3;">
            <div style="font-size:12px;color:#9ca3af;line-height:1.6;">
              חברים מחלצים · Haverim Mehalzim<br>
              מייל זה נשלח אליכם בעקבות תרומה שביצעתם · This email was sent to you following your donation.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _build_text(first_name: str, amount_str: str, impact_url: str, track_url: str) -> str:
    he_greeting = f"שלום {first_name}," if first_name else "שלום,"
    he = [
        he_greeting,
        "",
        f"תרומתכם בסך {amount_str} התקבלה בהצלחה — תודה מכל הלב!",
        "בזכותכם אנחנו יכולים להיות שם בשביל ישראלים ויהודים בסכנת חיים בכל רחבי העולם.",
    ]
    if impact_url:
        he += ["", "לצפייה באימפקט האישי והקבוע שלכם:", impact_url]
    if track_url:
        he += ["", "למעקב אחר האירוע שתרמתם לסייע בו:", track_url]
    he += ["", "בהוקרה,", "צוות חברים מחלצים"]

    en_greeting = f"Dear {first_name}," if first_name else "Dear friend,"
    en = [
        en_greeting,
        "",
        f"Your donation of {amount_str} was received successfully — thank you from the bottom of our hearts!",
        "Because of you, we can be there for Israelis and Jewish people whose lives are in danger anywhere in the world.",
    ]
    if impact_url:
        en += ["", "View your permanent personal impact page:", impact_url]
    if track_url:
        en += ["", "Track the case you helped support:", track_url]
    en += ["", "With gratitude,", "The Haverim Mehalzim team"]

    divider = ["", "──────────  ENGLISH  ──────────", ""]
    return "\n".join(he + divider + en)
