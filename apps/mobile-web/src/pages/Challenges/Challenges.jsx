import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Flame, Zap, Award, Crown, Users, Sparkles, Play, BookOpen } from 'lucide-react';
import { socialApi, quizApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export default function Challenges() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('arena'); // 'arena' | 'leaderboard'

  const [overview, setOverview] = useState({
    stats: {
      dayStreak: 0,
      quizzesDone: 0,
      globalRank: '#-',
      accuracy: 0,
      correctAnswers: 0,
    },
    featuredChallenge: null,
    trendingChallenges: [],
    topCreators: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      socialApi.getChallengesOverview().catch(() => ({ data: { data: {} } })),
      quizApi.getAll({ limit: 4 }).catch(() => ({ data: { data: { quizzes: [] } } })),
    ])
      .then(([socialRes, quizzesRes]) => {
        if (!mounted) return;
        const data = socialRes.data?.data || {};
        const quizList = quizzesRes.data?.data?.quizzes || quizzesRes.data?.data || [];
        const fallbackChallenge = Array.isArray(quizList) && quizList.length > 0 ? quizList[0] : null;

        setOverview({
          stats: data.stats || {
            dayStreak: user?.streak ?? 0,
            quizzesDone: 0,
            globalRank: '#-',
            accuracy: 0,
            correctAnswers: 0,
          },
          featuredChallenge: data.featuredChallenge || fallbackChallenge,
          trendingChallenges: (data.trendingChallenges && data.trendingChallenges.length > 0)
            ? data.trendingChallenges
            : (Array.isArray(quizList) ? quizList.slice(1) : []),
          topCreators: data.topCreators || [],
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load live challenges overview:', err);
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [user]);

  const featured = overview.featuredChallenge || (overview.trendingChallenges.length > 0 ? overview.trendingChallenges[0] : null);
  const creators = overview.topCreators || [];

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header Tabs */}
      <div style={{
        display: 'flex',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-pill)',
        padding: '4px',
      }}>
        <button
          onClick={() => setActiveTab('arena')}
          style={{
            flex: 1,
            padding: '8px 0',
            borderRadius: 'var(--radius-pill)',
            background: activeTab === 'arena' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'arena' ? 'var(--color-text)' : 'var(--color-text-muted)',
            fontWeight: 700,
            fontSize: '13px',
            border: activeTab === 'arena' ? '1px solid var(--color-border)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all var(--duration-fast) var(--ease-out)',
          }}
        >
          <Zap size={15} color={activeTab === 'arena' ? 'var(--color-accent)' : 'inherit'} />
          <span>Daily Arena</span>
        </button>

        <button
          onClick={() => setActiveTab('leaderboard')}
          style={{
            flex: 1,
            padding: '8px 0',
            borderRadius: 'var(--radius-pill)',
            background: activeTab === 'leaderboard' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'leaderboard' ? 'var(--color-text)' : 'var(--color-text-muted)',
            fontWeight: 700,
            fontSize: '13px',
            border: activeTab === 'leaderboard' ? '1px solid var(--color-border)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all var(--duration-fast) var(--ease-out)',
          }}
        >
          <Trophy size={15} color={activeTab === 'leaderboard' ? 'var(--color-warning)' : 'inherit'} />
          <span>Leaderboard</span>
        </button>
      </div>

      {activeTab === 'arena' ? (
        <>
          {/* Active Featured Challenge from Backend */}
          {featured ? (
            <div style={{
              background: 'linear-gradient(135deg, #18181B 0%, #101012 100%)',
              border: '1px solid rgba(255, 69, 0, 0.4)',
              borderRadius: 'var(--radius-card)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 69, 0, 0.15)',
                  color: 'var(--color-accent)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                }}>
                  <Sparkles size={13} />
                  <span>Featured Arena Challenge</span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {featured.difficulty || 'Medium'}
                </span>
              </div>

              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-text)', marginBottom: '4px' }}>
                  {featured.title}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                  {featured.description || 'Test your speed and precision against the community.'}
                </div>
              </div>

              <button
                onClick={() => navigate(`/quiz/${featured._id}`)}
                style={{
                  background: 'var(--color-accent)',
                  color: '#000000',
                  fontWeight: 800,
                  fontSize: '15px',
                  padding: '12px 20px',
                  borderRadius: 'var(--radius-pill)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: 'none',
                }}
                className="interactive-tap"
              >
                <Zap size={18} fill="#000000" />
                <span>Enter Arena Challenge</span>
              </button>
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              padding: '24px',
              textAlign: 'center',
            }}>
              <Sparkles size={24} color="var(--color-accent)" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Ready for New Challenges</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Complete more quizzes to unlock custom community arenas.
              </div>
            </div>
          )}

          {/* Real User Stats & Streak Milestones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
              Your Arena Metrics
            </span>

            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(255, 69, 0, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Flame size={20} color="var(--color-accent)" fill="var(--color-accent)" />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Active Streak</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {overview.stats.dayStreak} consecutive days
                  </div>
                </div>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-accent)' }}>
                {overview.stats.dayStreak}d
              </span>
            </div>

            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(48, 209, 88, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Award size={20} color="var(--color-success)" />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Accuracy on Challenges</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {overview.stats.correctAnswers} correct solutions
                  </div>
                </div>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-success)' }}>
                {overview.stats.accuracy}%
              </span>
            </div>
          </div>
        </>
      ) : (
        /* Real Leaderboard View from Backend */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Loading leaderboard rankings...
            </div>
          ) : creators.length === 0 ? (
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              padding: '30px 20px',
              textAlign: 'center',
            }}>
              <Trophy size={28} color="var(--color-warning)" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Leaderboard Refreshing</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Take quizzes today to register your score on the leaderboard.
              </div>
            </div>
          ) : (
            <>
              {/* Podium for Top 3 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                alignItems: 'end',
                paddingTop: '20px',
                paddingBottom: '10px',
              }}>
                {/* Rank 2 */}
                {creators[1] && (
                  <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)',
                    padding: '14px 8px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <div style={{ fontSize: '24px' }}>🥈</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                      {creators[1].fullName || creators[1].name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {creators[1].followersText || 'Top Creator'}
                    </div>
                  </div>
                )}

                {/* Rank 1 */}
                {creators[0] && (
                  <div style={{
                    background: 'linear-gradient(180deg, #222226 0%, #161618 100%)',
                    border: '1px solid rgba(255, 214, 10, 0.4)',
                    borderRadius: 'var(--radius-card)',
                    padding: '20px 8px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    transform: 'translateY(-10px)',
                  }}>
                    <div style={{ fontSize: '32px' }}>👑</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-warning)' }}>
                      {creators[0].fullName || creators[0].name}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>
                      {creators[0].followersText || 'Community Leader'}
                    </div>
                  </div>
                )}

                {/* Rank 3 */}
                {creators[2] && (
                  <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)',
                    padding: '14px 8px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <div style={{ fontSize: '24px' }}>🥉</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                      {creators[2].fullName || creators[2].name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {creators[2].followersText || 'Top Creator'}
                    </div>
                  </div>
                )}
              </div>

              {/* Ranks 4+ List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {creators.slice(3).map((item, idx) => (
                  <div
                    key={item._id || idx}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-control)',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-text-muted)', width: '20px' }}>
                        #{idx + 4}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{item.fullName || item.name}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      {item.followersText || 'Creator'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
