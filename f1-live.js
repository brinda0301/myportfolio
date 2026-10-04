/* ======================================================================
   F1 LIVE FEED
   Reads the F1-predictions repo straight from GitHub on every page load,
   so the portfolio shows the latest race the moment a commit lands there.

   Sources (both public, CORS enabled, no key needed):
     - config.json            -> accuracy_history: one entry per scored race
     - races/<NN_name>/       -> prediction.json and result.json per round

   Any element with data-f1="<key>" gets its text replaced. The HTML keeps
   a static snapshot as fallback, so the page still reads well offline or
   when GitHub rate-limits the request.
   ====================================================================== */
(() => {
  'use strict';

  const REPO = 'brinda0301/F1-predictions';
  const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
  const API = `https://api.github.com/repos/${REPO}/contents/races`;

  /* ---------- Small helpers ---------- */
  const getJSON = async (url) => {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  };
  const tryJSON = (url) => getJSON(url).catch(() => null);

  const set = (key, value) => {
    document.querySelectorAll(`[data-f1="${key}"]`).forEach((el) => { el.textContent = value; });
  };
  const pct = (hits, total) => (total ? Math.round((100 * hits) / total) + '%' : '--');

  // Display names drift between sources ("Kimi Antonelli" vs "Andrea Kimi Antonelli"),
  // so drivers are compared by surname.
  const surname = (name) => String(name || '').trim().split(/\s+/).pop().toLowerCase();
  const sameDriver = (a, b) => !!a && !!b && surname(a) === surname(b);

  const poleSitter = (prediction) => {
    const p = (prediction && prediction.predictions || []).find((d) => d.grid_pos === 1);
    return p ? p.driver : null;
  };

  const mean = (rows, key) => {
    const vals = rows.map((r) => r[key]).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  /* ---------- Render the race-by-race log (one square per round) ---------- */
  const renderRaceLog = (history) => {
    document.querySelectorAll('[data-f1-racelog]').forEach((wrap) => {
      wrap.innerHTML = '';
      history.forEach((r) => {
        const cell = document.createElement('span');
        cell.className = 'grid h-7 place-items-center border font-mono text-[10px] ' +
          (r.correct ? 'border-go/60 bg-go/15 text-go' : 'border-f1red/50 bg-f1red/10 text-f1red');
        cell.textContent = r.round;
        cell.title = `R${r.round} ${r.race}: picked ${r.predicted_winner}, won by ${r.actual_winner}`;
        wrap.appendChild(cell);
      });
    });
  };

  /* ---------- Main ---------- */
  const run = async () => {
    set('status', 'SYNCING WITH GITHUB...');

    // 1. Season record from config.json (one request)
    const config = await getJSON(RAW + 'config.json');
    const history = (config.accuracy_history || []).slice().sort((a, b) => a.round - b.round);
    if (!history.length) throw new Error('empty history');

    const mcHits = history.filter((r) => r.correct).length;
    const xgbRows = history.filter((r) => typeof r.xgb_winner_correct === 'boolean');
    const xgbHits = xgbRows.filter((r) => r.xgb_winner_correct).length;

    set('rounds', String(history.length));
    set('mc-record', `${mcHits}/${history.length}`);
    set('mc-pct', pct(mcHits, history.length));
    set('xgb-record', `${xgbHits}/${xgbRows.length}`);
    set('xgb-pct', pct(xgbHits, xgbRows.length));

    const mcLL = mean(history, 'mc_log_loss');
    const poleLL = mean(history, 'pole_log_loss');
    if (mcLL !== null) set('mc-logloss', mcLL.toFixed(3));
    if (poleLL !== null) set('pole-logloss', poleLL.toFixed(3));

    // Last scored race
    const last = history[history.length - 1];
    set('last-round', `R${last.round} // ${String(last.race).toUpperCase()}`);
    set('last-pick', `${last.predicted_winner} (${last.predicted_win_pct}%)`);
    set('last-winner', last.actual_winner);
    set('last-verdict', last.correct ? 'CORRECT' : 'MISS');
    document.querySelectorAll('[data-f1="last-verdict"]').forEach((el) => {
      el.classList.toggle('text-go', !!last.correct);
      el.classList.toggle('text-f1red', !last.correct);
    });
    renderRaceLog(history);

    // 2. Folder list: needed for the pole baseline and the next-race call
    const listing = await getJSON(API);
    const folders = listing
      .filter((f) => f.type === 'dir' && /^\d+_/.test(f.name))
      .map((f) => ({ name: f.name, round: parseInt(f.name, 10) }))
      .sort((a, b) => a.round - b.round);

    // 3. Pole baseline: did the P1 starter win? Fetched in parallel.
    const scored = folders.filter((f) => history.some((r) => r.round === f.round));
    const poles = await Promise.all(scored.map((f) => tryJSON(`${RAW}races/${f.name}/prediction.json`)));
    let poleHits = 0, poleRaces = 0;
    scored.forEach((f, i) => {
      const pole = poleSitter(poles[i]);
      const row = history.find((r) => r.round === f.round);
      if (!pole || !row) return;
      poleRaces++;
      if (sameDriver(pole, row.actual_winner)) poleHits++;
    });
    if (poleRaces) {
      set('pole-record', `${poleHits}/${poleRaces}`);
      set('pole-pct', pct(poleHits, poleRaces));
    }

    // 4. Next race: newest folder with no scored result yet
    const next = folders.filter((f) => f.round > last.round).pop();
    if (next) {
      const pred = await tryJSON(`${RAW}races/${next.name}/prediction.json`);
      const label = pred && pred.race && pred.race.name ? pred.race.name : next.name.replace(/^\d+_/, '');
      set('next-round', `R${next.round} // ${String(label).toUpperCase()}`);
      if (pred && pred.predictions && pred.predictions.length) {
        const top = pred.predictions.slice().sort((a, b) => b.win_pct - a.win_pct)[0];
        set('next-pick', `${top.driver} (${top.win_pct}%)`);
        set('next-status', 'LOCKED PRE-RACE');
      } else {
        set('next-pick', 'Awaiting qualifying');
        set('next-status', 'DATA LOADING');
      }
    } else {
      set('next-round', `AFTER R${last.round}`);
      set('next-pick', 'Awaiting next weekend');
      set('next-status', 'STANDBY');
    }

    const t = new Date().toISOString().slice(11, 16);
    set('status', `LIVE // SYNCED ${t} UTC`);
    document.dispatchEvent(new CustomEvent('f1live', { detail: { history, last, mcHits, poleHits, poleRaces } }));
  };

  run().catch(() => set('status', 'OFFLINE // SHOWING LAST SNAPSHOT'));
})();
