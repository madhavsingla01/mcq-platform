import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Trophy,
  Upload,
  ArrowUpRight,
  Search,
  X,
} from 'lucide-react';

export default function CreateHub() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const visibleOptions = [
    { id: 'quiz', label: 'Quiz', terms: 'quiz self-paced build create', path: '/create/quiz', Icon: Sparkles },
    { id: 'challenge', label: 'Challenge', terms: 'challenge competitive host', path: '/create/challenge', Icon: Trophy },
    { id: 'import', label: 'Import', terms: 'import csv xlsx spreadsheet upload', path: '/create/upload', Icon: Upload },
  ].filter((option) => `${option.label} ${option.terms}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="hub-viewport">
      <main className="hub-container">
        <header className="hub-header consistent-page-header">
          <h1 className="hub-title consistent-page-title">Create</h1>
          <label className="hub-search consistent-page-search consistent-search-field">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              className="consistent-search-input"
              placeholder="Search"
              aria-label="Search creation options"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </label>
        </header>

        {visibleOptions.length ? (
          <div className="hub-grid">
            {visibleOptions.map(({ id, label, path, Icon }) => (
              <article
                key={id}
                id={`create-${id}-card`}
                className="hub-minimal-card"
                onClick={() => navigate(path)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => event.key === 'Enter' && navigate(path)}
              >
                <div className="card-top-row">
                  <Icon size={20} className="card-primary-icon" />
                  <ArrowUpRight size={15} className="card-corner-arrow" />
                </div>
                <div className="card-bottom-info">
                  <h2 className="card-title">{label}</h2>
                  <span className="card-subtitle">
                    {id === 'quiz' ? 'Self-paced' : id === 'challenge' ? 'Competitive' : 'CSV · XLSX'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="hub-empty-state">No creation options match “{query}”.</p>
        )}
      </main>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  /* ── Ultra-minimal Black & Orange Create Studio ── */
  .hub-viewport {
    width: 100%;
    min-height: calc(100vh - 120px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 32px 20px 80px;
    background: #000000;
    box-sizing: border-box;
  }

  .hub-container {
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .hub-header {
    width: 100%;
    margin-bottom: 28px;
  }

  .hub-title {
    text-align: left;
  }

  .hub-search {
    width: 320px;
  }

  .hub-search button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    color: var(--color-text-secondary);
    background: transparent;
    border-radius: 7px;
    cursor: pointer;
  }

  .hub-empty-state {
    width: 100%;
    padding: 28px 16px;
    color: var(--color-text-secondary);
    text-align: center;
    border: 1px solid var(--color-border);
    border-radius: 12px;
  }

  /* ── 3 Cards Grid ── */
  .hub-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    width: 100%;
  }

  /* ── Minimal Card ── */
  .hub-minimal-card {
    position: relative;
    background: #070709;
    border: 1px solid #1c1c20;
    border-radius: 12px;
    padding: 20px 22px;
    height: 146px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    outline: none;
    user-select: none;
  }

  .hub-minimal-card:hover,
  .hub-minimal-card:focus-visible {
    background: #0d0d10;
    border-color: #FF4500;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7), 0 0 20px rgba(255, 69, 0, 0.18);
  }

  /* ── Top Row (Icon left, Arrow right) ── */
  .card-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .card-primary-icon {
    color: #FF4500;
    flex-shrink: 0;
    transition: transform 0.18s ease;
  }

  .hub-minimal-card:hover .card-primary-icon {
    transform: scale(1.08);
  }

  .card-corner-arrow {
    color: #52525B;
    transition: all 0.18s ease;
    flex-shrink: 0;
  }

  .hub-minimal-card:hover .card-corner-arrow {
    color: #FFFFFF;
    transform: translate(2px, -2px);
  }

  /* ── Bottom Info (Title + Subtitle) ── */
  .card-bottom-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .card-title {
    font-size: 19px;
    font-weight: 750;
    color: #FFFFFF;
    margin: 0;
    letter-spacing: -0.015em;
    line-height: 1.2;
  }

  .card-subtitle {
    font-size: 12.5px;
    color: #71717A;
    font-weight: 500;
    line-height: 1.2;
    margin: 0;
  }

  .hub-minimal-card:hover .card-subtitle {
    color: #A1A1AA;
  }

  /* ── Responsive ── */
  @media (max-width: 680px) {
    .hub-header {
      align-items: stretch;
    }

    .hub-search {
      width: 100%;
      max-width: none;
      flex-basis: 100%;
    }

    .hub-grid {
      grid-template-columns: 1fr;
      max-width: 320px;
      gap: 12px;
    }

    .hub-minimal-card {
      height: 120px;
      padding: 16px 18px;
    }
  }
`;
