"""Shared money-rounding helper — never do arithmetic on amounts as float."""

from decimal import ROUND_HALF_UP, Decimal


def to_decimal(amount) -> Decimal:
    return Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
