"""W1-1: Grade statistics summary.

Provides a single function `summary()` that computes basic descriptive
statistics (min, max, mean, median) for a list of numeric scores.
"""

from __future__ import annotations

import statistics


def summary(scores: list[float]) -> dict[str, float]:
    """Return min, max, mean and median of *scores*, each rounded to 2 d.p.

    Parameters
    ----------
    scores : list[float]
        A non-empty sequence of numeric grade values.

    Returns
    -------
    dict[str, float]
        Keys: ``"min"``, ``"max"``, ``"mean"``, ``"median"``.

    Raises
    ------
    ValueError
        If *scores* is empty.

    Examples
    --------
    >>> summary([7, 8, 9, 10, 6])
    {'min': 6.0, 'max': 10.0, 'mean': 8.0, 'median': 8.0}
    """
    if not scores:
        raise ValueError("scores must not be empty")

    return {
        "min":    round(float(min(scores)), 2),
        "max":    round(float(max(scores)), 2),
        "mean":   round(float(statistics.mean(scores)), 2),
        "median": round(float(statistics.median(scores)), 2),
    }
