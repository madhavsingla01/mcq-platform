import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, RefreshCw, Shield, Trophy, Users } from 'lucide-react';
import { Spinner } from '../../components/ui';
import ChallengeService from '../../services/challenge.service';
import './CompetitionLeaderboard.css';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const displayName = row => row.user?.name || row.user?.username || 'Competitor';
const isViewer = (row, receipt) => receipt?.kind === 'ranked' && row.attemptId === receipt.attemptId;

function formatDuration(ms) {
  const elapsed = Math.max(0, Math.round(Number(ms) || 0));
  const seconds = ((elapsed % 60000) / 1000).toFixed(3).replace(/\.?0+$/, '');
  const minutes = Math.floor(elapsed / 60000);
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function RevealTime({ remaining }) {
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const parts = [
    ['Days', Math.floor(seconds / 86400)],
    ['Hours', Math.floor(seconds / 3600) % 24],
    ['Min', Math.floor(seconds / 60) % 60],
    ['Sec', seconds % 60],
  ];
  return <dl className="contest-countdown" aria-hidden="true">
    {parts.map(([unit, value]) => <div key={unit}><dt>{unit}</dt><dd>{String(value).padStart(2, '0')}</dd></div>)}
  </dl>;
}

function Avatar({ row }) {
  const name = displayName(row);
  return row.user?.avatar
    ? <img className="contest-avatar" src={row.user.avatar} alt="" loading="lazy" />
    : <span className="contest-avatar contest-avatar-fallback" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>;
}

function SubmissionReceipt({ receipt, rank, sealed }) {
  const practice = receipt.kind === 'practice';
  return (
    <section className="contest-receipt" aria-label="Your submission">
      <CheckCircle2 size={22} aria-hidden="true" />
      <div>
        <h3>{practice ? 'Practice submission saved' : 'Your submission is recorded'}</h3>
        <p>{practice ? 'Host practice stays in your results and is excluded from the official standings.'
          : rank ? `You placed #${rank} in the official standings.`
          : sealed ? 'Your rank and score will appear after the standings are released.' : 'Your completed attempt is saved.'}</p>
        {receipt.completedAt && <time dateTime={receipt.completedAt}>{dateFormat.format(new Date(receipt.completedAt))}</time>}
      </div>
      <Link to={`/result/${receipt.attemptId}`} className="contest-action">View submission <ArrowRight size={15} aria-hidden="true" /></Link>
    </section>
  );
}

function RankedStandings({ rows, receipt, viewerRank }) {
  return <>
    <dl className="contest-stats">
      <div><dt>Ranked competitors</dt><dd>{numberFormat.format(rows.length)}</dd></div>
      <div><dt>Top score</dt><dd>{numberFormat.format(rows[0].score)} <small>pts</small></dd></div>
      <div><dt>Your rank</dt><dd>{viewerRank ? `#${viewerRank}` : <small>{receipt?.kind === 'practice' ? 'Host practice' : 'Unranked'}</small>}</dd></div>
    </dl>
    <section aria-label="Top finishers" className="contest-podium">
      {rows.slice(0, 3).map(row => <article key={row.attemptId} className="contest-podium-card" data-rank={row.rank}>
        <span className="contest-podium-rank">#{row.rank}</span>
        <Avatar row={row} />
        <h3>{displayName(row)}{isViewer(row, receipt) && <span className="contest-you">You</span>}</h3>
        <p><strong>{numberFormat.format(row.score)}</strong> pts <span>· {formatDuration(row.totalTimeMs)}</span></p>
      </article>)}
    </section>
    <section className="contest-table-section" aria-label="Full rankings">
      <div className="contest-table-heading">
        <h3>Full rankings</h3>
        <p>Highest score first. Faster time breaks a score tie.</p>
      </div>
      <div className="contest-table-scroll" role="region" aria-label="Standings table" tabIndex={0}>
        <table className="contest-table">
          <thead><tr><th scope="col">Rank</th><th scope="col">Competitor</th><th scope="col">Score</th><th scope="col">Score %</th><th scope="col">Time</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.attemptId} className={isViewer(row, receipt) ? 'is-viewer' : undefined}>
            <td><strong>#{row.rank}</strong></td>
            <th scope="row">
              <div className="contest-person">
                <Avatar row={row} />
                <div><strong>{displayName(row)}{isViewer(row, receipt) && <span className="contest-you">You</span>}</strong>
                  {row.user?.username && !row.user.isPseudonymized && <small>@{row.user.username}</small>}
                </div>
              </div>
            </th>
            <td className="contest-table-score">{numberFormat.format(row.score)}{row.totalMarks > 0 && <span> / {numberFormat.format(row.totalMarks)}</span>}</td>
            <td>{numberFormat.format(row.percentage)}%</td>
            <td>{formatDuration(row.totalTimeMs)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </>;
}

export default function CompetitionStandings({ challengeId, initialTitle }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const request = useRef(null);

  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setError('');
    try {
      const standings = await ChallengeService.getLeaderboard(challengeId, controller.signal);
      if (!controller.signal.aborted) {
        setData(standings);
        setRemaining(Math.max(0, new Date(standings.deadlineAt) - new Date(standings.serverTime)));
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.response?.data?.message || 'Could not load standings. Try refreshing.');
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, [challengeId]);

  useEffect(() => {
    refresh();
    return () => request.current?.abort();
  }, [refresh]);

  useEffect(() => {
    if (data?.finalizing) {
      const timer = setTimeout(refresh, 6000);
      return () => clearTimeout(timer);
    }
    if (!data?.quarantined || !data.deadlineAt) return;
    const offset = new Date(data.serverTime) - Date.now();
    const timeLeft = () => new Date(data.deadlineAt) - (Date.now() + offset);
    const timer = setInterval(() => {
      const left = timeLeft();
      setRemaining(Math.max(0, left));
      if (left <= 0) {
        clearInterval(timer);
        refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [data, refresh]);

  const rows = data?.leaderboard || [];
  const receipt = data?.viewerSubmission;
  const viewerRank = rows.find(row => isViewer(row, receipt))?.rank;
  const state = data?.quarantined ? 'Standings sealed' : data?.finalizing ? 'Finalizing results' : 'Final standings';

  return <div className="contest-standings">
    <header className="contest-hero">
      <div className="contest-trophy"><Trophy size={26} aria-hidden="true" /></div>
      <div className="contest-hero-copy">
        <p>Competition standings</p>
        <h2>{data?.title || initialTitle || 'Official standings'}</h2>
        {data && <span className="contest-state">{state}</span>}
      </div>
      <button type="button" className="contest-action" onClick={refresh} disabled={refreshing}>
        <RefreshCw size={15} aria-hidden="true" /> {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </header>

    {error && <p className="contest-error" role="alert"><AlertCircle size={18} aria-hidden="true" /> {error}</p>}
    {!data && !error && <div className="contest-empty" role="status"><Spinner size={28} /> Loading standings…</div>}
    {receipt && <SubmissionReceipt receipt={receipt} rank={viewerRank} sealed={data.quarantined || data.finalizing} />}
    {data?.quarantined && <section className="contest-empty">
      <Shield size={30} aria-hidden="true" />
      <h3>Rankings open after the deadline</h3>
      <p>Scores, ranks, and answer reviews are sealed until the competition closes.</p>
      {data.deadlineAt && <>
        <RevealTime remaining={remaining} />
        <p>Reveal time <time dateTime={data.deadlineAt}>{dateFormat.format(new Date(data.deadlineAt))}</time></p>
      </>}
    </section>}
    {data?.finalizing && <section className="contest-empty" role="status">
      <Clock3 size={30} aria-hidden="true" /><h3>Finalizing timed attempts</h3>
      <p>The competition has closed. Rankings will appear here when all timed attempts are scored.</p>
    </section>}
    {data && !data.quarantined && !data.finalizing && (rows.length
      ? <RankedStandings rows={rows} receipt={receipt} viewerRank={viewerRank} />
      : <section className="contest-empty">
        <Users size={30} aria-hidden="true" /><h3>No ranked submissions</h3>
        <p>The competition closed without a completed ranked attempt.</p>
      </section>)}
  </div>;
}
