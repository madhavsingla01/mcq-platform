import { useEffect, useId, useState } from 'react';
import api from '../../../api/axios';

const dayMs = 86400000;
const dayLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const dateOf = day => new Date(day + 'T00:00:00Z');

export default function SubmissionCalendar({ refreshSignal }) {
  const headingId = useId();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (refreshSignal) return;
    const request = new AbortController();
    api.get('/attempts/submission-calendar', { signal: request.signal })
      .then(response => {
        if (request.signal.aborted) return;
        setData(response.data.data);
        setFailed(false);
      })
      .catch(() => { if (!request.signal.aborted) setFailed(true); });
    return () => request.abort();
  }, [refreshSignal]);

  let streak = 0;
  let longest = 0;
  let run = 0;
  const days = [];
  const months = [];
  if (data) {
    const start = dateOf(data.start);
    const end = dateOf(data.end);
    const offset = (start.getUTCDay() + 6) % 7;
    const counts = new Map(data.days.map(({ date, count }) => [date, count]));
    for (let time = +start - offset * dayMs; time <= +end; time += dayMs) {
      const date = new Date(time);
      const count = counts.get(date.toISOString().slice(0, 10)) || 0;
      if (time === +start || date.getUTCDate() === 1 && time >= +start) {
        months.push({ label: monthLabel.format(date), column: Math.floor(days.length / 7) + 1 });
      }
      run = count ? run + 1 : 0;
      longest = Math.max(longest, run);
      if (time === +end - dayMs || time === +end && count) streak = run;
      days.push({ date, count, padding: time < +start });
    }
  }

  return (
    <section className="settings-submission-calendar" aria-labelledby={headingId}>
      <h3 id={headingId}>Submission calendar</h3>
      <p>Completed quiz submissions over the last 52 weeks (UTC).</p>
      {failed ? <p role="status">Could not load submissions. Use Refresh to try again.</p> : !data ? (
        <p role="status">Loading submissions…</p>
      ) : <>
        <p className="settings-calendar-streak"><strong>{streak}</strong> day current streak · <strong>{longest}</strong> day longest streak in this period</p>
        <div className="settings-calendar-scroll" tabIndex={0} role="region" aria-label="Submission heatmap">
          <div className="settings-calendar-chart" aria-hidden="true">
            <div className="settings-calendar-months">
              {months.map(({ label, column }) => <span key={column} style={{ gridColumnStart: column }}>{label}</span>)}
            </div>
            <div className="settings-calendar-days">
              {days.map(({ date, count, padding }) => (
                <span key={+date} className="settings-calendar-day" data-level={padding ? 'padding' : Math.min(4, count)}
                  title={padding ? undefined : `${dayLabel.format(date)} · ${count} ${count === 1 ? 'submission' : 'submissions'}`} />
              ))}
            </div>
          </div>
        </div>
        <p className="settings-calendar-legend">Less {[0, 1, 2, 3, 4].map(level => <span key={level} aria-hidden="true" className="settings-calendar-day" data-level={level} />)} More</p>
        <details>
          <summary>Daily submission totals</summary>
          {data.days.length ? <ul>{data.days.map(({ date, count }) => (
            <li key={date}>{dayLabel.format(dateOf(date))} · {count} {count === 1 ? 'submission' : 'submissions'}</li>
          ))}</ul> : <p>No completed submissions in this period.</p>}
        </details>
      </>}
    </section>
  );
}
