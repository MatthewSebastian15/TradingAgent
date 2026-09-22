import { mean, quantile } from './stats';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function rowsOf(points) {
  return (points || [])
    .map((p) => ({
      date: String(p?.date || '').slice(0, 10),
      close: p?.adjusted_close ?? p?.close,
    }))
    .filter((r) => r.date && r.close > 0);
}

function summarize(label, rets) {
  const sorted = [...rets].sort((a, b) => a - b);
  return {
    label,
    count: rets.length,
    meanPct: mean(rets) * 100,
    medianPct: quantile(sorted, 0.5) * 100,
    hitRate: (rets.filter((r) => r > 0).length / rets.length) * 100,
  };
}

export function returnsByWeekday(points) {
  const rows = rowsOf(points);
  const groups = WEEKDAYS.map(() => []);
  for (let i = 1; i < rows.length; i += 1) {
    const day = new Date(`${rows[i].date}T00:00:00Z`).getUTCDay();
    groups[day].push(rows[i].close / rows[i - 1].close - 1);
  }
  return groups
    .map((rets, day) => (rets.length ? summarize(WEEKDAYS[day], rets) : null))
    .filter(Boolean);
}

export function returnsByMonth(points) {
  const monthEnds = [];
  for (const r of rowsOf(points)) {
    const key = r.date.slice(0, 7);
    if (monthEnds.length && monthEnds.at(-1).key === key) monthEnds.at(-1).close = r.close;
    else monthEnds.push({ key, close: r.close });
  }
  const groups = MONTHS.map(() => []);
  for (let i = 1; i < monthEnds.length; i += 1) {
    groups[Number(monthEnds[i].key.slice(5, 7)) - 1].push(
      monthEnds[i].close / monthEnds[i - 1].close - 1
    );
  }
  return groups.map((rets, m) => (rets.length ? summarize(MONTHS[m], rets) : null)).filter(Boolean);
}
