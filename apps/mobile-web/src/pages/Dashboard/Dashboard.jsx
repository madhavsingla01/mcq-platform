import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Play, ArrowRight, Target, Award, BookOpen, RotateCcw, Sparkles } from 'lucide-react';
import { quizApi, socialApi, attemptApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore();

  const [quizzes, setQuizzes] = useState([]);
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [stats, setStats] = useState({
    dayStreak: 0,
    accuracy: 0,
    quizzesDone: 0,
    globalRank: '#-',
  });
  const [featuredChallenge, setFeaturedChallenge] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      if (isAuthLoading) return;
      setLoading(true);
      try {
        const inProgressPromise = isAuthenticated
          ? attemptApi.getInProgress().catch(() => ({ data: { data: { attempts: [] } } }))
          : Promise.resolve({ data: { data: { attempts: [] } } });

        const [quizzesRes, overviewRes, inProgressRes] = await Promise.all([
          quizApi.getAll({ limit: 8 }).catch(() => ({ data: { data: { quizzes: [] } } })),
          socialApi.getChallengesOverview().catch(() => ({ data: { data: {} } })),
          inProgressPromise,
        ]);

        if (!mounted) return;

        // Quizzes
        const quizList = quizzesRes.data?.data?.quizzes || quizzesRes.data?.data || quizzesRes.data || [];
        setQuizzes(Array.isArray(quizList) ? quizList : []);

        // Challenges & Stats Overview
        const overview = overviewRes.data?.data || {};
        if (overview.stats) {
          setStats({
            dayStreak: overview.stats.dayStreak ?? user?.streak ?? 0,
            accuracy: overview.stats.accuracy ?? 0,
            quizzesDone: overview.stats.quizzesDone ?? 0,
            globalRank: overview.stats.globalRank ?? '#-',
          });
        }
        if (overview.featuredChallenge) {
          setFeaturedChallenge(overview.featuredChallenge);
        } else if (Array.isArray(quizList) && quizList.length > 0) {
          setFeaturedChallenge(quizList[0]);
        }

        // Active In-Progress Attempt
        const attempts = inProgressRes.data?.data?.attempts || inProgressRes.data?.data || [];
        if (Array.isArray(attempts) && attempts.length > 0) {
          setActiveAttempt(attempts[0]);
        }
      } catch (err) {
        console.error('Failed to load dashboard data from backend:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDashboard();
    return () => { mounted = false; };
  }, [isAuthenticated, isAuthLoading, user]);

  const targetQuizId = featuredChallenge?._id || (quizzes.length > 0 ? quizzes[0]._id : null);

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Daily Flame Streak Hero Card */}
      <div style={{
        background: 'linear-gradient(145deg, #18181B 0%, #101012 100%)',
        border: '1px solid rgba(255, 69, 0, 0.3)',
        borderRadius: 'var(--radius-card)',
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Daily Streak
          </span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
            {stats.dayStreak} {stats.dayStreak === 1 ? 'Day' : 'Days'} Active
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {stats.dayStreak > 0 ? 'Keep up your daily momentum' : 'Complete 1 quiz today to kick off your streak!'}
          </div>
        </div>
        <div style={{
          width: '54px',
          height: '54px',
          borderRadius: 'var(--radius-control)',
          background: 'rgba(255, 69, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Flame size={32} color="var(--color-accent)" fill="var(--color-accent)" />
        </div>
      </div>

      {/* In-Progress Resume Card (If active attempt exists in backend) */}
      {activeAttempt && (
        <div
          onClick={() => navigate(`/quiz/${activeAttempt.quizId || activeAttempt.quiz?._id || activeAttempt.quiz}`)}
          style={{
            background: 'linear-gradient(135deg, rgba(255, 69, 0, 0.15) 0%, var(--bg-card) 100%)',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-card)',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
          className="interactive-tap"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-control)',
              background: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000000',
            }}>
              <RotateCcw size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-text)' }}>
                Resume In-Progress Quiz
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                {activeAttempt.progress?.answeredCount || 0} answered • Tap to continue
              </div>
            </div>
          </div>
          <ArrowRight size={18} color="var(--color-accent)" />
        </div>
      )}

      {/* Quick Action: Start Rapid Practice */}
      <div 
        onClick={() => {
          if (targetQuizId) {
            navigate(`/quiz/${targetQuizId}`);
          } else {
            navigate('/explore');
          }
        }}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        className="interactive-tap"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--radius-control)',
            background: 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#000000',
            fontWeight: 800,
          }}>
            <Play size={22} fill="#000000" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--color-text)' }}>
              Quick Practice
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              {featuredChallenge ? featuredChallenge.title : 'Take latest community challenge'}
            </div>
          </div>
        </div>
        <ArrowRight size={18} color="var(--color-text-muted)" />
      </div>

      {/* Performance Summary Metrics (Live Backend Stats) */}
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
          Your Performance
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-control)',
            padding: '14px 10px',
            textAlign: 'center',
          }}>
            <Target size={18} color="var(--color-accent)" style={{ margin: '0 auto 6px' }} />
            <div style={{ fontSize: '18px', fontWeight: 800 }}>{stats.accuracy}%</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Accuracy</div>
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-control)',
            padding: '14px 10px',
            textAlign: 'center',
          }}>
            <BookOpen size={18} color="var(--color-info)" style={{ margin: '0 auto 6px' }} />
            <div style={{ fontSize: '18px', fontWeight: 800 }}>{stats.quizzesDone}</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Quizzes Done</div>
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-control)',
            padding: '14px 10px',
            textAlign: 'center',
          }}>
            <Award size={18} color="var(--color-warning)" style={{ margin: '0 auto 6px' }} />
            <div style={{ fontSize: '18px', fontWeight: 800 }}>{stats.globalRank}</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Global Rank</div>
          </div>
        </div>
      </div>

      {/* Recommended Quizzes (Live Database Quizzes) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' }}>
            Live Quizzes
          </span>
          <button 
            onClick={() => navigate('/explore')}
            style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-accent)' }}
          >
            Explore All
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Loading live quizzes...
            </div>
          ) : quizzes.length === 0 ? (
            <div style={{
              padding: '30px 20px',
              textAlign: 'center',
              background: 'var(--bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
            }}>
              <Sparkles size={24} color="var(--color-text-muted)" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '14px', fontWeight: 600 }}>No public quizzes found</div>
            </div>
          ) : quizzes.map((q) => (
            <div
              key={q._id}
              onClick={() => navigate(`/quiz/${q._id}`)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
              className="interactive-tap"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, paddingRight: '10px' }}>
                <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-text)' }}>
                  {q.title}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  <span>{q.questionCount || q.questionsCount || q.questions?.length || 1} questions</span>
                  <span>•</span>
                  <span style={{
                    color: q.difficulty === 'Hard' || q.difficulty === 'Advanced' ? 'var(--color-danger)' : q.difficulty === 'Easy' || q.difficulty === 'Beginner' ? 'var(--color-success)' : 'var(--color-warning)',
                    fontWeight: 600,
                  }}>
                    {q.difficulty || 'Medium'}
                  </span>
                  {q.uploader?.name && (
                    <>
                      <span>•</span>
                      <span>by {q.uploader.name}</span>
                    </>
                  )}
                </div>
              </div>
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--bg-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent)',
              }}>
                <Play size={16} fill="var(--color-accent)" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
