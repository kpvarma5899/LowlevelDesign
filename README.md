# LowlevelDesign

High-level and low-level design write-ups for interview prep. Each note is one question: the shape of the round, the design, and the follow-ups that decide the score.

| # | Question | Note |
|---|---|---|
| 1 | URL shortener | [url-shortener.md](url-shortener.md) |
| 2 | Rate limiter | [rate-limiter.md](rate-limiter.md) |

The sentence each note closes on:

1. **URL shortener.** The short code is an obfuscated unique id, the database unique key is the real lock, and the redirect path never writes to the link row.
2. **Rate limiter.** Decide with one atomic check-and-consume on a shared counter, answer 429 with Retry-After, and keep a Redis timeout from taking down the API.
