# myportfolio

Portfolio site for Brinda Ramesh Bhanderi, styled as an F1 pit wall telemetry dashboard.

- `index.html`: pit wall overview, telemetry stream, career sectors, setup sheet
- `projects.html`: Scuderia Registry, projects as engine component spec sheets
- `experience.html`: Race Strategy Pipeline, career drawn as a circuit map

Plain HTML, Tailwind via CDN, vanilla JS. No build step. Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works).

## Live F1 data

`f1-live.js` reads [F1-predictions](https://github.com/brinda0301/F1-predictions) from GitHub on every page load: `config.json` for the season record, and `races/*/prediction.json` for the pole baseline and the next locked prediction. Push to that repo and the portfolio shows it within about 5 minutes (GitHub's raw file cache). No build or redeploy needed here. The HTML keeps a static snapshot as a fallback.
