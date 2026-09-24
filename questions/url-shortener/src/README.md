# URL shortener implementation

Not written yet.

When this is built, it follows the note beside this folder:

- `UrlService.create` and `UrlService.resolve`
- `IdGenerator` that stays unique across threads
- `Encoder` as base62 over an obfuscated id
- Uniqueness enforced by the repository, not by an in-memory set
- Redirect reads. It does not increment a click counter on the link row.

Tests should cover an alias race, and a resolve that does not write the link row.
