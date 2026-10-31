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
import { messageService } from '../../services/message.service';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

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
    let list = activeTab === 'challenges' ? challengeQuizzes : quizzes;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) =>
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
      );
    }
    return list;
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
      alert(err.response?.data?.message || 'Failed to upload profile banner.');
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

  const handleShareProfile = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile?.name || profile?.username} on QuizFocus`,
          text: `Check out ${profile?.name || profile?.username}'s quizzes and challenges!`,
          url: customProfileUrl,
        });
        return;
      } catch {
        // user cancelled or share failed
      }
    }
    handleCopyCustomUrl();
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
  const hasBanner = !bannerError && Boolean(profile.banner);

  return (
    <div className="creator-profile-container yt-profile-container">
      {/* 1. YouTube Panoramic Channel Banner */}
      <div className="yt-banner-container">
        {hasBanner ? (
          <div className="yt-banner-media">
            <img
              src={profile.banner}
              alt={`${profile.name || profile.username}'s Banner`}
              className="yt-banner-img"
              loading="lazy"
              decoding="async"
              onError={() => setBannerError(true)}
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
        ) : (
          <div className="yt-banner-placeholder">
            {isOwnProfile ? (
              <button
                type="button"
                className="yt-banner-add-btn"
                onClick={() => bannerInputRef.current?.click()}
                disabled={isUploadingBanner}
              >
                <Camera size={15} />
                <span>{isUploadingBanner ? 'Uploading...' : 'Add Channel Banner'}</span>
              </button>
            ) : (
              <div className="yt-banner-gradient-strip" />
            )}
          </div>
        )}
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleBannerUpload}
        />
      </div>

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
            <h1 className="yt-channel-name">{profile.name || profile.username}</h1>
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
            <span className="yt-meta-dot">•</span>
            <span className="yt-meta-stat">{totalAttempts.toLocaleString()} {totalAttempts === 1 ? 'attempt' : 'attempts'}</span>
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
                <button
                  type="button"
                  className="yt-btn yt-btn-secondary"
                  onClick={handleShareProfile}
                >
                  <Share2 size={15} />
                  <span>{copiedLink ? 'Copied!' : 'Share'}</span>
                </button>
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

                <button
                  type="button"
                  className="yt-btn yt-btn-secondary"
                  onClick={handleShareProfile}
                >
                  <Share2 size={15} />
                  <span>{copiedLink ? 'Copied!' : 'Share'}</span>
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

          {/* In-Channel Search (YouTube Channel Feature) */}
          {quizzes.length > 0 && (activeTab === 'quizzes' || activeTab === 'challenges') && (
            <div className="yt-channel-search consistent-search-field">
              <Search size={15} className="yt-search-icon" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="yt-search-input consistent-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="yt-search-clear"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}
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

                  {/* Total Attempts / Views */}
                  <div className="yt-about-detail-item">
                    <Trophy size={18} className="yt-about-detail-icon" />
                    <div className="yt-about-detail-content">
                      <span className="yt-about-detail-label">
                        {totalAttempts.toLocaleString()} total attempts
                      </span>
                    </div>
                  </div>

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
                  onClick={handleShareProfile}
                >
                  <Share2 size={16} />
                  <span>{copiedLink ? 'Link Copied!' : 'Share channel'}</span>
                </button>
                <button
                  type="button"
                  className="yt-about-footer-btn yt-about-report-btn"
                  onClick={() => alert('Channel reported for moderation review.')}
                >
                  <Flag size={16} />
                  <span>Report user</span>
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

      <style>{profileStyles}</style>
    </div>
  );
}

const profileStyles = `
  /* YouTube Profile Aesthetic - Pure Black & Electric Orange (#000000, #090A0D, #14171E, #FF4500) */
  .creator-profile-container.yt-profile-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    background: transparent;
    padding-bottom: 48px;
  }

  .profile-state-box {
    padding: 60px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: #090A0D;
    border: 1px solid #1F2229;
    border-radius: 16px;
    color: #8E8E93;
  }

  .btn-back {
    padding: 8px 18px;
    border-radius: 9999px;
    background: #FF4500;
    color: #FFFFFF;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
    transition: background 0.15s ease;
  }

  .btn-back:hover {
    background: #ff5714;
  }

  /* 1. YouTube Panoramic Channel Banner */
  .yt-banner-container {
    position: relative;
    width: 100%;
    height: 210px;
    border-radius: 16px;
    overflow: hidden;
    background: #090A0D;
    border: 1px solid #1F2229;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7);
  }

  .yt-banner-media {
    width: 100%;
    height: 100%;
    position: relative;
  }

  .yt-banner-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    opacity: 0.92;
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
  }

  .yt-banner-media:hover .yt-banner-img {
    transform: scale(1.015);
    opacity: 1;
  }

  .yt-banner-owner-actions {
    position: absolute;
    top: 14px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 5;
  }

  .yt-banner-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 9999px;
    background: rgba(0, 0, 0, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #FFFFFF;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: all 0.2s ease;
  }

  .yt-banner-action-btn:hover:not(:disabled) {
    background: #FF4500;
    border-color: #FF4500;
    box-shadow: 0 4px 14px rgba(255, 69, 0, 0.4);
    transform: translateY(-1px);
  }

  .yt-banner-action-btn.yt-banner-delete-btn:hover:not(:disabled) {
    background: #EF4444;
    border-color: #EF4444;
    box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);
  }

  .yt-banner-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at 50% 30%, #171A22 0%, #090A0D 100%);
  }

  .yt-banner-gradient-strip {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, rgba(255, 69, 0, 0.08) 0%, transparent 60%);
  }

  .yt-banner-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 20px;
    border-radius: 9999px;
    background: rgba(255, 69, 0, 0.12);
    border: 1px dashed rgba(255, 69, 0, 0.45);
    color: #FF4500;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .yt-banner-add-btn:hover:not(:disabled) {
    background: #FF4500;
    color: #FFFFFF;
    border-style: solid;
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(255, 69, 0, 0.35);
  }

  /* 2. YouTube Channel Header (Identity Row) */
  .yt-channel-header {
    display: flex;
    gap: 24px;
    align-items: flex-start;
    padding: 6px 4px 12px;
  }

  .yt-avatar-wrapper {
    flex-shrink: 0;
  }

  .yt-avatar-img {
    width: 128px;
    height: 128px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid #14171E;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.8), 0 0 0 1px #1F2229;
    background: #000000;
    transition: transform 0.25s ease;
  }

  .yt-avatar-img:hover {
    transform: scale(1.025);
  }

  .yt-avatar-placeholder {
    width: 128px;
    height: 128px;
    border-radius: 50%;
    background: #0D0F14;
    border: 3px solid #14171E;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.8), 0 0 0 1px #1F2229;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #71717A;
  }

  .yt-channel-info-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .yt-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .yt-channel-name {
    font-size: 28px;
    font-weight: 800;
    color: #FFFFFF;
    letter-spacing: -0.02em;
    margin: 0;
    line-height: 1.15;
  }

  .yt-verified-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #FF4500;
    filter: drop-shadow(0 0 8px rgba(255, 69, 0, 0.5));
  }

  .yt-private-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 9999px;
    background: rgba(239, 68, 68, 0.14);
    color: #EF4444;
    border: 1px solid rgba(239, 68, 68, 0.35);
  }

  /* YouTube Single-Line Metadata Row */
  .yt-metadata-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    font-size: 13.5px;
    color: #8E8E93;
    font-weight: 500;
  }

  .yt-handle {
    color: #A1A1AA;
    font-weight: 600;
  }

  .yt-meta-dot {
    color: #4A4D57;
    font-size: 12px;
  }

  .yt-meta-link-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: #A1A1AA;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .yt-meta-link-btn:hover {
    color: #FFFFFF;
    text-decoration: underline;
  }

  .yt-meta-stat {
    color: #8E8E93;
  }

  /* YouTube Bio Snippet */
  .yt-bio-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 13.5px;
    color: #C4C4C8;
    line-height: 1.45;
  }

  .yt-bio-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .yt-more-btn {
    background: none;
    border: none;
    padding: 0;
    color: #FFFFFF;
    font-weight: 700;
    font-size: 13.5px;
    cursor: pointer;
    transition: color 0.15s;
  }

  .yt-more-btn:hover {
    color: #FF4500;
    text-decoration: underline;
  }

  /* YouTube Links Summary Pill */
  .yt-links-pill-row {
    display: flex;
    align-items: center;
  }

  .yt-links-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9999px;
    padding: 4px 12px;
    font-size: 12.5px;
    font-weight: 600;
    color: #E5E5E7;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .yt-links-pill:hover {
    background: rgba(255, 69, 0, 0.12);
    border-color: rgba(255, 69, 0, 0.4);
    color: #FF4500;
    transform: translateY(-1px);
  }

  .yt-pill-icon {
    color: #FF4500;
  }

  .yt-pill-primary {
    font-weight: 700;
  }

  .yt-pill-more {
    color: #8E8E93;
  }

  .yt-pill-arrow {
    opacity: 0.6;
  }

  /* YouTube Action Buttons */
  .yt-actions-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .yt-btn {
    height: 38px;
    border-radius: 9999px;
    padding: 0 18px;
    font-size: 13.5px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.18s ease;
    white-space: nowrap;
  }

  .yt-btn-primary {
    background: #FF4500;
    color: #FFFFFF;
    border: none;
    box-shadow: 0 4px 14px rgba(255, 69, 0, 0.3);
  }

  .yt-btn-primary:hover {
    background: #ff5714;
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(255, 69, 0, 0.45);
  }

  .yt-btn-subscribe {
    background: #FFFFFF;
    color: #000000;
    border: none;
    font-weight: 800;
  }

  .yt-btn-subscribe:hover {
    background: #FF4500;
    color: #FFFFFF;
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(255, 69, 0, 0.35);
  }

  .yt-btn-subscribed {
    background: #181B22;
    color: #FFFFFF;
    border: 1px solid #282C37;
  }

  .yt-btn-subscribed:hover {
    background: #232834;
    border-color: #383E4E;
  }

  .yt-btn-secondary {
    background: #12141A;
    color: #E5E5E7;
    border: 1px solid #20242E;
  }

  .yt-btn-secondary:hover {
    background: #1C202A;
    border-color: #2F3543;
    color: #FFFFFF;
    transform: translateY(-1px);
  }

  /* 3. YouTube Tabs Bar & In-Channel Search */
  .creator-quizzes-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-top: 6px;
  }

  .yt-nav-tabs-wrapper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #1F2229;
    gap: 16px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .yt-nav-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .yt-nav-tabs::-webkit-scrollbar {
    display: none;
  }

  .yt-nav-tab {
    position: relative;
    background: none;
    border: none;
    padding: 13px 18px;
    font-size: 14px;
    font-weight: 600;
    color: #8E8E93;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: color 0.15s ease;
    white-space: nowrap;
  }

  .yt-nav-tab:hover {
    color: #FFFFFF;
  }

  .yt-nav-tab.active {
    color: #FFFFFF;
    font-weight: 750;
  }

  /* Signature 3px solid electric orange bottom indicator */
  .yt-nav-tab.active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 3px;
    background: #FF4500;
    border-radius: 3px 3px 0 0;
    box-shadow: 0 0 10px rgba(255, 69, 0, 0.6);
  }

  .yt-tab-badge {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.08);
    color: #8E8E93;
    font-weight: 700;
  }

  .yt-nav-tab.active .yt-tab-badge {
    background: rgba(255, 69, 0, 0.2);
    color: #FF4500;
  }

  /* In-Channel Search */
  .yt-channel-search {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #090A0D;
    border: 1px solid #1F2229;
    border-radius: 9999px;
    padding: 6px 14px;
    width: 230px;
    transition: all 0.2s ease;
  }

  .yt-channel-search:focus-within {
    border-color: #FF4500;
    width: 280px;
    box-shadow: 0 0 0 2px rgba(255, 69, 0, 0.15);
  }

  .yt-search-icon {
    color: #71717A;
    flex-shrink: 0;
  }

  .yt-search-input {
    background: transparent;
    border: none;
    outline: none;
    color: #FFFFFF;
    font-size: 13px;
    width: 100%;
  }

  .yt-search-input::placeholder {
    color: #555861;
  }

  .yt-search-clear {
    background: none;
    border: none;
    padding: 0;
    color: #71717A;
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: color 0.15s;
  }

  .yt-search-clear:hover {
    color: #FFFFFF;
  }

  .creator-quizzes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: 20px;
    width: 100%;
    min-width: 0;
  }

  /* Floating Modal Window for Followers & Following */
  .floating-network-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: floatFadeIn 0.15s ease-out;
  }

  .floating-network-modal {
    width: 100%;
    max-width: 460px;
    max-height: 80vh;
    background: #000000;
    border: 1px solid #27272a;
    border-radius: 20px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.95), 0 0 1px rgba(255, 255, 255, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: floatScaleIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .floating-network-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #1c1c1f;
    background: #000000;
  }

  .floating-network-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .floating-network-tab-btn {
    background: transparent;
    border: none;
    font-size: 14px;
    font-weight: 650;
    color: #888888;
    cursor: pointer;
    padding: 6px 12px;
    border-radius: 8px;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .floating-network-tab-btn.active {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.08);
  }

  .network-pill-badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: #cccccc;
  }

  .floating-network-tab-btn.active .network-pill-badge {
    background: rgba(255, 69, 0, 0.2);
    color: #FF4500;
  }

  .btn-floating-close {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-floating-close:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .floating-network-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
    min-height: 220px;
    max-height: 60vh;
  }

  .floating-user-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .floating-user-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: transparent;
    transition: background 0.15s ease;
  }

  .floating-user-item:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .floating-user-link {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: inherit;
    min-width: 0;
    flex: 1;
  }

  .floating-user-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid #222224;
    flex-shrink: 0;
  }

  .floating-user-avatar.placeholder {
    background: #FF4500;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 16px;
    border: none;
  }

  .floating-user-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .floating-user-name {
    font-size: 14px;
    font-weight: 650;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .floating-user-handle {
    font-size: 12.5px;
    color: #888888;
  }

  .floating-user-bio {
    font-size: 12px;
    color: #a1a1aa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 2px 0 0;
  }

  .btn-floating-follow {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
    background: #FF4500;
    border: 1px solid #FF4500;
    color: #ffffff;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .btn-floating-follow:hover {
    background: #ff5714;
    border-color: #ff5714;
  }

  .btn-floating-follow.following {
    background: #000000;
    border: 1px solid #27272a;
    color: #ffffff;
  }

  .btn-floating-follow.following:hover {
    border-color: #ef4444;
    color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
  }

  .floating-state-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 44px 20px;
    gap: 10px;
    color: #888888;
  }

  .floating-state-card h3 {
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
  }

  .floating-state-card p {
    font-size: 13px;
    color: #888888;
    margin: 0;
  }

  /* Empty States & Lock Cards */
  .no-items-card {
    padding: 56px 20px;
    text-align: center;
    background: #090A0D;
    border: 1px solid #1F2229;
    border-radius: 16px;
    color: #888888;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .no-items-card h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: #FFFFFF;
  }

  .no-items-card p {
    margin: 0;
    font-size: 13.5px;
    color: #8E8E93;
    max-width: 420px;
  }

  .private-lock-card {
    padding: 60px 24px;
  }

  .private-lock-icon {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: #0D0F14;
    border: 1px solid #1F2229;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #888888;
    margin-bottom: 4px;
  }

  .private-lock-card h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #FFFFFF;
  }

  .private-lock-card p {
    margin: 0;
    font-size: 14px;
    color: #888888;
    max-width: 380px;
  }

  .profile-pagination-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 24px;
    padding: 12px 16px;
  }

  .profile-page-btn {
    padding: 8px 18px;
    border-radius: 9999px;
    background: #090A0D;
    border: 1px solid #1F2229;
    color: #FFFFFF;
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .profile-page-btn:hover:not(:disabled) {
    background: rgba(255, 69, 0, 0.1);
    border-color: #FF4500;
    color: #FF4500;
  }

  .profile-page-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .profile-page-info {
    font-size: 13px;
    font-weight: 600;
    color: #888888;
  }

  /* 4. YouTube "About / Channel Info" Modal (Matches YouTube Fireship Screenshots 3 & 4) */
  .yt-about-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.82);
    backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.15s ease-out;
  }

  .yt-about-modal {
    width: 100%;
    max-width: 520px;
    max-height: 85vh;
    background: #090A0D;
    border: 1px solid #1F2229;
    border-radius: 20px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.95);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .yt-about-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 24px;
    border-bottom: 1px solid #1F2229;
    background: #090A0D;
  }

  .yt-about-title {
    font-size: 18px;
    font-weight: 800;
    color: #FFFFFF;
    margin: 0;
  }

  .yt-about-close-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .yt-about-close-btn:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .yt-about-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .yt-about-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .yt-about-section-heading {
    font-size: 15px;
    font-weight: 750;
    color: #FFFFFF;
    margin: 0;
    letter-spacing: -0.01em;
  }

  .yt-about-description {
    font-size: 13.5px;
    color: #D1D1D6;
    line-height: 1.6;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .yt-about-links-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .yt-about-link-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 12px;
    background: #0D0F14;
    border: 1px solid #1F2229;
    text-decoration: none;
    color: inherit;
    transition: all 0.15s ease;
  }

  .yt-about-link-item:hover {
    background: rgba(255, 69, 0, 0.08);
    border-color: rgba(255, 69, 0, 0.35);
    transform: translateX(2px);
  }

  .yt-about-link-icon-wrap {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #14171E;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #FF4500;
    flex-shrink: 0;
  }

  .yt-about-link-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .yt-about-link-title {
    font-size: 13.5px;
    font-weight: 700;
    color: #FFFFFF;
    text-transform: capitalize;
  }

  .yt-about-link-url {
    font-size: 12px;
    color: #8E8E93;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .yt-about-link-ext {
    color: #71717A;
    flex-shrink: 0;
  }

  .yt-about-details-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .yt-about-detail-item {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13.5px;
    color: #D1D1D6;
  }

  .yt-about-detail-icon {
    color: #8E8E93;
    flex-shrink: 0;
  }

  .yt-about-detail-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
  }

  .yt-about-detail-label {
    color: #D1D1D6;
    font-weight: 500;
    word-break: break-all;
  }

  .yt-about-copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    background: #14171E;
    border: 1px solid #1F2229;
    color: #FFFFFF;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .yt-about-copy-btn:hover {
    background: #FF4500;
    border-color: #FF4500;
  }

  .yt-about-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    border-top: 1px solid #1F2229;
    padding-top: 18px;
    margin-top: 6px;
  }

  .yt-about-footer-btn {
    flex: 1;
    height: 38px;
    border-radius: 9999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 13.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .yt-about-share-btn {
    background: #FF4500;
    color: #FFFFFF;
    border: none;
  }

  .yt-about-share-btn:hover {
    background: #ff5714;
    box-shadow: 0 4px 14px rgba(255, 69, 0, 0.35);
  }

  .yt-about-report-btn {
    background: transparent;
    color: #A1A1AA;
    border: 1px solid #1F2229;
  }

  .yt-about-report-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: #EF4444;
    color: #EF4444;
  }

  /* Recent Activity Styles */
  .profile-activity-container {
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: 100%;
  }

  .profile-activity-filter-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }

  .activity-filter-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 600;
    background: #090a0d;
    border: 1px solid #1c212a;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .activity-filter-pill:hover {
    background: #13171e;
    color: #ffffff;
    border-color: #2d3644;
  }

  .activity-filter-pill.active {
    background: rgba(255, 69, 0, 0.14);
    color: #FF4500;
    border-color: rgba(255, 69, 0, 0.45);
    font-weight: 700;
  }

  .filter-pill-num {
    font-size: 11px;
    opacity: 0.85;
  }

  .profile-activity-timeline {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .profile-activity-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    border-radius: 12px;
    background: #07080a;
    border: 1px solid #181b22;
    transition: all 0.2s ease;
  }

  .profile-activity-card:hover {
    background: #0e1015;
    border-color: rgba(255, 69, 0, 0.35);
    transform: translateX(2px);
  }

  .activity-card-left {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
    flex: 1;
  }

  .activity-type-icon-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    flex-shrink: 0;
  }

  .activity-type-icon-circle.icon-attempt {
    background: rgba(255, 69, 0, 0.14);
    color: #FF4500;
    border: 1px solid rgba(255, 69, 0, 0.32);
  }

  .activity-type-icon-circle.icon-published {
    background: rgba(59, 130, 246, 0.14);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .activity-type-icon-circle.icon-liked {
    background: rgba(239, 68, 68, 0.14);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .activity-type-icon-circle.icon-bookmarked {
    background: rgba(245, 158, 11, 0.14);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .activity-type-icon-circle.icon-followed {
    background: rgba(139, 92, 246, 0.14);
    color: #a78bfa;
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  .activity-type-icon-circle.icon-commented {
    background: rgba(16, 185, 129, 0.14);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .activity-card-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .activity-card-title-row {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    font-size: 13.5px;
    color: #ffffff;
  }

  .activity-actor-name {
    font-weight: 700;
    color: #ffffff;
  }

  .activity-verb-label {
    color: #9ca3af;
    font-weight: 500;
  }

  .activity-quiz-link {
    color: #FF5500;
    font-weight: 650;
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .activity-quiz-link:hover {
    color: #FF7733;
    text-decoration: underline;
  }

  .activity-user-link {
    color: #60a5fa;
    font-weight: 650;
    text-decoration: none;
  }

  .activity-fallback-text {
    color: #d1d5db;
  }

  .activity-card-tags {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }

  .activity-tag-pill {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 5px;
    font-weight: 600;
    background: #101319;
    color: #9ca3af;
    border: 1px solid #1e2430;
  }

  .activity-tag-pill.category {
    color: #d1d5db;
  }

  .activity-tag-pill.difficulty.easy {
    color: #34d399;
    border-color: rgba(52, 211, 153, 0.25);
  }

  .activity-tag-pill.difficulty.medium {
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.25);
  }

  .activity-tag-pill.difficulty.hard {
    color: #f87171;
    border-color: rgba(248, 113, 113, 0.25);
  }

  .activity-card-right {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
  }

  .activity-card-badge {
    font-size: 11.5px;
    font-weight: 750;
    padding: 3px 9px;
    border-radius: 6px;
  }

  .activity-card-badge.score {
    background: rgba(255, 69, 0, 0.16);
    color: #FF4500;
    border: 1px solid rgba(255, 69, 0, 0.35);
  }

  .activity-card-badge.published {
    background: rgba(59, 130, 246, 0.16);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .activity-card-badge.social,
  .activity-card-badge.status {
    background: #12151c;
    color: #9ca3af;
    border: 1px solid #202632;
  }

  .activity-card-timestamp {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #6b7280;
    font-weight: 500;
    white-space: nowrap;
  }

  .profile-activity-load-more-wrap {
    margin-top: 10px;
    display: flex;
    justify-content: center;
  }

  .btn-load-more-activity {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 11px;
    border-radius: 10px;
    background: #090a0d;
    border: 1px solid #1e2430;
    color: #d1d5db;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-load-more-activity:hover:not(:disabled) {
    background: #11141b;
    border-color: #FF4500;
    color: #FF4500;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 69, 0, 0.2);
  }

  .btn-load-more-activity:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Keyframes */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes modalPop {
    from { opacity: 0; transform: scale(0.96) translateY(6px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* Responsive Breakpoints */
  @media (max-width: 900px) {
    .yt-channel-header {
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 16px;
    }

    .yt-title-row,
    .yt-metadata-line,
    .yt-bio-row,
    .yt-links-pill-row,
    .yt-actions-row {
      justify-content: center;
    }

    .yt-banner-container {
      height: 160px;
    }

    .yt-avatar-img,
    .yt-avatar-placeholder {
      width: 104px;
      height: 104px;
      margin-top: -48px;
    }

    .creator-quizzes-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 600px) {
    .yt-banner-container {
      height: 120px;
      border-radius: 12px;
    }

    .yt-avatar-img,
    .yt-avatar-placeholder {
      width: 88px;
      height: 88px;
      margin-top: -40px;
    }

    .yt-channel-name {
      font-size: 22px;
    }

    .yt-nav-tabs-wrapper {
      flex-direction: column;
      align-items: stretch;
    }

    .yt-channel-search {
      width: 100%;
    }

    .yt-channel-search:focus-within {
      width: 100%;
    }

    .creator-quizzes-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .profile-activity-card {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
    }

    .activity-card-right {
      width: 100%;
      justify-content: space-between;
      border-top: 1px solid #1F2229;
      padding-top: 8px;
    }

    .yt-about-footer {
      flex-direction: column;
    }

    .yt-about-footer-btn {
      width: 100%;
    }
  }
`;
