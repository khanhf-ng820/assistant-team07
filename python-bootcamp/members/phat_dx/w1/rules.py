"""W1-3: Academic eligibility rules for thesis registration.

Two functions:
* ``can_register_thesis(credits, gpa)`` – boolean eligibility check.
* ``missing(credits, gpa)``             – human-readable gap analysis.
"""

from __future__ import annotations

MIN_CREDITS: int = 120
MIN_GPA: float = 2.0


def can_register_thesis(credits: int, gpa: float) -> bool:
    """Return ``True`` if the student meets **both** thesis requirements.

    Requirements: >= 120 accumulated credits **and** GPA >= 2.0.

    Parameters
    ----------
    credits : int
        Total credits the student has completed.
    gpa : float
        Cumulative Grade Point Average (scale 0–4).

    Examples
    --------
    >>> can_register_thesis(120, 2.5)
    True
    >>> can_register_thesis(100, 3.0)
    False
    """
    return credits >= MIN_CREDITS and gpa >= MIN_GPA


def missing(credits: int, gpa: float) -> list[str]:
    """Return a list of unmet requirements (empty when fully eligible).

    Each entry is a short, user-friendly sentence explaining what is
    still needed.

    Parameters
    ----------
    credits : int
        Total credits the student has completed.
    gpa : float
        Cumulative Grade Point Average (scale 0–4).

    Returns
    -------
    list[str]
        Zero, one, or two reason strings.

    Examples
    --------
    >>> missing(100, 1.8)
    ['Need 20 more credits (have 100/120)', 'Need 0.2 higher GPA (have 1.8/2.0)']
    >>> missing(130, 3.5)
    []
    """
    reasons: list[str] = []
    if credits < MIN_CREDITS:
        gap = MIN_CREDITS - credits
        reasons.append(f"Need {gap} more credits (have {credits}/{MIN_CREDITS})")
    if gpa < MIN_GPA:
        gap = round(MIN_GPA - gpa, 2)
        reasons.append(f"Need {gap} higher GPA (have {gpa}/{MIN_GPA})")
    return reasons
