# URL shortener

Source for this question lives in this folder. The problem is the [note](../README.md). The readable page is https://kpvarma5899.github.io/LowlevelDesign/url-shortener/.

The implementation is not written yet. When it is, these are the patterns:

- **Strategy.** `IdGenerator` (Snowflake, or a leased range) and `Encoder` (base62 of an obfuscated id). Create picks them. Resolve does not.
- **Repository.** `UrlRepository` is the unique constraint. An alias race is `409` from the database, not a check against an in-memory set.
- **Service.** `UrlService.create` writes the row and fills the cache. `UrlService.resolve` only reads. It does not increment a click counter on the link row.

Tests cover the alias race, and a resolve that does not write the link row.
