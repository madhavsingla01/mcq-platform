import { useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePageSearch } from '../search/PageSearchContext';
import '../search/SearchField.css';
import './PageHeader.css';

export default function PageHeader({ title, searchLabel, advancedSearch }) {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { query, setQuery } = usePageSearch();
  const openSearch = useUIStore(state => state.openSearch);
  const closeSearch = useUIStore(state => state.closeSearch);
  const isSearchOpen = useUIStore(state => state.isSearchOpen);
  const shortcutsEnabled = useSettingsStore(state => state.keyboardShortcutsEnabled);

  const params = new URLSearchParams(search);
  const tag = (params.get('tag') || params.get('hashtag') || '').replace(/^#+/, '').trim();
  const initialAdvancedQuery = tag ? `#${tag}` : (params.get('search') || params.get('q') || '').trim();

  useEffect(() => {
    if (!advancedSearch) closeSearch();
  }, [advancedSearch, closeSearch]);

  useEffect(() => {
    if (!shortcutsEnabled) return;
    const handleShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k' ||
        document.querySelector('[aria-modal="true"]')) return;
      const control = document.getElementById('app-page-search');
      if (!control) return;
      event.preventDefault();
      if (advancedSearch) control.click();
      else control.focus();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [advancedSearch, shortcutsEnabled]);

  function submitSearch(event) {
    event.preventDefault();
    if (!searchLabel && query.trim()) navigate(`/explore?${new URLSearchParams({ q: query.trim() })}`);
  }

  return (
    <header className="app-page-header">
      <div className="app-page-header-row">
        <h1 id="app-page-title">{title}</h1>
        {advancedSearch ? <button id="app-page-search" type="button" className="app-page-search consistent-search-field"
          onClick={() => openSearch(initialAdvancedQuery)} aria-label="Open universal search" aria-haspopup="dialog" aria-expanded={isSearchOpen}>
          <Search aria-hidden="true" size={16} />
          <span>Search</span>
        </button> : <form role="search" className="app-page-search app-page-search-form consistent-search-field" onSubmit={submitSearch}>
          <Search aria-hidden="true" size={16} />
          <input id="app-page-search" type="search" className="consistent-search-input" placeholder="Search"
            aria-label={searchLabel || 'Search quizzes'} value={query} maxLength={100} enterKeyHint="search"
            onKeyDown={event => { if (event.key === 'Escape' && query) setQuery(''); }}
            onChange={event => setQuery(event.target.value)} />
          {query && <button type="button" className="app-page-search-clear" aria-label="Clear search" onClick={() => {
            setQuery('');
            document.getElementById('app-page-search')?.focus();
          }}><X size={15} aria-hidden="true" /></button>}
        </form>}
      </div>
    </header>
  );
}
