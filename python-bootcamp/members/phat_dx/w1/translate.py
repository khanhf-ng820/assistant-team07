"""W1-4: C++ → Python translation — Sieve of Eratosthenes (Variant 4).

Translation notes (C++ vs Python)
----------------------------------
1. **Fixed-size array → dynamic list**
   C++ uses ``std::vector<bool> is_prime(n+1, true)`` with compile-time size.
   Python creates ``[True] * (n + 1)`` — a resizable list — in one expression.

2. **Manual loop → ``range(start, stop, step)``**
   The inner C++ loop ``for (int j = p*p; j <= n; j += p)`` translates
   directly to ``range(p*p, n+1, p)``, which is more readable and
   eliminates off-by-one risks.

3. **Index-filtered output → list comprehension**
   C++ collects primes with a push_back loop; Python achieves the same
   with ``[i for i, flag in enumerate(sieve) if flag]`` — concise and
   idiomatic.

4. **No header imports needed**
   C++ requires ``<vector>`` and ``<cmath>``; Python needs no imports
   because ``list``, ``range``, and ``**`` are built-in.
"""

from __future__ import annotations


def sieve_of_eratosthenes(n: int) -> list[int]:
    """Return all prime numbers in the range [2, n] using the classic sieve.

    Parameters
    ----------
    n : int
        Upper bound (inclusive). If *n* < 2 an empty list is returned.

    Returns
    -------
    list[int]
        Sorted list of primes ≤ *n*.

    Examples
    --------
    >>> sieve_of_eratosthenes(30)
    [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
    >>> sieve_of_eratosthenes(1)
    []
    """
    if n < 2:
        return []

    # Step 1: assume every number is prime
    is_prime = [True] * (n + 1)
    is_prime[0] = False
    is_prime[1] = False

    # Step 2: mark multiples of each prime starting from p²
    p = 2
    while p * p <= n:
        if is_prime[p]:
            for multiple in range(p * p, n + 1, p):
                is_prime[multiple] = False
        p += 1

    # Step 3: collect surviving primes
    return [i for i, prime in enumerate(is_prime) if prime]
