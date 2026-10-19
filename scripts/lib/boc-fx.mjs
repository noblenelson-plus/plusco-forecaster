// scripts/lib/boc-fx.mjs
//
// Foreign currency → CAD rates from the Bank of Canada Valet API (free, no key):
// https://www.bankofcanada.ca/valet/docs
//
// One rate per currency × year, chosen so planned budgets don't move day to day:
//   - a completed year: the Bank's official annual average (FXA{CUR}CAD);
//   - the current year: the average of the daily rates so far (FX{CUR}CAD);
//   - a later year (plans for next year): the current year's average so far.
// Each rate carries a `basis` sentence so the dashboard can say which rate it used.

const VALET = "https://www.bankofcanada.ca/valet/observations";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bank of Canada ${res.status}: ${url}`);
  return res.json();
}

/** Mean of the daily observations of `series` within `year` (null if none yet). */
async function ytdAverage(series, year) {
  const today = new Date().toISOString().slice(0, 10);
  const end = `${year}-12-31` < today ? `${year}-12-31` : today;
  const j = await fetchJson(`${VALET}/${series}/json?start_date=${year}-01-01&end_date=${end}`);
  const values = (j.observations ?? [])
    .map((o) => Number(o[series]?.v))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!values.length) return null;
  const last = j.observations[j.observations.length - 1].d;
  return { rate: values.reduce((a, b) => a + b, 0) / values.length, through: last };
}

/** The official annual average of `series` for `year` (null if not published yet). */
async function annualAverage(series, year) {
  const j = await fetchJson(`${VALET}/${series}/json?start_date=${year}-01-01&end_date=${year}-12-31`);
  const v = Number(j.observations?.[0]?.[series]?.v);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Rates to CAD for every (currency, year) pair asked for. CAD is always 1.
 * Returns { [year]: { [currency]: { rate, basis } } }. Throws when a pair has no
 * rate at all — the sync must not publish unconverted foreign amounts.
 */
export async function fetchRatesToCad(currencies, years) {
  const currentYear = new Date().getFullYear();
  const out = {};
  for (const year of [...new Set(years)].sort()) {
    out[year] = { CAD: { rate: 1, basis: "CAD" } };
    for (const cur of [...new Set(currencies)].filter((c) => c && c !== "CAD").sort()) {
      let entry = null;
      if (year < currentYear) {
        const a = await annualAverage(`FXA${cur}CAD`, year);
        if (a) entry = { rate: a, basis: `Bank of Canada ${year} annual average` };
        else {
          // Annual figure not published yet (early January): fall back to the daily mean.
          const y = await ytdAverage(`FX${cur}CAD`, year);
          if (y) entry = { rate: y.rate, basis: `Bank of Canada ${year} average of daily rates (to ${y.through})` };
        }
      } else {
        const y = await ytdAverage(`FX${cur}CAD`, Math.min(year, currentYear));
        if (y) {
          entry = {
            rate: y.rate,
            basis:
              year === currentYear
                ? `Bank of Canada ${year} year-to-date average (to ${y.through})`
                : `Bank of Canada ${currentYear} year-to-date average (to ${y.through}); ${year} not started`,
          };
        }
      }
      if (!entry) throw new Error(`No Bank of Canada rate for ${cur}→CAD in ${year}`);
      entry.rate = Math.round(entry.rate * 10000) / 10000;
      out[year][cur] = entry;
    }
  }
  return out;
}
