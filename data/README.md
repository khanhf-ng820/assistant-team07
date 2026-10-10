# Data specification and source security

This directory contains the small datasets used by the study assistant. The
current records are sample data for development and demonstration; office
locations and opening hours must be verified against an official university
source before they are used in production.

## `offices.csv` specification

`offices.csv` is a UTF-8, comma-separated file with one header row. Each
subsequent row represents one campus office.

| Column | Required | Format | Description |
| --- | --- | --- | --- |
| `name` | Yes | Non-empty text; unique, case-insensitively | Public display name of the office. |
| `room` | Yes | Non-empty text; unique, case-insensitively | Campus room or service-point identifier, such as `I.101`. |
| `hours` | Yes | `<days> HH:MM-HH:MM` using 24-hour time | Public operating schedule, such as `Mon-Fri 08:00-17:00`. |

Additional requirements:

- Keep the column order exactly `name,room,hours`; do not add an index column.
- Quote a field according to RFC 4180 if it contains a comma, quote, or line
  break.
- Do not leave fields blank or add leading or trailing whitespace.
- Use one row per office and keep office names and room identifiers unique.
- Express days with the English abbreviations `Mon`, `Tue`, `Wed`, `Thu`,
  `Fri`, `Sat`, and `Sun`; use a hyphen for a continuous range.
- Use `00:00-24:00` only for a service that is confirmed to operate all day.

Example:

```csv
name,room,hours
Training Office,I.101,Mon-Fri 07:30-16:30
```

## Validation and maintenance

Before committing a change, confirm that:

1. the file decodes as UTF-8 and can be parsed by a standard CSV reader;
2. the header and every required field match this specification;
3. names and rooms are unique and schedules use valid 24-hour values;
4. the application tests still pass; and
5. a second maintainer or the data owner reviews changes intended for
   production.

Review production records at least once per academic term. Recheck a record
immediately after a relocation, holiday-hours announcement, or service change.
Remove or correct stale data rather than silently retaining it.

## Source provenance and security

Use only sources authorized for public campus information, in this order of
preference:

1. the university's official office directory or website;
2. a written update from the office responsible for the record; or
3. an approved internal directory whose fields are classified as public.

For every production update, record the source URL or document reference,
verification date, and verifier in the pull request or issue. Do not place
private emails, internal documents, access tokens, credentials, or restricted
source URLs in this directory or in Git history. Access protected sources only
through university-approved accounts and devices; never copy their credentials
into scripts or CSV files.

This dataset may contain public office information only. It must not contain
personal phone numbers, personal email addresses, student or employee records,
health information, authentication data, or any other confidential or personal
data. If a source contains both public and restricted fields, extract only the
three approved columns and discard the restricted fields before committing.

Treat unexpected bulk changes, unverified sources, and conflicting schedules
as integrity risks. Stop publication, ask the responsible office to verify the
record through a separate trusted channel, and document the resolution in the
review. If sensitive information is committed accidentally, notify the project
maintainer immediately, revoke any exposed secret, and follow the university's
incident-response process; deleting the latest file alone does not remove data
from Git history.
