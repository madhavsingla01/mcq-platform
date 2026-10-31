import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Play, Sparkles, BookOpen, Clock, User, Tag, Copy, Check } from 'lucide-react';
import { socialApi } from '../../api/client';

export default function Explore() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [availableTags, setAvailableTags] = useState(['All']);
  const [copiedCode, setCopiedCode] = useState('');

  const handleCopyCode = (e, code) => {
    e.stopPropagation();
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const applyPrefix = (prefix) => {
    setSearchQuery((prev) => {
      const clean = prev.replace(/^[@!#]+/, '');
      return `${prefix}${clean}`;
    });
  };

  // Fetch explore feed dynamically from API Gateway
  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const params = {
      limit: 30,
      mode: 'foryou',
    };
    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
    }
    if (selectedTag && selectedTag !== 'All') {
      params.tag = selectedTag;
    }

    socialApi.getExplore(params)
      .then((res) => {
        if (!mounted) return;
        const feed = res.data?.data?.quizzes || res.data?.data || res.data?.quizzes || [];
        const quizList = Array.isArray(feed) ? feed : [];
        setQuizzes(quizList);

        // Derive dynamic tags from backend quizzes (support array and string)
        setAvailableTags((prev) => {
          const tagSet = new Set(prev);
          quizList.forEach((q) => {
            const rawTags = Array.isArray(q.tags)
              ? q.tags
              : typeof q.tags === 'string'
                ? q.tags.split(/\s+/)
                : [];
            rawTags.forEach((t) => {
              if (t && typeof t === 'string' && t.trim()) {
                tagSet.add(t.trim().replace(/^#/, ''));
              }
            });
            if (q.category && typeof q.category === 'string' && q.category.trim()) {
              tagSet.add(q.category.trim());
            }
          });
          return Array.from(tagSet).slice(0, 12);
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load live explore quizzes:', err);
        if (mounted) {
          setQuizzes([]);
          setLoading(false);
        }
      });

    return () => { mounted = false; };
  }, [searchQuery, selectedTag]);

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Search Header */}
      <div style={{ position: 'relative' }}>
        <Search 
          size={18} 
          color="var(--color-text-muted)" 
          style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} 
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search @users, !quiz codes, #topics..."
          style={{
            width: '100%',
            height: '46px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)',
            paddingLeft: '42px',
            paddingRight: '16px',
            color: 'var(--color-text)',
            outline: 'none',
            fontSize: '16px', /* Prevents iOS auto-zoom */
          }}
        />
      </div>

      {/* Quick Prefix Fast-Search Syntax */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
          Fast:
        </span>
        <button
          type="button"
          onClick={() => applyPrefix('!')}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            background: searchQuery.startsWith('!') ? 'var(--color-accent)' : 'var(--bg-elevated)',
            color: searchQuery.startsWith('!') ? '#000000' : 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          className="interactive-tap"
        >
          <span style={{ color: searchQuery.startsWith('!') ? '#000000' : 'var(--color-accent)', fontWeight: 800 }}>!</span> Quizzes
        </button>
        <button
          type="button"
          onClick={() => applyPrefix('@')}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            background: searchQuery.startsWith('@') ? 'var(--color-accent)' : 'var(--bg-elevated)',
            color: searchQuery.startsWith('@') ? '#000000' : 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          className="interactive-tap"
        >
          <span style={{ color: searchQuery.startsWith('@') ? '#000000' : 'var(--color-accent)', fontWeight: 800 }}>@</span> Users
        </button>
        <button
          type="button"
          onClick={() => applyPrefix('#')}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            background: searchQuery.startsWith('#') ? 'var(--color-accent)' : 'var(--bg-elevated)',
            color: searchQuery.startsWith('#') ? '#000000' : 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          className="interactive-tap"
        >
          <span style={{ color: searchQuery.startsWith('#') ? '#000000' : 'var(--color-accent)', fontWeight: 800 }}>#</span> Topics
        </button>
      </div>

      {/* Dynamic Category / Tag Pills from Backend */}
      <div style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '4px',
        margin: '0 -16px',
        paddingLeft: '16px',
        paddingRight: '16px',
        scrollbarWidth: 'none',
      }}>
        {availableTags.map((tag) => {
          const isSelected = selectedTag === tag;
          return (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              style={{
                flexShrink: 0,
                padding: '8px 16px',
                borderRadius: 'var(--radius-pill)',
                background: isSelected ? 'var(--color-accent)' : 'var(--bg-card)',
                color: isSelected ? '#000000' : 'var(--color-text-secondary)',
                fontWeight: isSelected ? 700 : 500,
                fontSize: '13px',
                border: isSelected ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                transition: 'all var(--duration-fast) var(--ease-out)',
              }}
              className="interactive-tap"
            >
              #{tag}
            </button>
          );
        })}
      </div>

      {/* Live Quizzes Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
          {quizzes.length} {quizzes.length === 1 ? 'Quiz' : 'Quizzes'} Found in Database
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Loading challenge feed from database...
          </div>
        ) : quizzes.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            background: 'var(--bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Sparkles size={28} color="var(--color-text-muted)" />
            <div style={{ fontWeight: 700, fontSize: '16px' }}>No Quizzes Found</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              {searchQuery ? `No results matching "${searchQuery}".` : 'No public quizzes in this category yet.'}
            </div>
          </div>
        ) : (
          quizzes.map((quiz) => {
            const author = quiz.uploader?.name || quiz.uploader?.username || quiz.creatorName || 'Community';
            const count = quiz.questionCount || quiz.questionsCount || quiz.questions?.length || 1;

            return (
              <div
                key={quiz._id}
                onClick={() => navigate(`/quiz/${quiz._id}`)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-card)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  cursor: 'pointer',
                }}
                className="interactive-tap"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--color-text)' }}>
                      {quiz.title}
                    </span>
                    {quiz.quizCode && (
                      <span
                        onClick={(e) => handleCopyCode(e, quiz.quizCode)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          alignSelf: 'flex-start',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#E5E7EB',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.16)',
                          borderRadius: '6px',
                          padding: '2px 7px',
                          cursor: 'copy',
                        }}
                        className="interactive-tap"
                        title="Tap to copy Quiz ID"
                      >
                        <span style={{ color: 'var(--color-accent)', fontWeight: 800 }}>!</span>
                        <span>{quiz.quizCode.replace(/^!/, '')}</span>
                        {copiedCode === quiz.quizCode ? (
                          <Check size={11} color="#10B981" />
                        ) : (
                          <Copy size={11} color="rgba(255, 255, 255, 0.4)" />
                        )}
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-pill)',
                    background: quiz.difficulty === 'Hard' || quiz.difficulty === 'Advanced' 
                      ? 'var(--color-danger-subtle)' 
                      : quiz.difficulty === 'Easy' || quiz.difficulty === 'Beginner' 
                        ? 'var(--color-success-subtle)' 
                        : 'var(--color-warning-subtle)',
                    color: quiz.difficulty === 'Hard' || quiz.difficulty === 'Advanced' 
                      ? 'var(--color-danger)' 
                      : quiz.difficulty === 'Easy' || quiz.difficulty === 'Beginner' 
                        ? 'var(--color-success)' 
                        : 'var(--color-warning)',
                    flexShrink: 0,
                  }}>
                    {quiz.difficulty || 'Medium'}
                  </span>
                </div>

                {quiz.description && (
                  <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    {quiz.description}
                  </div>
                )}

                {/* Tags row */}
                {quiz.tags && quiz.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {quiz.tags.map((t, tidx) => (
                      <span key={tidx} style={{
                        fontSize: '11px',
                        color: 'var(--color-text-muted)',
                        background: 'var(--bg-elevated)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid var(--color-border)',
                      }}>
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <BookOpen size={14} />
                      <span>{count} {count === 1 ? 'MCQ' : 'MCQs'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <User size={14} />
                      <span>{author}</span>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--color-accent)',
                    color: '#000000',
                    fontWeight: 700,
                    fontSize: '13px',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-pill)',
                  }}>
                    <Play size={14} fill="#000000" />
                    <span>Start</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
