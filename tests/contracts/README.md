# Contract checks

P2-70 (Wave 5 Task 11): these files read source text, configuration or copy
and check a rule about it (no em dashes in copy, no mojibake, pinned images,
CI workflow shape, theme tokens). They are lint, not behaviour tests: they
run no application code. They live here so `tests/unit` holds tests that
execute what they claim, and so a reader knows which kind a failure is.

A behaviour claim belongs in `tests/unit` with a test that runs the code; a
text check may stay alongside it as a secondary guard.
