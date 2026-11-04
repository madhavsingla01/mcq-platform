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
import './CreateHub.css';

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
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="hub-empty-state">No creation options match “{query}”.</p>
        )}
      </main>

    </div>
  );
}
