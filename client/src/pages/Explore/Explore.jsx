import { useEffect, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import api from '../../api/axios';
import { Spinner } from '../../components/ui';
import SocialPostCard from '../../components/social/SocialPostCard';

const sortOptions = [
  { value: 'popular', label: 'Popular' },
  { value: 'recent', label: 'Recent' },
  { value: 'top', label: 'Top score' },
  { value: 'active', label: 'Active' },
];

const difficulties = ['', 'Beginner', 'Intermediate', 'Advanced', 'All Levels'];

export default function Explore() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('popular');
  const [difficulty, setDifficulty] = useState('');
  const [quizzes, setQuizzes] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/social/explore', {
          params: {
            search: query.trim() || undefined,
            sort,
            difficulty: difficulty || undefined,
            limit: 18,
          },
          signal: controller.signal,
        });
        setQuizzes(data.data.quizzes || []);
        setPagination(data.data.pagination || null);
      } catch (err) {
        if (err.code !== 'ERR_CANCELED') {
          setError(err.response?.data?.message || 'Could not search quizzes.');
          setQuizzes([]);
        }
      } finally {
        setLoading(false);
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [difficulty, query, sort]);

  const handleQuizUpdate = (updatedQuiz) => {
    setQuizzes((current) => current.map((quiz) => (
      quiz._id === updatedQuiz._id ? updatedQuiz : quiz
    )));
  };

  return (
    <>
      <div className="explore-shell">
        <header className="explore-header">
          <div>
            <h1>Explore</h1>
            <p>Search creators, categories and public quiz collections.</p>
          </div>
          <div className="explore-count">{pagination?.total || 0} results</div>
        </header>

        <section className="explore-controls">
          <label className="explore-search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search public quizzes or @creators" />
          </label>
          <label className="explore-select">
            <SlidersHorizontal size={17} />
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="explore-select">
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              {difficulties.map((item) => <option key={item || 'any'} value={item}>{item || 'Any difficulty'}</option>)}
            </select>
          </label>
        </section>

        {loading ? (
          <div className="explore-state"><Spinner size={34} /></div>
        ) : error ? (
          <div className="explore-state">{error}</div>
        ) : quizzes.length === 0 ? (
          <div className="explore-state">No public quizzes found.</div>
        ) : (
          <div className="explore-grid">
            {quizzes.map((quiz) => (
              <SocialPostCard key={quiz._id} quiz={quiz} onQuizUpdate={handleQuizUpdate} />
            ))}
          </div>
        )}
      </div>

      <style>{styles}</style>
    </>
  );
}

const styles = `
  .explore-shell {
    width: min(980px, 100%);
    margin: 0 auto;
  }

  .explore-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .explore-header h1 {
    margin: 0;
    color: var(--color-text);
    font-size: 28px;
    line-height: 1;
    font-weight: 900;
  }

  .explore-header p {
    margin: 7px 0 0;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .explore-count {
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .explore-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 180px 180px;
    gap: 10px;
    margin-bottom: 18px;
  }

  .explore-search,
  .explore-select {
    min-height: 46px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-text-muted);
  }

  .explore-search input,
  .explore-select select {
    min-width: 0;
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
  }

  .explore-select select option {
    color: #000;
  }

  .explore-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .explore-state {
    min-height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }

  @media (max-width: 720px) {
    .explore-header {
      align-items: start;
      flex-direction: column;
    }

    .explore-controls {
      grid-template-columns: 1fr;
    }
  }
`;
