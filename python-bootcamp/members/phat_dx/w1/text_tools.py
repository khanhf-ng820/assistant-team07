"""W1-2: Text frequency analysis utilities.

Two functions:
* ``word_count(text)``  – full word-frequency dictionary.
* ``top_k(text, k)``    – the *k* most-frequent words, tie-broken alphabetically.
"""

from __future__ import annotations

import re
from collections import Counter


def word_count(text: str) -> dict[str, int]:
    """Return a case-insensitive word-frequency mapping.

    Words are extracted by splitting on non-alphanumeric characters,
    so punctuation and extra whitespace are ignored.

    Parameters
    ----------
    text : str
        Arbitrary input text (may be empty).

    Returns
    -------
    dict[str, int]
        ``{word: count}`` with all keys in lower-case.

    Examples
    --------
    >>> word_count("Hello hello world")
    {'hello': 2, 'world': 1}
    """
    words = re.findall(r"[a-zA-Z0-9]+", text.lower())
    return dict(Counter(words))


def top_k(text: str, k: int) -> list[tuple[str, int]]:
    """Return the *k* most-frequent words in *text*.

    Sorting order: **descending count**, then **ascending alphabetical**
    for words that share the same count.

    Parameters
    ----------
    text : str
        Arbitrary input text.
    k : int
        Number of top entries to return (clamped to available words).

    Returns
    -------
    list[tuple[str, int]]
        At most *k* ``(word, count)`` pairs.

    Examples
    --------
    >>> top_k("a b a c b a", 2)
    [('a', 3), ('b', 2)]
    """
    counts = word_count(text)
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return ranked[:k]
