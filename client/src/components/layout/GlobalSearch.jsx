import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Filter, Search, Trophy, User, X } from 'lucide-react';
import api from '../../api/axios';

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'users', label: 'Users' },
];

const difficulties = ['', 'Beginner', 'Intermediate', 'Advanced', 'All Levels'];
const sortOptions = [
  { value: 'recent', label: 'Recent' },
  { value: 'popular', label: 'Popular' },
  { value: 'top', label: 'Top score' },
];

const isTypingTarget = (target) => {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target?.isContentEditable;
};

export default function GlobalSearch() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState('popular');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quizzes, setQuizzes] = useState([]);
  const [users, setUsers] = useState([]);

  const trimmedQuery = query.trim();
  const showQuizzes = tab === 'all' || tab === 'quizzes';
  const showUsers = tab === 'all' || tab === 'users';
  const hasResults = quizzes.length > 0 || users.length > 0;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      }

      if (event.key === '/' && !isTypingTarget(event.target)) {
        event.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      }

      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const requests = [];

        if (showQuizzes) {
          requests.push(api.get('/quizzes', {
            params: {
              publicOnly: true,
              search: trimmedQuery || undefined,
              difficulty: difficulty || undefined,
              sort,
              limit: 6,
            },
            signal: controller.signal,
          }));
        } else {
          requests.push(Promise.resolve(null));
        }

        if (showUsers && trimmedQuery.length > 0) {
          requests.push(api.get('/auth/users/search', {
            params: { q: trimmedQuery },
            signal: controller.signal,
          }));
        } else {
          requests.push(Promise.resolve(null));
        }

        const [quizResponse, userResponse] = await Promise.all(requests);
        setQuizzes(quizResponse?.data?.data?.quizzes || []);
        setUsers(userResponse?.data?.data || []);
      } catch (error) {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          setQuizzes([]);
          setUsers([]);
        }
      } finally {
        setLoading(false);
      }
    }, 240);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [difficulty, isOpen, showQuizzes, showUsers, sort, trimmedQuery]);

  const firstQuiz = quizzes[0];
  const firstUser = users[0];
  const primaryTarget = useMemo(() => {
    if (showQuizzes && firstQuiz) return `/quiz/${firstQuiz._id}`;
    if (showUsers && firstUser) return `/@${firstUser.username}`;
    return '';
  }, [firstQuiz, firstUser, showQuizzes, showUsers]);

  const submitSearch = (event) => {
    event.preventDefault();
    if (!primaryTarget) return;
    setIsOpen(false);
    navigate(primaryTarget);
  };

  return (
    <div className="global-search" ref={containerRef}>
      <form className="global-search-box" onSubmit={submitSearch}>
        <Search size={16} />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          placeholder="Search public quizzes or @users"
          aria-label="Search public quizzes and users"
        />
        {query ? (
          <button
            type="button"
            className="global-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <span className="global-search-key">/</span>
        )}
      </form>

      {isOpen && (
        <div className="global-search-popover">
          <div className="global-search-tabs">
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                className={tab === item.key ? 'active' : ''}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {showQuizzes && (
            <div className="global-search-filters">
              <Filter size={14} />
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                {difficulties.map((item) => (
                  <option key={item || 'any'} value={item}>{item || 'Any difficulty'}</option>
                ))}
              </select>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                {sortOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="global-search-results custom-scrollbar">
            {loading && <div className="global-search-state">Searching...</div>}

            {!loading && showQuizzes && quizzes.length > 0 && (
              <section>
                <div className="global-search-label">Public quizzes</div>
                {quizzes.map((quiz) => (
                  <Link
                    key={quiz._id}
                    className="global-search-row"
                    to={`/quiz/${quiz._id}`}
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="global-search-icon"><BookOpen size={16} /></span>
                    <span className="global-search-main">
                      <strong>{quiz.title}</strong>
                      <small>
                        {quiz.category || 'General'} · {quiz.questionCount || 0} Qs
                        {quiz.uploader?.username ? ` · @${quiz.uploader.username}` : ''}
                      </small>
                    </span>
                    <span className="global-search-score">
                      <Trophy size={13} />
                      {Math.round(quiz.avgScore || 0)}%
                    </span>
                  </Link>
                ))}
              </section>
            )}

            {!loading && showUsers && users.length > 0 && (
              <section>
                <div className="global-search-label">Users</div>
                {users.map((item) => (
                  <Link
                    key={item._id}
                    className="global-search-row"
                    to={`/@${item.username}`}
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="global-search-avatar">
                      {item.avatar ? <img src={item.avatar} alt={item.name || item.username} /> : <User size={15} />}
                    </span>
                    <span className="global-search-main">
                      <strong>{item.name || item.username}</strong>
                      <small>@{item.username} · {item.followersCount || 0} followers</small>
                    </span>
                  </Link>
                ))}
              </section>
            )}

            {!loading && !hasResults && (
              <div className="global-search-state">
                {trimmedQuery ? 'No public results found.' : 'Type to search users, or browse public quizzes.'}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{globalSearchStyles}</style>
    </div>
  );
}

const globalSearchStyles = `
  .global-search {
    position: relative;
    flex: 1;
    max-width: 520px;
    margin: 0 20px;
  }

  .global-search-box {
    height: 40px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 10px 0 12px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.72);
    color: var(--color-text-muted);
  }

  .global-search-box:focus-within {
    border-color: var(--color-primary);
    background: var(--color-surface);
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }

  .global-search-box input {
    min-width: 0;
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
  }

  .global-search-box input::placeholder {
    color: var(--color-text-muted);
  }

  .global-search-key,
  .global-search-clear {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .global-search-clear {
    cursor: pointer;
  }

  .global-search-popover {
    position: absolute;
    top: calc(100% + 10px);
    left: 0;
    right: 0;
    z-index: 80;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 14px;
    background: var(--color-surface);
    box-shadow: 0 20px 60px rgba(24, 24, 27, 0.16);
  }

  .global-search-tabs,
  .global-search-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-bottom: 1px solid var(--color-border-light);
  }

  .global-search-tabs button {
    height: 30px;
    padding: 0 11px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
  }

  .global-search-tabs button.active {
    border-color: var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
  }

  .global-search-filters {
    color: var(--color-text-muted);
  }

  .global-search-filters select {
    min-width: 0;
    flex: 1;
    height: 32px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 13px;
    padding: 0 8px;
  }

  .global-search-results {
    max-height: 420px;
    overflow-y: auto;
    padding: 8px;
  }

  .global-search-label {
    padding: 8px 8px 5px;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .global-search-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 10px;
    color: var(--color-text);
    text-decoration: none;
  }

  .global-search-row:hover {
    background: var(--color-surface-alt);
  }

  .global-search-icon,
  .global-search-avatar {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--color-primary-light);
    color: var(--color-primary);
    overflow: hidden;
  }

  .global-search-avatar {
    border-radius: 50%;
    background: var(--color-surface-alt);
  }

  .global-search-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .global-search-main {
    min-width: 0;
    flex: 1;
  }

  .global-search-main strong,
  .global-search-main small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .global-search-main strong {
    font-size: 14px;
    line-height: 1.25;
  }

  .global-search-main small,
  .global-search-score {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .global-search-score {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
  }

  .global-search-state {
    padding: 26px 14px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  @media (max-width: 900px) {
    .global-search {
      order: 3;
      width: 100%;
      max-width: none;
      margin: 10px 0 0;
      flex-basis: 100%;
    }
  }
`;
