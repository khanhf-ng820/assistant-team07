"""W1-5: Timetable grouping utility.

Groups a flat list of ``(day, subject, room)`` tuples into a dictionary
keyed by weekday, preserving insertion order within each day.
"""

from __future__ import annotations

from collections import defaultdict


def by_day(
    tuples: list[tuple[str, str, str]],
) -> dict[str, list[tuple[str, str]]]:
    """Group timetable entries by weekday.

    Each input tuple has the shape ``(day, subject, room)``.  The output
    maps each unique *day* to a list of ``(subject, room)`` pairs, in
    the order they originally appeared.

    Parameters
    ----------
    tuples : list[tuple[str, str, str]]
        Raw timetable records.  *day* values are treated case-sensitively
        (e.g. ``"Monday"`` ≠ ``"monday"``).

    Returns
    -------
    dict[str, list[tuple[str, str]]]
        ``{day: [(subject, room), …]}``.

    Examples
    --------
    >>> entries = [
    ...     ("Monday",    "Math",    "A101"),
    ...     ("Tuesday",   "Physics", "B202"),
    ...     ("Monday",    "English", "A102"),
    ...     ("Wednesday", "CS",      "C303"),
    ...     ("Tuesday",   "Chem",    "B201"),
    ... ]
    >>> result = by_day(entries)
    >>> result["Monday"]
    [('Math', 'A101'), ('English', 'A102')]
    >>> result["Tuesday"]
    [('Physics', 'B202'), ('Chem', 'B201')]
    """
    grouped: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for day, subject, room in tuples:
        grouped[day].append((subject, room))
    return dict(grouped)
