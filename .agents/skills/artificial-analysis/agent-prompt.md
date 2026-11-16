# Brief: read Artificial Analysis figures

Work at the repository root. Gather the figures the owner requested; decide nothing and change no tracked file.

Run `node scripts/aa-pages.js read <slug …> --cache <dir> --snapshot <file>` on the requested model pages, placing both paths outside tracked folders. Read on request, leave at least 1.5 seconds between pages, reuse cached pages (the reader's cache is one folder per day by default, so a page cached on another day is read again; a `--cache` folder is reused as given, so use a new one for each reading), and stop and report a refusal. `docs/reference/artificial-analysis.md` records what the terms of use say about automated requests.

Report in Spanish where the cache and output are, how many requests were made, the requested figures with their dates and sources, and any missing fields or failures.
