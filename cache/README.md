# Canvas to pages

Generates the GitHub Pages site in `docs/` from each question folder.

```bash
node cache/canvas-to-pages.mjs
```

Run that from the repository root. A question is `questions/<slug>/`:

- `README.md` — the note. This is the publishable form of the design canvas.
- `page.json` — number, kicker, and stats when the note has no stat table.
- `src/` — reserved for the implementation. The renderer does not read it.

A note can place a widget with an HTML comment:

- `<!-- widget:boundary-chart -->`
- `<!-- widget:token-bucket -->`

`docs/` is generated. Change the note or this cache, then run the script again. Do not hand-edit `docs/`.
