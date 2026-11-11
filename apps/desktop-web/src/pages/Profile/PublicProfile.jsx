import { rankSearchResults } from '../../components/search/rankSearchResults';
import { usePageSearch } from '../../components/search/PageSearchContext';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Edit3,
  ExternalLink,
  FileQuestion,
  Globe,
  User,
  Users,
  Link as LinkIcon,
  UserCheck,
  UserPlus,
  Lock,
  MessageSquare,
  X,
  Camera,
  Trash2,
  Activity,
  Trophy,
  Heart,
  Bookmark,
  Sparkles,
  Clock,
  CheckCircle2,
  CheckCircle,
  Search,
  Mail,
  Copy,
  Flag,
  Share2,
  Bell,
  ChevronDown,
  Info,
  ArrowRight,
  ShieldCheck,
  Check,
  Loader2,
} from 'lucide-react';
import {
  FaGithub,
  FaTwitter,
  FaLinkedin,
  FaYoutube,
  FaInstagram,
  FaTiktok,
  FaSpotify,
  FaDiscord,
} from 'react-icons/fa';
import api from '../../api/axios';
import { runWithUploadPanel } from '../../store/uploadPanelStore';
import { MediaService } from '../../services/media.service';
import { useAuthStore } from '../../store/authStore';
import { Spinner, EmptyState } from '../../components/ui';
import QuizCard from '../../components/quiz/QuizCard';
import ShareModal from '../../components/social/ShareModal';
import { messageService } from '../../services/message.service';
import { toast } from 'sonner';
import './PublicProfile.css';

const formatDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const formatFullDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const normalizeUrl = (value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);

const getPlatformIcon = (platform) => {
  switch ((platform || '').toLowerCase()) {
    case 'twitter':
    case 'x':
      return <FaTwitter size={15} />;
    case 'github':
      return <FaGithub size={15} />;
    case 'linkedin':
      return <FaLinkedin size={15} />;
    case 'youtube':
      return <FaYoutube size={15} />;
    case 'instagram':
      return <FaInstagram size={15} />;
    case 'tiktok':
      return <FaTiktok size={15} />;
    case 'spotify':
      return <FaSpotify size={15} />;
    case 'discord':
      return <FaDiscord size={15} />;
    case 'newsletter':
      return <Mail size={15} />;
    case 'website':
    case 'courses':
    case 'portfolio':
      return <Globe size={15} />;
    default:
      return <LinkIcon size={15} />;
  }
};

export default function PublicProfile() {
  const navigate = useNavigate();
  const { profileId, username: routeUsername } = useParams();
  const rawParam = decodeURIComponent(routeUsername || profileId || '').trim();
  const username = rawParam.replace(/^@/, '').toLowerCase();
  const { user } = useAuthStore();

  const [profile, setProfile] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);

  // Content tabs: 'quizzes' | 'challenges' | 'activity'
  const [activeTab, setActiveTab] = useState('quizzes');
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityFilter, setActivityFilter] = useState('all');

  // YouTube features: About Modal, In-channel Search, Copied Toast
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [shareProfileOpen, setShareProfileOpen] = useState(false);
  const { query: searchQuery, setQuery: setSearchQuery } = usePageSearch();
  const [copiedLink, setCopiedLink] = useState(false);
  const [isReporting, setIsReporting] = useState(false);

  // Floating modal state: null | 'followers' | 'following'
  const [networkModalType, setNetworkModalType] = useState(null);
  const [quizPage, setQuizPage] = useState(1);
  const QUIZZES_PER_PAGE = 6;
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [loadingFollowing, setLoadingFollowing] = useState(false);

  const challengeQuizzes = useMemo(() => {
    return quizzes.filter((q) => q.isChallenge === true);
  }, [quizzes]);

  const visibleQuizzes = useMemo(() => {
    const list = activeTab === 'challenges' ? challengeQuizzes : quizzes;
    return rankSearchResults(list, searchQuery, item => [item.title, item.description, item.category]);
  }, [quizzes, challengeQuizzes, activeTab, searchQuery]);

  const totalQuizPages = Math.max(1, Math.ceil(visibleQuizzes.length / QUIZZES_PER_PAGE));
  const pagedQuizzes = useMemo(() => {
    return visibleQuizzes.slice((quizPage - 1) * QUIZZES_PER_PAGE, quizPage * QUIZZES_PER_PAGE);
  }, [visibleQuizzes, quizPage]);

  useEffect(() => {
    setQuizPage(1);
  }, [activeTab, searchQuery]);

  const fetchProfile = async () => {
    if (!username) return;
    setLoading(true);
    setError('');
    try {
      const [profileRes, quizzesRes, activityRes] = await Promise.all([
        api.get(`/users/${username}`),
        api.get(`/users/${username}/quizzes`, { params: { limit: 50 } }),
        api.get(`/users/${username}/activity`, { params: { page: 1, limit: 20 } }).catch(() => ({ data: { data: { activities: [], total: 0 } } })),
      ]);
      const prof = profileRes.data.data.profile;
      setProfile(prof);
      setIsFollowing(prof.isFollowing === true);
      setFollowersCount(prof.followersCount || 0);
      setQuizzes(quizzesRes.data.data?.quizzes || []);

      const actData = activityRes.data?.data || {};
      const initialActivities = actData.activities || [];
      setActivities(initialActivities);
      const totalActs = actData.total ?? actData.pagination?.total ?? initialActivities.length;
      setActivityTotal(totalActs);
      setActivityHasMore(initialActivities.length < totalActs);
      setActivityPage(1);
    } catch (err) {
      setError(err.response?.data?.message || 'Profile not found');
      setProfile(null);
      setQuizzes([]);
      setActivities([]);
      setActivityTotal(0);
      setActivityHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMoreActivities = async () => {
    if (loadingActivities || !activityHasMore) return;
    const nextPage = activityPage + 1;
    setLoadingActivities(true);
    try {
      const res = await api.get(`/users/${username}/activity`, {
        params: { page: nextPage, limit: 20 },
      });
      const newItems = res.data?.data?.activities || [];
      const totalActs = res.data?.data?.total ?? res.data?.data?.pagination?.total ?? activityTotal;
      setActivities((prev) => {
        const existingIds = new Set(prev.map((a) => a._id));
        const filteredNew = newItems.filter((a) => !existingIds.has(a._id));
        const combined = [...prev, ...filteredNew];
        setActivityHasMore(combined.length < totalActs && newItems.length > 0);
        return combined;
      });
      setActivityPage(nextPage);
      setActivityTotal(totalActs);
    } catch (err) {
      console.error('Failed to load more activities:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  const filteredActivities = useMemo(() => {
    if (activityFilter === 'attempts') {
      return activities.filter((a) => a.verb === 'quiz_attempted');
    }
    if (activityFilter === 'created') {
      return activities.filter((a) => a.verb === 'quiz_published');
    }
    if (activityFilter === 'interactions') {
      return activities.filter((a) => ['quiz_liked', 'quiz_bookmarked', 'followed', 'commented'].includes(a.verb));
    }
    return activities;
  }, [activities, activityFilter]);

  const attemptsCount = useMemo(() => activities.filter((a) => a.verb === 'quiz_attempted').length, [activities]);
  const createdCount = useMemo(() => activities.filter((a) => a.verb === 'quiz_published').length, [activities]);
  const interactionsCount = useMemo(() => activities.filter((a) => ['quiz_liked', 'quiz_bookmarked', 'followed', 'commented'].includes(a.verb)).length, [activities]);

  useEffect(() => {
    fetchProfile();
    setNetworkModalType(null);
  }, [username]);

  // Close modals on Escape key
  useEffect(() => {
    if (!networkModalType && !aboutModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (aboutModalOpen) setAboutModalOpen(false);
        if (networkModalType) setNetworkModalType(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [networkModalType, aboutModalOpen]);

  const loadFollowers = async () => {
    setLoadingFollowers(true);
    try {
      const res = await api.get(`/users/${username}/followers`);
      setFollowers(res.data.data?.users || []);
    } catch (err) {
      console.error('Failed to load followers:', err);
    } finally {
      setLoadingFollowers(false);
    }
  };

  const loadFollowing = async () => {
    setLoadingFollowing(true);
    try {
      const res = await api.get(`/users/${username}/following`);
      setFollowing(res.data.data?.users || []);
    } catch (err) {
      console.error('Failed to load following:', err);
    } finally {
      setLoadingFollowing(false);
    }
  };

  const openNetworkModal = (type) => {
    setNetworkModalType(type);
    if (type === 'followers') {
      loadFollowers();
    } else if (type === 'following') {
      loadFollowing();
    }
  };

  const handleToggleFollow = async () => {
    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    const nextFollowing = !isFollowing;
    setIsFollowing(nextFollowing);
    setFollowersCount(nextFollowing ? followersCount + 1 : Math.max(followersCount - 1, 0));

    try {
      const method = nextFollowing ? 'post' : 'delete';
      await api[method](`/users/${username}/follow`);
      // If following or unfollowing a private profile, reload quizzes/followers
      if (profile?.isPrivate) {
        const quizzesRes = await api.get(`/users/${username}/quizzes`, { params: { limit: 50 } });
        setQuizzes(quizzesRes.data.data?.quizzes || []);
        if (networkModalType === 'followers') loadFollowers();
        if (networkModalType === 'following') loadFollowing();
      }
    } catch {
      setIsFollowing(!nextFollowing);
      setFollowersCount(followersCount);
    }
  };

  const handleToggleUserCardFollow = async (targetUser) => {
    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    const isCurrentlyFollowing = targetUser.isFollowing;
    const nextState = !isCurrentlyFollowing;

    // Optimistic update in both lists
    const updater = (list) =>
      list.map((u) => (u._id === targetUser._id ? { ...u, isFollowing: nextState } : u));
    setFollowers(updater);
    setFollowing(updater);

    try {
      const method = nextState ? 'post' : 'delete';
      await api[method](`/users/${targetUser.username}/follow`);
    } catch {
      // Revert on error
      const revert = (list) =>
        list.map((u) => (u._id === targetUser._id ? { ...u, isFollowing: isCurrentlyFollowing } : u));
      setFollowers(revert);
      setFollowing(revert);
    }
  };

  const bannerInputRef = useRef(null);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [bannerError, setBannerError] = useState(false);

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingBanner(true);
      const { compressImage } = await import('../../utils/imageCompressor');
      const compressed = await compressImage(file, {
        maxWidth: 1920,
        maxHeight: 600,
        quality: 0.85,
        outputFormat: 'image/webp',
      });

      const bannerFile = compressed.file || file;
      const res = await runWithUploadPanel(bannerFile, { purpose: 'Profile banner' }, (onUploadProgress) => (
        MediaService.uploadImage(bannerFile, 'profile-banner', onUploadProgress)
          .then((asset) => api.post('/auth/me/banner', { imageUrl: asset.url }))
      ));

      const newBanner = res.data?.data?.banner;
      setProfile((prev) => (prev ? { ...prev, banner: newBanner } : prev));
      setBannerError(false);
      if (user) {
        useAuthStore.setState({ user: { ...user, banner: newBanner } });
      }
    } catch (err) {
      console.error('Failed to upload banner:', err);
      toast.error(err.response?.data?.message || 'Failed to upload profile banner.');
    } finally {
      setIsUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    }
  };

  const handleRemoveBanner = async () => {
    try {
      setIsUploadingBanner(true);
      await api.delete('/auth/me/banner');
      setProfile((prev) => (prev ? { ...prev, banner: '' } : prev));
      setBannerError(false);
      if (user) {
        useAuthStore.setState({ user: { ...user, banner: '' } });
      }
    } catch (err) {
      console.error('Failed to remove banner:', err);
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const isOwnProfile = profile && user && (user.username === profile.username || user._id === profile._id);
  const showRank = isOwnProfile || (profile?.preferences?.showRankOnProfile !== false && profile?.showRankOnProfile !== false);

  const customProfileUrl = useMemo(() => {
    if (!profile?.username) return '';
    return `${window.location.origin}/@${profile.username}`;
  }, [profile]);

  const handleCopyCustomUrl = async () => {
    try {
      await navigator.clipboard.writeText(customProfileUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleReportUser = async () => {
    if (!profile?._id || isReporting) return;
    setIsReporting(true);
    try {
      await api.post('/admin/reports/submit', {
        targetType: 'user',
        targetId: String(profile._id),
        targetTitle: profile.name || profile.username || 'User Profile',
        category: 'other',
        reason: 'channel_report',
        description: 'User profile reported for moderation review from public channel page.',
      });
      toast.success('Channel reported for moderation review. Thank you.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit report. Please try again.');
    } finally {
      setIsReporting(false);
    }
  };

  const { primaryDomain, additionalLinksCount } = useMemo(() => {
    let domain = '';
    let count = 0;
    if (profile?.website) {
      domain = profile.website.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    } else if (Array.isArray(profile?.socialLinks) && profile.socialLinks.length > 0) {
      const first = profile.socialLinks[0];
      domain = first.url ? first.url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '') : first.platform;
    }
    const totalLinks = (profile?.website ? 1 : 0) + (Array.isArray(profile?.socialLinks) ? profile.socialLinks.length : 0);
    if (totalLinks > 1) {
      count = totalLinks - 1;
    }
    return { primaryDomain: domain, additionalLinksCount: count };
  }, [profile]);

  const bioSnippet = useMemo(() => {
    if (!profile?.bio) return '';
    const firstLine = profile.bio.split('\n')[0];
    if (firstLine.length > 130) {
      return firstLine.slice(0, 130) + '...';
    }
    return firstLine;
  }, [profile?.bio]);

  if (!username) {
    return (
      <div className="profile-state-box">
        <strong>Profile not found</strong>
        <Link to="/explore" className="btn-back">Explore All Quizzes</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="profile-state-box">
        <Spinner size={36} />
        <span>Loading creator profile...</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="profile-state-box">
        <strong>{error || 'Profile not found'}</strong>
        <Link to="/explore" className="btn-back">Explore All Quizzes</Link>
      </div>
    );
  }

  const totalQuestions = quizzes.reduce((sum, q) => sum + (q.questionCount || q.questions?.length || 0), 0);
  const totalAttempts = quizzes.reduce((sum, q) => sum + (q.totalAttempts || 0), 0);
  const hasBanner = Boolean(profile.banner) && bannerError !== profile.banner;

  return (
    <div className="creator-profile-container yt-profile-container">
      {/* 1. YouTube Panoramic Channel Banner */}
      {hasBanner && (
        <div className="yt-banner-container">
          <div className="yt-banner-media">
            <img
              src={profile.banner}
              alt={`${profile.name || profile.username}'s Banner`}
              className="yt-banner-img"
              loading="lazy"
              decoding="async"
              onError={() => setBannerError(profile.banner)}
            />
            {isOwnProfile && (
              <div className="yt-banner-owner-actions">
                <button
                  type="button"
                  className="yt-banner-action-btn"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isUploadingBanner}
                  title="Change banner"
                >
                  <Camera size={14} />
                  <span>{isUploadingBanner ? 'Updating...' : 'Change Banner'}</span>
                </button>
                <button
                  type="button"
                  className="yt-banner-action-btn yt-banner-delete-btn"
                  onClick={handleRemoveBanner}
                  disabled={isUploadingBanner}
                  title="Remove banner"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {isOwnProfile && <input
          ref={bannerInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleBannerUpload}
        />}

      {/* 2. YouTube Channel Identity Header Row (Matches YouTube Fireship Screenshot 2) */}
      <section className="yt-channel-header">
        <div className="yt-avatar-wrapper">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.name || profile.username}
              className="yt-avatar-img"
              loading="lazy"
              decoding="async"
              width="128"
              height="128"
            />
          ) : (
            <div className="yt-avatar-placeholder">
              <User size={56} />
            </div>
          )}
        </div>

        <div className="yt-channel-info-col">
          {/* Channel Name & Verified Badge */}
          <div className="yt-title-row">
            <h2 className="yt-channel-name">{profile.name || profile.username}</h2>
            <span className="yt-verified-badge" title="Verified Creator">
              <CheckCircle2 size={20} className="yt-verified-icon" />
            </span>
            {profile.isPrivate && (
              <span className="yt-private-badge" title="This account is private">
                <Lock size={12} />
                <span>Private</span>
              </span>
            )}
          </div>

          {/* YouTube Single-Line Metadata Row */}
          <div className="yt-metadata-line">
            <span className="yt-handle">@{profile.username}</span>
            <span className="yt-meta-dot">•</span>
            <button
              type="button"
              className="yt-meta-link-btn"
              onClick={() => openNetworkModal('followers')}
            >
              {followersCount.toLocaleString()} {followersCount === 1 ? 'follower' : 'followers'}
            </button>
            <span className="yt-meta-dot">•</span>
            <button
              type="button"
              className="yt-meta-link-btn"
              onClick={() => openNetworkModal('following')}
            >
              {(profile.followingCount || 0).toLocaleString()} following
            </button>
            <span className="yt-meta-dot">•</span>
            <span className="yt-meta-stat">{quizzes.length} public {quizzes.length === 1 ? 'quiz' : 'quizzes'}</span>
            {showRank && (
              <>
                <span className="yt-meta-dot">•</span>
                <span className="yt-meta-stat">{profile.rank ? `Rank #${profile.rank} • ` : ''}{totalAttempts.toLocaleString()} {totalAttempts === 1 ? 'attempt' : 'attempts'}</span>
              </>
            )}
          </div>

          {/* YouTube Bio Snippet with ...more (Opens YouTube About Modal) */}
          {profile.bio && (
            <div className="yt-bio-row">
              <span className="yt-bio-text">{bioSnippet}</span>
              <button
                type="button"
                className="yt-more-btn"
                onClick={() => setAboutModalOpen(true)}
              >
                ...more
              </button>
            </div>
          )}

          {/* YouTube Links Summary Pill (e.g., fireship.dev and 5 more links) */}
          {primaryDomain && (
            <div className="yt-links-pill-row">
              <button
                type="button"
                className="yt-links-pill"
                onClick={() => setAboutModalOpen(true)}
              >
                <LinkIcon size={13} className="yt-pill-icon" />
                <span className="yt-pill-primary">{primaryDomain}</span>
                {additionalLinksCount > 0 && (
                  <span className="yt-pill-more">and {additionalLinksCount} more link{additionalLinksCount > 1 ? 's' : ''}</span>
                )}
                <ChevronDown size={12} className="yt-pill-arrow" />
              </button>
            </div>
          )}

          {/* YouTube Action Buttons */}
          <div className="yt-actions-row">
            {isOwnProfile ? (
              <>
                <Link to="/settings/public" className="yt-btn yt-btn-secondary">
                  <Edit3 size={15} />
                  <span>Customize Profile</span>
                </Link>
                <Link to="/create" className="yt-btn yt-btn-primary">
                  <span>Create Quiz</span>
                </Link>
                {!hasBanner && <button type="button" className="yt-btn yt-btn-secondary" onClick={() => bannerInputRef.current?.click()} disabled={isUploadingBanner}>
                  <Camera size={15} /> <span>{isUploadingBanner ? 'Uploading…' : 'Add banner'}</span>
                </button>}
              </>
            ) : (
              <>
                {isFollowing ? (
                  <button
                    type="button"
                    className="yt-btn yt-btn-subscribed"
                    onClick={handleToggleFollow}
                  >
                    <Bell size={15} />
                    <span>Following</span>
                    <ChevronDown size={13} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="yt-btn yt-btn-subscribe"
                    onClick={handleToggleFollow}
                  >
                    <span>Follow</span>
                  </button>
                )}

                <button
                  type="button"
                  className="yt-btn yt-btn-secondary"
                  onClick={async () => {
                    if (!user) {
                      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
                      return;
                    }
                    try {
                      const data = await messageService.startConversation({ recipientId: profile._id });
                      navigate(`/messages/${data.conversation._id}`);
                    } catch {
                      navigate('/messages');
                    }
                  }}
                  title={`Message @${profile.username}`}
                >
                  <MessageSquare size={15} />
                  <span>Message</span>
                </button>

              </>
            )}
          </div>
        </div>
      </section>

      {/* 3. YouTube Tabs Bar with Underline & In-Channel Search */}
      <section className="creator-quizzes-section">
        <div className="yt-nav-tabs-wrapper">
          <div className="yt-nav-tabs">
            <button
              type="button"
              className={`yt-nav-tab ${activeTab === 'quizzes' ? 'active' : ''}`}
              onClick={() => setActiveTab('quizzes')}
            >
              <span>Public Quizzes</span>
              <span className="yt-tab-badge">{quizzes.length}</span>
            </button>

            <button
              type="button"
              className={`yt-nav-tab ${activeTab === 'challenges' ? 'active' : ''}`}
              onClick={() => setActiveTab('challenges')}
            >
              <span>Challenges</span>
              <span className="yt-tab-badge">{challengeQuizzes.length}</span>
            </button>

            <button
              type="button"
              className={`yt-nav-tab ${activeTab === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveTab('activity')}
            >
              <span>Recent Activity</span>
              <span className="yt-tab-badge">{activityTotal || activities.length}</span>
            </button>

            <button
              type="button"
              className="yt-nav-tab yt-nav-tab-about"
              onClick={() => setAboutModalOpen(true)}
            >
              <span>About</span>
            </button>
          </div>

        </div>

        {profile?.isPrivate && !isFollowing && !isOwnProfile ? (
          <div className="no-items-card private-lock-card">
            <div className="private-lock-icon">
              <Lock size={36} />
            </div>
            <h3>This Account is Private</h3>
            <p>Follow @{profile.username} to see their quizzes, questions, and learning activity.</p>
          </div>
        ) : (activeTab === 'quizzes' || activeTab === 'challenges') ? (
          visibleQuizzes.length === 0 ? (
            searchQuery ? (
              <EmptyState
                icon={<Search size={24} />}
                title="No quizzes found"
                description={`No quizzes matching "${searchQuery}" on this channel.`}
                action={{
                  label: "Clear Search",
                  onClick: () => setSearchQuery(''),
                }}
              />
            ) : activeTab === 'challenges' ? (
              <EmptyState
                icon={<Trophy size={24} />}
                title="No challenges yet"
                description="This creator has not published any timed challenges yet."
                action={isOwnProfile ? {
                  label: "Create a Challenge",
                  to: "/challenges",
                } : null}
              />
            ) : (
              <EmptyState
                icon={<FileQuestion size={24} />}
                title="No public quizzes yet"
                description="This creator has not published any public quizzes yet."
                action={isOwnProfile ? {
                  label: "Build a Quiz",
                  to: "/create/quiz",
                } : null}
              />
            )
          ) : (
            <>
              <div className="creator-quizzes-grid">
                {pagedQuizzes.map((quiz) => (
                  <QuizCard key={quiz._id} quiz={quiz} />
                ))}
              </div>
              {totalQuizPages > 1 && (
                <div className="profile-pagination-bar">
                  <button
                    type="button"
                    className="profile-page-btn"
                    disabled={quizPage <= 1}
                    onClick={() => setQuizPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="profile-page-info">
                    Page {quizPage} of {totalQuizPages}
                  </span>
                  <button
                    type="button"
                    className="profile-page-btn"
                    disabled={quizPage >= totalQuizPages}
                    onClick={() => setQuizPage((p) => Math.min(totalQuizPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )
        ) : (
          /* Recent Activity Tab */
          <div className="profile-activity-container">
            {/* Filter pills */}
            <div className="profile-activity-filter-bar">
              <button
                type="button"
                className={`activity-filter-pill ${activityFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActivityFilter('all')}
              >
                All Activity <span className="filter-pill-num">({activities.length})</span>
              </button>
              <button
                type="button"
                className={`activity-filter-pill ${activityFilter === 'attempts' ? 'active' : ''}`}
                onClick={() => setActivityFilter('attempts')}
              >
                <Trophy size={13} />
                Quizzes Taken <span className="filter-pill-num">({attemptsCount})</span>
              </button>
              <button
                type="button"
                className={`activity-filter-pill ${activityFilter === 'created' ? 'active' : ''}`}
                onClick={() => setActivityFilter('created')}
              >
                <Sparkles size={13} />
                Created Quizzes <span className="filter-pill-num">({createdCount})</span>
              </button>
              <button
                type="button"
                className={`activity-filter-pill ${activityFilter === 'interactions' ? 'active' : ''}`}
                onClick={() => setActivityFilter('interactions')}
              >
                <Heart size={13} />
                Interactions <span className="filter-pill-num">({interactionsCount})</span>
              </button>
            </div>

            {filteredActivities.length === 0 ? (
              <EmptyState
                icon={<Activity size={24} />}
                title="No recent activity yet"
                description={
                  activityFilter === 'all'
                    ? `When @${profile.username} completes quizzes or publishes challenges, their activity will appear here.`
                    : `No activities matching this filter were found for @${profile.username}.`
                }
              />
            ) : (
              <div className="profile-activity-timeline">
                {filteredActivities.map((act) => {
                  const isAttempt = act.verb === 'quiz_attempted';
                  const isPublished = act.verb === 'quiz_published';
                  const isLiked = act.verb === 'quiz_liked';
                  const isBookmarked = act.verb === 'quiz_bookmarked';
                  const isFollowed = act.verb === 'followed';

                  return (
                    <div key={act._id} className="profile-activity-card">
                      <div className="activity-card-left">
                        <div className={`activity-type-icon-circle ${
                          isAttempt ? 'icon-attempt' :
                          isPublished ? 'icon-published' :
                          isLiked ? 'icon-liked' :
                          isBookmarked ? 'icon-bookmarked' :
                          isFollowed ? 'icon-followed' : 'icon-commented'
                        }`}>
                          {isAttempt && <Trophy size={17} />}
                          {isPublished && <Sparkles size={17} />}
                          {isLiked && <Heart size={17} />}
                          {isBookmarked && <Bookmark size={17} />}
                          {isFollowed && <UserPlus size={17} />}
                          {!isAttempt && !isPublished && !isLiked && !isBookmarked && !isFollowed && <MessageSquare size={17} />}
                        </div>

                        <div className="activity-card-details">
                          <div className="activity-card-title-row">
                            <span className="activity-actor-name">@{profile.username}</span>
                            <span className="activity-verb-label">
                              {isAttempt && 'completed'}
                              {isPublished && 'published quiz'}
                              {isLiked && 'liked'}
                              {isBookmarked && 'saved'}
                              {isFollowed && 'started following'}
                              {!isAttempt && !isPublished && !isLiked && !isBookmarked && !isFollowed && 'commented on'}
                            </span>
                            {act.quiz ? (
                              <Link to={`/quiz/${act.quiz._id}`} className="activity-quiz-link" title={act.quiz.title}>
                                "{act.quiz.title}"
                              </Link>
                            ) : act.targetUser ? (
                              <Link to={`/@${act.targetUser.username}`} className="activity-user-link">
                                @{act.targetUser.username}
                              </Link>
                            ) : (
                              <span className="activity-fallback-text">{act.actionText || act.action}</span>
                            )}
                          </div>

                          {act.quiz && (
                            <div className="activity-card-tags">
                              {act.quiz.category && (
                                <span className="activity-tag-pill category">{act.quiz.category}</span>
                              )}
                              {act.quiz.difficulty && (
                                <span className={`activity-tag-pill difficulty ${act.quiz.difficulty.toLowerCase()}`}>
                                  {act.quiz.difficulty}
                                </span>
                              )}
                              {act.quiz.questionCount > 0 && (
                                <span className="activity-tag-pill count">{act.quiz.questionCount} Questions</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="activity-card-right">
                        {act.badge && (
                          <span className={`activity-card-badge ${act.badgeType || 'status'}`}>
                            {act.badge}
                          </span>
                        )}
                        <span className="activity-card-timestamp" title={act.createdAt ? new Date(act.createdAt).toLocaleString() : ''}>
                          <Clock size={12} />
                          {act.timeAgo || 'Recently'}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {activityHasMore && (
                  <div className="profile-activity-load-more-wrap">
                    <button
                      type="button"
                      className="btn-load-more-activity"
                      onClick={handleLoadMoreActivities}
                      disabled={loadingActivities}
                    >
                      {loadingActivities ? (
                        <>
                          <Spinner size={16} />
                          <span>Loading more activity...</span>
                        </>
                      ) : (
                        <span>Load More Recent Activity</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 4. YouTube "About / Channel Info" Modal (Matches YouTube Fireship Screenshots 3 & 4) */}
      {aboutModalOpen && (
        <div className="yt-about-overlay" onClick={() => setAboutModalOpen(false)}>
          <div
            className="yt-about-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="yt-about-title"
          >
            {/* Modal Header */}
            <div className="yt-about-header">
              <h2 id="yt-about-title" className="yt-about-title">About</h2>
              <button
                type="button"
                className="yt-about-close-btn"
                onClick={() => setAboutModalOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="yt-about-content">
              {/* Description Section */}
              <div className="yt-about-section">
                <h3 className="yt-about-section-heading">Description</h3>
                <p className="yt-about-description">
                  {profile.bio || 'No channel description provided.'}
                </p>
              </div>

              {/* Links Section */}
              {((Array.isArray(profile.socialLinks) && profile.socialLinks.length > 0) || profile.website) && (
                <div className="yt-about-section">
                  <h3 className="yt-about-section-heading">Links</h3>
                  <div className="yt-about-links-list">
                    {profile.website && (
                      <a
                        href={normalizeUrl(profile.website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="yt-about-link-item"
                      >
                        <div className="yt-about-link-icon-wrap">
                          <Globe size={18} />
                        </div>
                        <div className="yt-about-link-info">
                          <span className="yt-about-link-title">Website</span>
                          <span className="yt-about-link-url">{profile.website.replace(/^https?:\/\//i, '')}</span>
                        </div>
                        <ExternalLink size={14} className="yt-about-link-ext" />
                      </a>
                    )}
                    {Array.isArray(profile.socialLinks) &&
                      profile.socialLinks.map((link, idx) => (
                        <a
                          key={idx}
                          href={normalizeUrl(link.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="yt-about-link-item"
                        >
                          <div className="yt-about-link-icon-wrap">
                            {getPlatformIcon(link.platform)}
                          </div>
                          <div className="yt-about-link-info">
                            <span className="yt-about-link-title">{link.platform || 'Link'}</span>
                            <span className="yt-about-link-url">{link.url.replace(/^https?:\/\//i, '')}</span>
                          </div>
                          <ExternalLink size={14} className="yt-about-link-ext" />
                        </a>
                      ))}
                  </div>
                </div>
              )}

              {/* Channel Details / More Info Section */}
              <div className="yt-about-section">
                <h3 className="yt-about-section-heading">Channel details</h3>
                <div className="yt-about-details-list">
                  {/* Custom URL */}
                  <div className="yt-about-detail-item">
                    <Globe size={18} className="yt-about-detail-icon" />
                    <div className="yt-about-detail-content">
                      <span className="yt-about-detail-label">{customProfileUrl.replace(/^https?:\/\//i, '')}</span>
                      <button
                        type="button"
                        className="yt-about-copy-btn"
                        onClick={handleCopyCustomUrl}
                        title="Copy profile link"
                      >
                        {copiedLink ? <Check size={14} className="text-orange" /> : <Copy size={14} />}
                        <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Followers */}
                  <div className="yt-about-detail-item">
                    <Users size={18} className="yt-about-detail-icon" />
                    <div className="yt-about-detail-content">
                      <span className="yt-about-detail-label">
                        {followersCount.toLocaleString()} {followersCount === 1 ? 'follower' : 'followers'}
                      </span>
                    </div>
                  </div>

                  {/* Quizzes Count */}
                  <div className="yt-about-detail-item">
                    <FileQuestion size={18} className="yt-about-detail-icon" />
                    <div className="yt-about-detail-content">
                      <span className="yt-about-detail-label">
                        {quizzes.length} public quizzes ({totalQuestions} questions)
                      </span>
                    </div>
                  </div>

                  {/* Total Attempts / Views / Rank */}
                  {showRank && (
                    <div className="yt-about-detail-item">
                      <Trophy size={18} className="yt-about-detail-icon" />
                      <div className="yt-about-detail-content">
                        <span className="yt-about-detail-label">
                          {profile.rank ? `Rank #${profile.rank} • ` : ''}{totalAttempts.toLocaleString()} total attempts
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Joined Date */}
                  {profile.createdAt && (
                    <div className="yt-about-detail-item">
                      <Info size={18} className="yt-about-detail-icon" />
                      <div className="yt-about-detail-content">
                        <span className="yt-about-detail-label">
                          Joined {formatFullDate(profile.createdAt)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="yt-about-footer">
                <button
                  type="button"
                  className="yt-about-footer-btn yt-about-share-btn"
                  onClick={() => { setAboutModalOpen(false); setShareProfileOpen(true); }}
                >
                  <Share2 size={16} />
                  <span>Share channel</span>
                </button>
                <button
                  type="button"
                  className="yt-about-footer-btn yt-about-report-btn"
                  onClick={handleReportUser}
                  disabled={isReporting}
                >
                  {isReporting ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />}
                  <span>{isReporting ? 'Reporting...' : 'Report user'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Followers / Following Modal Tab */}
      {networkModalType && (
        <div
          className="floating-network-overlay"
          onClick={() => setNetworkModalType(null)}
        >
          <div
            className="floating-network-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="floating-network-header">
              <div className="floating-network-tabs">
                <button
                  type="button"
                  className={`floating-network-tab-btn ${networkModalType === 'followers' ? 'active' : ''}`}
                  onClick={() => {
                    setNetworkModalType('followers');
                    loadFollowers();
                  }}
                >
                  Followers <span className="network-pill-badge">{followersCount}</span>
                </button>
                <button
                  type="button"
                  className={`floating-network-tab-btn ${networkModalType === 'following' ? 'active' : ''}`}
                  onClick={() => {
                    setNetworkModalType('following');
                    loadFollowing();
                  }}
                >
                  Following <span className="network-pill-badge">{profile.followingCount || 0}</span>
                </button>
              </div>
              <button
                type="button"
                className="btn-floating-close"
                onClick={() => setNetworkModalType(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="floating-network-body">
              {networkModalType === 'followers' ? (
                profile?.isPrivate && !isFollowing && !isOwnProfile ? (
                  <div className="floating-state-card">
                    <Lock size={32} />
                    <h3>Followers are Private</h3>
                    <p>Follow @{profile.username} to view who follows this account.</p>
                  </div>
                ) : loadingFollowers ? (
                  <div className="floating-state-card">
                    <Spinner size={28} />
                    <span>Loading followers...</span>
                  </div>
                ) : followers.length === 0 ? (
                  <div className="floating-state-card">
                    <Users size={32} />
                    <p>No followers yet. Be the first to follow @{profile.username}!</p>
                  </div>
                ) : (
                  <div className="floating-user-list">
                    {followers.map((fUser) => (
                      <div key={fUser._id} className="floating-user-item">
                        <Link
                          to={`/@${fUser.username}`}
                          className="floating-user-link"
                          onClick={() => setNetworkModalType(null)}
                        >
                          {fUser.avatar ? (
                            <img
                              src={fUser.avatar}
                              alt={fUser.name || fUser.username}
                              className="floating-user-avatar"
                            />
                          ) : (
                            <div className="floating-user-avatar placeholder">
                              {(fUser.name || fUser.username || 'U')[0].toUpperCase()}
                            </div>
                          )}
                          <div className="floating-user-details">
                            <span className="floating-user-name">{fUser.name || fUser.username}</span>
                            <span className="floating-user-handle">@{fUser.username}</span>
                            {fUser.bio && <p className="floating-user-bio">{fUser.bio}</p>}
                          </div>
                        </Link>

                        {user && user._id !== fUser._id && (
                          <button
                            type="button"
                            className={`btn-floating-follow ${fUser.isFollowing ? 'following' : ''}`}
                            onClick={() => handleToggleUserCardFollow(fUser)}
                          >
                            {fUser.isFollowing ? 'Following' : 'Follow'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                profile?.isPrivate && !isFollowing && !isOwnProfile ? (
                  <div className="floating-state-card">
                    <Lock size={32} />
                    <h3>Following list is Private</h3>
                    <p>Follow @{profile.username} to view who this account follows.</p>
                  </div>
                ) : loadingFollowing ? (
                  <div className="floating-state-card">
                    <Spinner size={28} />
                    <span>Loading following...</span>
                  </div>
                ) : following.length === 0 ? (
                  <div className="floating-state-card">
                    <UserCheck size={32} />
                    <p>@{profile.username} is not following anyone yet.</p>
                  </div>
                ) : (
                  <div className="floating-user-list">
                    {following.map((fUser) => (
                      <div key={fUser._id} className="floating-user-item">
                        <Link
                          to={`/@${fUser.username}`}
                          className="floating-user-link"
                          onClick={() => setNetworkModalType(null)}
                        >
                          {fUser.avatar ? (
                            <img
                              src={fUser.avatar}
                              alt={fUser.name || fUser.username}
                              className="floating-user-avatar"
                            />
                          ) : (
                            <div className="floating-user-avatar placeholder">
                              {(fUser.name || fUser.username || 'U')[0].toUpperCase()}
                            </div>
                          )}
                          <div className="floating-user-details">
                            <span className="floating-user-name">{fUser.name || fUser.username}</span>
                            <span className="floating-user-handle">@{fUser.username}</span>
                            {fUser.bio && <p className="floating-user-bio">{fUser.bio}</p>}
                          </div>
                        </Link>

                        {user && user._id !== fUser._id && (
                          <button
                            type="button"
                            className={`btn-floating-follow ${fUser.isFollowing ? 'following' : ''}`}
                            onClick={() => handleToggleUserCardFollow(fUser)}
                          >
                            {fUser.isFollowing ? 'Following' : 'Follow'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
      <ShareModal isOpen={shareProfileOpen} onClose={() => setShareProfileOpen(false)}
        profile={{ title: profile.name || profile.username, url: customProfileUrl }} />
    </div>
  );
}
