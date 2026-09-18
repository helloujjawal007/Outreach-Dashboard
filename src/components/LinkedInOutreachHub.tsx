import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Linkedin,
  Sparkles,
  Send,
  Calendar,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  ExternalLink,
  MessageSquare,
  ThumbsUp,
  Share2,
  User,
  Plus,
  Sliders,
  Check,
  Copy,
  Zap,
  Info,
  Layers,
  Search,
  Filter,
  X,
  Wand2,
  Bold,
  Italic,
  List,
  ListOrdered,
  Smile,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/services/api';
import { Modal } from './Modal';
import {
  toUnicodeBold,
  toUnicodeItalic,
  toPlainText,
  beautifyLinkedInPost,
  applyStyleToSelection,
} from '@/utils/linkedinBeautifier';
import type { LinkedInAccountStatus, LinkedInPost, ProspectCommentTask, Lead } from '@/types';

interface Props {
  leads: Lead[];
}

export function LinkedInOutreachHub({ leads }: Props) {
  const [activeTab, setActiveTab] = useState<'posts' | 'auto_reply'>('posts');
  const [status, setStatus] = useState<LinkedInAccountStatus | null>(null);
  const [posts, setPosts] = useState<LinkedInPost[]>([]);
  const [comments, setComments] = useState<ProspectCommentTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Account Connect Modal
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [connectName, setConnectName] = useState('');
  const [connectHeadline, setConnectHeadline] = useState('');
  const [connectCookie, setConnectCookie] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTestingCookie, setIsTestingCookie] = useState(false);
  const [cookieTestResult, setCookieTestResult] = useState<{ valid: boolean; accountName?: string; headline?: string; error?: string } | null>(null);

  // Post Creator State
  const [postTopic, setPostTopic] = useState('');
  const [postTone, setPostTone] = useState<'thought_leadership' | 'story' | 'case_study' | 'quick_tip' | 'provocative'>('thought_leadership');
  const [postAngle, setPostAngle] = useState<string>('all');
  const [postContent, setPostContent] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [isGeneratingPost, setIsGeneratingPost] = useState(false);
  const [isPublishingPost, setIsPublishingPost] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [reschedulingPost, setReschedulingPost] = useState<LinkedInPost | null>(null);
  const [rescheduleDateTime, setRescheduleDateTime] = useState('');
  const [postFeedback, setPostFeedback] = useState<string | null>(null);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [isDraftCopied, setIsDraftCopied] = useState(false);

  // Ref to textarea for cursor/selection formatting
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-Reply Prospect Posts State
  const [autoPilotEnabled, setAutoPilotEnabled] = useState(false);
  const [isAddProspectPostOpen, setIsAddProspectPostOpen] = useState(false);
  const [newProspectName, setNewProspectName] = useState('');
  const [newProspectHeadline, setNewProspectHeadline] = useState('');
  const [newPostUrl, setNewPostUrl] = useState('');
  const [newPostSnippet, setNewPostSnippet] = useState('');
  const [isAddingPost, setIsAddingPost] = useState(false);
  const [approvingTaskId, setApprovingTaskId] = useState<string | null>(null);
  const [commentFeedback, setCommentFeedback] = useState<string | null>(null);

  // Editable comment drafts
  const [editingComments, setEditingComments] = useState<Record<string, string>>({});

  // Filter States
  const [commentStatusFilter, setCommentStatusFilter] = useState<'all' | 'pending_approval' | 'posted' | 'skipped'>('all');
  const [commentSearch, setCommentSearch] = useState('');
  const [postStatusFilter, setPostStatusFilter] = useState<'all' | 'published' | 'scheduled' | 'draft'>('all');
  const [postSearch, setPostSearch] = useState('');

  // Filtered Datasets
  const filteredComments = useMemo(() => {
    return comments.filter((item) => {
      if (commentStatusFilter !== 'all' && item.status !== commentStatusFilter) return false;
      if (commentSearch.trim()) {
        const q = commentSearch.toLowerCase();
        return (
          item.prospectName.toLowerCase().includes(q) ||
          item.prospectHeadline.toLowerCase().includes(q) ||
          item.postSnippet.toLowerCase().includes(q) ||
          item.generatedComment.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [comments, commentStatusFilter, commentSearch]);

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (postStatusFilter !== 'all' && p.status !== postStatusFilter) return false;
      if (postSearch.trim()) {
        const q = postSearch.toLowerCase();
        return (
          (p.title && p.title.toLowerCase().includes(q)) ||
          p.content.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [posts, postStatusFilter, postSearch]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statusData, postsData, commentsData] = await Promise.all([
        api.getLinkedInStatus().catch(() => null),
        api.getLinkedInPosts().catch(() => []),
        api.getLinkedInProspectComments().catch(() => []),
      ]);
      if (statusData) {
        setStatus(statusData);
        setConnectName(statusData.accountName);
        setConnectHeadline(statusData.headline);
      }
      setPosts(postsData);
      setComments(commentsData);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openConnectModal = () => {
    setConnectName(status?.accountName || 'Anupam Kumar');
    setConnectHeadline(status?.headline || 'SEO Specialist & Growth Partner @ Online Digital Solution');
    setCookieTestResult(null);
    setIsConnectModalOpen(true);
  };

  // Handle Account Connection
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    try {
      const updated = await api.connectLinkedIn({
        accountName: connectName,
        headline: connectHeadline,
        sessionCookie: connectCookie,
        authMethod: 'cookie',
      });
      setStatus(updated);
      setIsConnectModalOpen(false);
      setPostFeedback(
        updated.isConnected
          ? '✓ LinkedIn account connected with automated background posting active!'
          : 'LinkedIn profile details saved (1-Click Direct Share Active)'
      );
      setTimeout(() => setPostFeedback(null), 4500);
    } catch (err: any) {
      alert(err?.message || 'Failed to connect LinkedIn account');
    } finally {
      setIsConnecting(false);
    }
  };

  // Generate AI Post (Always writes different across 16+ frameworks)
  const handleGeneratePost = async (customAngle?: string) => {
    setIsGeneratingPost(true);
    try {
      const selectedAngle = customAngle || postAngle;
      const draft = await api.generateLinkedInPost({
        topic: postTopic || '',
        tone: postTone,
        angle: selectedAngle !== 'all' ? selectedAngle : undefined,
      });

      // Automatically beautify the generated post for instant visual excellence
      const beautified = beautifyLinkedInPost(draft.content);
      setPostContent(beautified);
      setPostTitle(draft.title);
      setPostFeedback('✨ Fresh unique post generated! Hooks and structure automatically beautified.');
      setTimeout(() => setPostFeedback(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Failed to generate post draft');
    } finally {
      setIsGeneratingPost(false);
    }
  };

  // 1-Click Beautify Post formatting
  const handleBeautifyPost = () => {
    if (!postContent.trim()) return;
    const beautified = beautifyLinkedInPost(postContent);
    setPostContent(beautified);
    setPostFeedback('✨ Post beautified! Bold Unicode hooks, aesthetic bullets, and spacing applied.');
    setTimeout(() => setPostFeedback(null), 3500);
  };

  // Format highlighted selection (Bold, Italic, Bullets, Numbers, Plain)
  const handleFormatSelection = (style: 'bold' | 'italic' | 'bullet' | 'number' | 'plain') => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const res = applyStyleToSelection(postContent, start, end, style);
    setPostContent(res.newText);

    // Restore focus & cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(res.newCursorStart, res.newCursorEnd);
    }, 10);
  };

  // Insert emoji or visual badge at current cursor
  const handleInsertEmoji = (emoji: string) => {
    if (!textareaRef.current) {
      setPostContent((prev) => prev + ' ' + emoji);
      return;
    }
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = postContent.slice(0, start) + emoji + postContent.slice(end);
    setPostContent(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 10);
  };

  // 1-Click Copy Clean Draft to Clipboard
  const handleCopyDraft = async (customText?: string) => {
    const textToCopy = customText || postContent;
    if (!textToCopy.trim()) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsDraftCopied(true);
      setPostFeedback('📋 Beautified post copied to clipboard! Ready to paste into LinkedIn (⌘V / Ctrl+V)');
      setTimeout(() => {
        setIsDraftCopied(false);
        setPostFeedback(null);
      }, 4000);
    } catch {
      alert('Failed to copy to clipboard');
    }
  };

  // Preset Date-Time Picker for Optimal LinkedIn Posting
  const applySchedulePreset = (type: 'tomorrow_830' | 'tomorrow_1000' | 'in_2_days' | 'next_tuesday') => {
    const date = new Date();
    if (type === 'tomorrow_830') {
      date.setDate(date.getDate() + 1);
      date.setHours(8, 30, 0, 0);
    } else if (type === 'tomorrow_1000') {
      date.setDate(date.getDate() + 1);
      date.setHours(10, 0, 0, 0);
    } else if (type === 'in_2_days') {
      date.setDate(date.getDate() + 2);
      date.setHours(9, 0, 0, 0);
    } else if (type === 'next_tuesday') {
      // Days until next Tuesday (day 2)
      const day = date.getDay();
      const diff = (9 - day) % 7 || 7;
      date.setDate(date.getDate() + diff);
      date.setHours(9, 0, 0, 0);
    }
    // Format to YYYY-MM-DDTHH:mm
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
    setScheduleDateTime(localISOTime);
  };

  // Publish Post
  const handlePublishPost = async (asScheduled = false) => {
    if (!postContent.trim()) return;
    setIsPublishingPost(true);
    const contentToPost = postContent;
    try {
      const newPost = await api.createLinkedInPost({
        title: postTitle || 'LinkedIn Outreach Post',
        content: contentToPost,
        status: asScheduled ? 'scheduled' : 'published',
        scheduledFor: asScheduled ? scheduleDateTime : undefined,
      });
      setPosts((prev) => [newPost, ...prev]);
      setPostContent('');
      setPostTitle('');
      setIsScheduleModalOpen(false);

      if (asScheduled) {
        setPostFeedback('📅 Post scheduled successfully in your queue!');
      } else if (newPost.liveDelivery) {
        setPostFeedback('✓ Post successfully published directly to your LinkedIn live feed!');
      } else {
        // Did not publish via automated session: copy to clipboard & launch LinkedIn
        try {
          await navigator.clipboard.writeText(contentToPost);
        } catch {}
        window.open('https://www.linkedin.com/feed/?shareActive=true', '_blank');
        setPostFeedback('📋 Post text copied to clipboard! Opening LinkedIn—simply paste (⌘V / Ctrl+V) and hit Post.');
      }
      setTimeout(() => setPostFeedback(null), 6000);
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Failed to publish post');
    } finally {
      setIsPublishingPost(false);
    }
  };

  // Publish a scheduled post right now
  const handlePublishPostNow = async (post: LinkedInPost) => {
    try {
      const updated = await api.publishExistingLinkedInPost(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
      if (updated.liveDelivery) {
        setPostFeedback('✓ Scheduled post published live to LinkedIn feed!');
      } else {
        await navigator.clipboard.writeText(updated.content);
        window.open(updated.directShareUrl || 'https://www.linkedin.com/feed/?shareActive=true', '_blank');
        setPostFeedback('📋 Post text copied! Opening LinkedIn post composer...');
      }
      setTimeout(() => setPostFeedback(null), 4500);
    } catch (err: any) {
      alert(err?.message || 'Failed to publish post now');
    }
  };

  // Open reschedule modal
  const handleOpenReschedule = (post: LinkedInPost) => {
    setReschedulingPost(post);
    const initial = post.scheduledFor
      ? new Date(post.scheduledFor).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16);
    setRescheduleDateTime(initial);
    setIsRescheduleModalOpen(true);
  };

  // Save rescheduled date
  const handleSaveReschedule = async () => {
    if (!reschedulingPost || !rescheduleDateTime) return;
    try {
      const updated = await api.updateLinkedInPost(reschedulingPost.id, {
        scheduledFor: rescheduleDateTime,
        status: 'scheduled',
      });
      setPosts((prev) => prev.map((p) => (p.id === reschedulingPost.id ? updated : p)));
      setIsRescheduleModalOpen(false);
      setReschedulingPost(null);
      setPostFeedback('📅 Post rescheduled successfully!');
      setTimeout(() => setPostFeedback(null), 3500);
    } catch (err: any) {
      alert(err?.message || 'Failed to reschedule post');
    }
  };

  // 1-Click Direct Share to LinkedIn
  const handleDirectShare = async (post: LinkedInPost) => {
    try {
      await navigator.clipboard.writeText(post.content);
      setCopiedPostId(post.id);
      setTimeout(() => setCopiedPostId(null), 2500);
    } catch {}
    window.open(post.directShareUrl || 'https://www.linkedin.com/feed/?shareActive=true', '_blank');
    setPostFeedback(`📋 Post text copied to clipboard! Opening LinkedIn post composer in a new tab...`);
    setTimeout(() => setPostFeedback(null), 5000);
  };

  // Copy post text only
  const handleCopyText = async (post: LinkedInPost) => {
    try {
      await navigator.clipboard.writeText(post.content);
      setCopiedPostId(post.id);
      setPostFeedback('📋 Post text copied to clipboard!');
      setTimeout(() => {
        setCopiedPostId(null);
        setPostFeedback(null);
      }, 3000);
    } catch {
      alert('Failed to copy text to clipboard');
    }
  };

  // Mark a post as confirmed published by the user
  const handleConfirmPost = async (postId: string) => {
    try {
      const updated = await api.confirmLinkedInPost(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
      setPostFeedback('✓ Post marked as confirmed on your LinkedIn profile!');
      setTimeout(() => setPostFeedback(null), 3500);
    } catch (err: any) {
      alert(err?.message || 'Failed to confirm post');
    }
  };

  // Test li_at cookie
  const handleTestCookie = async () => {
    if (!connectCookie.trim()) {
      alert('Please paste a li_at session cookie first.');
      return;
    }
    setIsTestingCookie(true);
    setCookieTestResult(null);
    try {
      const result = await api.verifyLinkedInCookie(connectCookie.trim());
      setCookieTestResult(result);
    } catch (err: any) {
      setCookieTestResult({ valid: false, error: err.message || 'Verification failed' });
    } finally {
      setIsTestingCookie(false);
    }
  };

  // Delete Post
  const handleDeletePost = async (id: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    try {
      await api.deleteLinkedInPost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete post');
    }
  };

  // Approve & Post Comment
  const handleApproveComment = async (taskId: string) => {
    setApprovingTaskId(taskId);
    try {
      const customText = editingComments[taskId];
      const updated = await api.approveLinkedInComment(taskId, customText);
      setComments((prev) => prev.map((c) => (c.id === taskId ? updated : c)));
      setCommentFeedback(`Comment posted successfully to ${updated.prospectName}'s post`);
      setTimeout(() => setCommentFeedback(null), 3500);
      if (status) {
        setStatus({ ...status, dailyCommentsUsed: status.dailyCommentsUsed + 1 });
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to approve comment');
    } finally {
      setApprovingTaskId(null);
    }
  };

  // Skip Comment Task
  const handleSkipComment = async (taskId: string) => {
    try {
      await api.skipLinkedInComment(taskId);
      setComments((prev) => prev.map((c) => (c.id === taskId ? { ...c, status: 'skipped' } : c)));
    } catch (err: any) {
      alert(err?.message || 'Failed to skip comment');
    }
  };

  // Add new prospect post to monitor
  const handleAddProspectPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProspectName.trim() || !newPostSnippet.trim()) return;
    setIsAddingPost(true);
    try {
      const task = await api.addLinkedInProspectPost({
        prospectName: newProspectName,
        prospectHeadline: newProspectHeadline,
        postUrl: newPostUrl,
        postSnippet: newPostSnippet,
      });
      setComments((prev) => [task, ...prev]);
      setIsAddProspectPostOpen(false);
      setNewProspectName('');
      setNewProspectHeadline('');
      setNewPostUrl('');
      setNewPostSnippet('');
      setCommentFeedback(`Prospect post added & AI comment generated for ${task.prospectName}`);
      setTimeout(() => setCommentFeedback(null), 3500);
    } catch (err: any) {
      alert(err?.message || 'Failed to add prospect post');
    } finally {
      setIsAddingPost(false);
    }
  };

  const pendingCommentsCount = useMemo(
    () => comments.filter((c) => c.status === 'pending_approval').length,
    [comments]
  );

  return (
    <div className="space-y-6">
      {/* 1. Account Status & Safety Rate Limit Card */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/70 via-white to-indigo-50/50 p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm shrink-0">
              <Linkedin size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">
                  {status?.accountName || 'LinkedIn Account'}
                </h3>
                {status?.isConnected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Session Live (Auto-Posting Active)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-300 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                    <Zap size={12} className="text-amber-600" />
                    <span>1-Click Direct Share Active</span>
                  </span>
                )}
                <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-bold">
                  {status?.hasSessionCookie ? 'li_at Session Cookie' : status?.hasAccessToken ? 'Official OAuth' : 'Direct Browser Share'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{status?.headline}</p>
              {!status?.isConnected && (
                <p className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1 mt-1 font-medium">
                  💡 <strong>Direct Share Mode:</strong> Posts will copy to your clipboard and launch LinkedIn's post composer in your active browser tab. To enable automated background posting, click <strong>Manage Account</strong> and paste your <code>li_at</code> session cookie.
                </p>
              )}
              {status?.profileUrl && (
                <a
                  href={status.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 hover:text-sky-800 hover:underline mt-1"
                  title="View active LinkedIn profile"
                >
                  <span>{status.profileUrl}</span>
                  <ExternalLink size={11} />
                </a>
              )}
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  <span>Anti-Checkpoint Safety Active</span>
                </span>
                <span>•</span>
                <span>Randomized 5–15 min Pacing</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Safety Limit Progress */}
            <div className="rounded-xl border border-blue-100 bg-white p-3 shadow-2xs min-w-[200px]">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Daily Safe Comments</span>
                <span className="font-bold text-blue-700">
                  {status?.dailyCommentsUsed || 0} / {status?.dailySafeCommentLimit || 20}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{
                    width: `${Math.min(100, (((status?.dailyCommentsUsed || 0) / (status?.dailySafeCommentLimit || 20)) * 100))}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Capped at 20/day to protect account reputation</p>
            </div>

            <button
              onClick={openConnectModal}
              className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 font-bold"
            >
              <Sliders size={13} />
              <span>Manage Account</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Feature Mode Tabs: Post Creation vs. Auto-Reply */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 flex-wrap">
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'posts'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Send size={14} />
            <span>Create &amp; Publish Posts</span>
            <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold">
              {posts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('auto_reply')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'auto_reply'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare size={14} />
            <span>Auto-Reply on Prospect Posts</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                pendingCommentsCount > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {pendingCommentsCount} Pending
            </span>
          </button>
        </div>

        {activeTab === 'auto_reply' && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={autoPilotEnabled}
                  onChange={(e) => setAutoPilotEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Safe Auto-Pilot (10-min delays)</span>
              </label>
            </div>

            <button
              onClick={() => setIsAddProspectPostOpen(true)}
              className="btn-primary py-1.5 px-3 text-xs font-bold flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white border-0 shadow-2xs"
            >
              <Plus size={13} />
              <span>+ Add Prospect Post</span>
            </button>
          </div>
        )}
      </div>

      {postFeedback && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-bold text-emerald-800 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{postFeedback}</span>
        </div>
      )}

      {commentFeedback && (
        <div className="flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-xs font-bold text-indigo-800 animate-in fade-in">
          <CheckCircle2 size={16} className="text-indigo-600 shrink-0" />
          <span>{commentFeedback}</span>
        </div>
      )}

      {/* 3. TAB 1: CREATE & PUBLISH / SCHEDULE POST */}
      {activeTab === 'posts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Post Composer Card */}
          <div className="lg:col-span-7 space-y-4">
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500" />
                  <span>AI LinkedIn Post Composer &amp; Beautifier</span>
                </h4>
                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                  <Wand2 size={12} className="text-purple-600" />
                  <span>Viral B2B Frameworks</span>
                </span>
              </div>

              {/* Topic & Angle Selector */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">Post Topic or Core Hook (Optional)</label>
                  <input
                    type="text"
                    value={postTopic}
                    onChange={(e) => setPostTopic(e.target.value)}
                    placeholder="e.g. Why multi-channel WhatsApp + Email outperforms cold email blasts by 3x (or leave empty to auto-generate)"
                    className="input text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1 block">Outreach Angle / Framework</label>
                    <select
                      value={postAngle}
                      onChange={(e) => setPostAngle(e.target.value)}
                      className="input text-xs font-medium"
                    >
                      <option value="all">🎲 Auto-Rotate (Different Every Time)</option>
                      <option value="contrarian">💡 Contrarian Truth / Myth Buster</option>
                      <option value="playbook">🚀 4-Channel Outbound Sequence</option>
                      <option value="data">📊 Data &amp; Cold Outreach Stats</option>
                      <option value="old_vs_new">🔄 Old Way vs. New Way</option>
                      <option value="mobile_first">📱 Mobile-First (WhatsApp Hook)</option>
                      <option value="deliverability">🛡️ Deliverability &amp; 0% Bounce Rate</option>
                      <option value="objections">💬 60-Second Objection Handling</option>
                      <option value="social_warming">🤝 Social Pre-Warming Strategy</option>
                      <option value="c_suite">🎯 The 3-Sentence C-Suite Rule</option>
                      <option value="mistakes">⚠️ 5 Lethal Outbound Mistakes</option>
                      <option value="tech_stack">🛠️ Modern 2026 Tech Stack</option>
                      <option value="personalization">📈 Real Personalization vs Fake Flattery</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1 block">Content Tone</label>
                    <select
                      value={postTone}
                      onChange={(e) => setPostTone(e.target.value as any)}
                      className="input text-xs font-medium"
                    >
                      <option value="thought_leadership">Thought Leadership (Authority)</option>
                      <option value="story">Story &amp; Transformation Case Study</option>
                      <option value="case_study">Client Data &amp; ROI Breakdown</option>
                      <option value="quick_tip">Actionable 4-Step Checklist</option>
                      <option value="provocative">Contrarian / Provocative Hook</option>
                    </select>
                  </div>
                </div>

                {/* Generation Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleGeneratePost()}
                    disabled={isGeneratingPost}
                    className="btn-primary py-2 px-3.5 text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm transition active:scale-98"
                  >
                    <Sparkles size={14} className={isGeneratingPost ? 'animate-spin' : ''} />
                    <span>{isGeneratingPost ? 'Writing Post...' : 'Draft Post with AI'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleGeneratePost()}
                    disabled={isGeneratingPost}
                    className="btn-secondary py-2 px-3.5 text-xs font-bold flex items-center justify-center gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition active:scale-98"
                    title="Generate another completely different post variation using another framework"
                  >
                    <RefreshCw size={13} className={isGeneratingPost ? 'animate-spin' : ''} />
                    <span>🔄 Different Angle</span>
                  </button>
                </div>
              </div>

              {/* Beautifier & Formatting Toolbar + Editable Textarea */}
              <div className="space-y-0">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span>Post Content &amp; Formatting</span>
                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                      Unicode Feed-Ready
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {postContent.length} chars • {postContent.split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>

                {/* Formatting Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-t-xl">
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleFormatSelection('bold')}
                      className="px-2 py-1 text-xs font-bold rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 shadow-2xs transition"
                      title="Convert selection to Bold Unicode (renders bold in LinkedIn feed)"
                    >
                      <Bold size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFormatSelection('italic')}
                      className="px-2 py-1 text-xs font-serif italic rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 shadow-2xs transition"
                      title="Convert selection to Italic Unicode"
                    >
                      <Italic size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFormatSelection('bullet')}
                      className="px-2 py-1 text-xs font-bold rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 shadow-2xs flex items-center gap-1 transition"
                      title="Add aesthetic bullet points (✦)"
                    >
                      <List size={13} />
                      <span className="text-[10px]">✦</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFormatSelection('number')}
                      className="px-2 py-1 text-xs font-bold rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 shadow-2xs flex items-center gap-1 transition"
                      title="Convert to bold numbered list (𝟭. 𝟮. 𝟯.)"
                    >
                      <ListOrdered size={13} />
                      <span className="text-[10px]">𝟭.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFormatSelection('plain')}
                      className="px-2 py-1 text-[11px] font-medium rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 shadow-2xs transition"
                      title="Remove Unicode bold/italic formatting"
                    >
                      Plain
                    </button>

                    {/* Quick emoji badges */}
                    <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block" />
                    <div className="hidden sm:flex items-center gap-1">
                      {['🚀', '💡', '📌', '⚡', '📈', '🎯', '🔥', '👇'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleInsertEmoji(emoji)}
                          className="px-1.5 py-0.5 text-xs rounded hover:bg-slate-200/80 transition-colors"
                          title={`Insert ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 1-Click Master Beautifier Button */}
                  <button
                    type="button"
                    onClick={handleBeautifyPost}
                    disabled={!postContent.trim()}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-amber-900 bg-amber-100/90 hover:bg-amber-200/90 border border-amber-300 rounded-lg shadow-2xs transition active:scale-95 disabled:opacity-40 cursor-pointer"
                    title="Automatically boldify hook, format numbers (𝟭.), clean line breaks, and add aesthetic bullets"
                  >
                    <Wand2 size={13} className="text-amber-600" />
                    <span>✨ Beautify Post</span>
                  </button>
                </div>

                <textarea
                  ref={textareaRef}
                  rows={10}
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="Click 'Draft Post with AI' above or paste your draft here to format &amp; beautify..."
                  className="textarea text-xs leading-relaxed font-sans rounded-t-none border-t-0 focus:ring-0 focus:border-slate-300 min-h-[220px]"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {/* Prominent Copy Draft Button */}
                  <button
                    type="button"
                    onClick={() => handleCopyDraft()}
                    disabled={!postContent.trim()}
                    className={`btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-bold transition shadow-2xs ${
                      isDraftCopied
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                    title="Copy formatted post to clipboard ready to paste into LinkedIn"
                  >
                    {isDraftCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    <span>{isDraftCopied ? 'Copied to Clipboard!' : '📋 Copy Draft'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      applySchedulePreset('tomorrow_830');
                      setIsScheduleModalOpen(true);
                    }}
                    disabled={!postContent.trim() || isPublishingPost}
                    className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-bold text-indigo-700 border-indigo-200 hover:bg-indigo-50 shadow-2xs cursor-pointer"
                    title="Schedule post for optimal LinkedIn engagement times"
                  >
                    <Calendar size={13} />
                    <span>📅 Schedule</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePublishPost(false)}
                    disabled={!postContent.trim() || isPublishingPost}
                    className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer"
                  >
                    <Send size={13} />
                    <span>
                      {isPublishingPost
                        ? 'Publishing...'
                        : status?.isConnected
                        ? 'Auto-Publish to LinkedIn'
                        : '🚀 1-Click Share to LinkedIn'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Published / Scheduled Posts Table + Filters */}
            <div className="card p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Recent Posts History &amp; Queue ({filteredPosts.length})
                </h4>
                
                {/* Posts Filters */}
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search posts..."
                      value={postSearch}
                      onChange={(e) => setPostSearch(e.target.value)}
                      className="input pl-7 pr-2 py-1 text-xs w-32 bg-slate-50 border-slate-200"
                    />
                  </div>
                  <select
                    value={postStatusFilter}
                    onChange={(e) => setPostStatusFilter(e.target.value as any)}
                    className="input py-1 px-2 text-xs w-auto bg-slate-50 border-slate-200 font-medium"
                  >
                    <option value="all">All ({posts.length})</option>
                    <option value="published">Published Live</option>
                    <option value="ready_to_share">Ready to Share</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="draft">Drafts</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {filteredPosts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No posts found matching the filter.</p>
                ) : (
                  filteredPosts.map((p) => {
                    const isLive = Boolean(p.liveDelivery);
                    const isReadyToShare = p.status === 'ready_to_share' || (!isLive && p.status === 'published');

                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border p-3.5 transition-all ${
                          isLive
                            ? 'border-emerald-200 bg-emerald-50/20'
                            : isReadyToShare
                            ? 'border-amber-200 bg-amber-50/30'
                            : 'border-slate-200 bg-slate-50/50 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              {isLive ? (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                  <CheckCircle2 size={11} className="text-emerald-600" />
                                  <span>Live on LinkedIn</span>
                                </span>
                              ) : isReadyToShare ? (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                  <Zap size={11} className="text-amber-600" />
                                  <span>Ready to Share (1-Click)</span>
                                </span>
                              ) : p.status === 'scheduled' ? (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                                  <Calendar size={11} className="text-purple-600" />
                                  <span>Scheduled</span>
                                </span>
                              ) : (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                                  Draft
                                </span>
                              )}

                              <span className="text-[11px] text-slate-400">
                                {new Date(p.publishedAt || p.createdAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            <p className="text-xs text-slate-900 leading-relaxed line-clamp-3 whitespace-pre-wrap font-normal">
                              {p.content}
                            </p>

                            {/* Action Buttons for this post */}
                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                              {/* If scheduled: provide Publish Now & Reschedule */}
                              {p.status === 'scheduled' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handlePublishPostNow(p)}
                                    className="btn-primary py-1 px-2.5 text-[11px] font-bold flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs"
                                    title="Publish this scheduled post immediately"
                                  >
                                    <Zap size={11} />
                                    <span>⚡ Publish Now</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenReschedule(p)}
                                    className="btn-secondary py-1 px-2 text-[11px] font-bold flex items-center gap-1 text-purple-700 border-purple-200 hover:bg-purple-50"
                                    title="Change the scheduled date and time"
                                  >
                                    <Calendar size={11} />
                                    <span>Reschedule</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDirectShare(p)}
                                    className="btn-secondary py-1 px-2 text-[11px] font-bold flex items-center gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
                                    title="Opens LinkedIn composer with text filled. Click the clock icon (🕒) in LinkedIn to schedule natively!"
                                  >
                                    <Clock size={11} />
                                    <span>Schedule in LinkedIn</span>
                                  </button>
                                </>
                              )}

                              {!isLive && p.status !== 'scheduled' && (
                                <button
                                  type="button"
                                  onClick={() => handleDirectShare(p)}
                                  className="btn-primary py-1 px-2.5 text-[11px] font-bold flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
                                  title="Copy text & open LinkedIn post composer in your browser"
                                >
                                  <ExternalLink size={12} />
                                  <span>1-Click Share to LinkedIn</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleCopyText(p)}
                                className="btn-secondary py-1 px-2 text-[11px] flex items-center gap-1 text-slate-700 hover:bg-slate-100 font-medium"
                                title="Copy post text to clipboard"
                              >
                                {copiedPostId === p.id ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                                <span>{copiedPostId === p.id ? 'Copied!' : 'Copy Text'}</span>
                              </button>

                              {!isLive && p.status !== 'scheduled' && (
                                <button
                                  type="button"
                                  onClick={() => handleConfirmPost(p.id)}
                                  className="btn-secondary py-1 px-2 text-[11px] flex items-center gap-1 text-emerald-700 hover:bg-emerald-50 border-emerald-200 font-medium"
                                  title="Mark this post as confirmed posted on your LinkedIn profile"
                                >
                                  <CheckCircle2 size={11} />
                                  <span>Mark as Posted</span>
                                </button>
                              )}

                              {isLive && (
                                <a
                                  href={p.directShareUrl || status?.profileUrl || 'https://www.linkedin.com/feed/'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn-secondary py-1 px-2 text-[11px] flex items-center gap-1 text-sky-700 hover:bg-sky-50 border-sky-200 font-medium"
                                >
                                  <ExternalLink size={11} />
                                  <span>View on LinkedIn</span>
                                </a>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeletePost(p.id)}
                            className="text-slate-400 hover:text-rose-600 p-1.5 transition shrink-0 rounded-lg hover:bg-rose-50"
                            title="Delete post"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Live LinkedIn Feed Preview */}
          <div className="lg:col-span-5 space-y-4">
            <div className="sticky top-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Linkedin size={14} className="text-blue-600" />
                  <span>Live Feed Preview</span>
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  Desktop &amp; Mobile Format
                </span>
              </div>

              {/* LinkedIn Post Card Preview */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                {/* Author Info */}
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                    {status?.accountName?.slice(0, 2).toUpperCase() || 'OU'}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      <span>{status?.accountName || 'Your Name'}</span>
                      <span className="text-[10px] text-slate-400 font-normal">• 1st</span>
                    </h5>
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      {status?.headline || 'Growth Strategist & Multi-Channel Outreach'}
                    </p>
                    <p className="text-[10px] text-slate-400">Just now • 🌐</p>
                  </div>
                </div>

                {/* Content */}
                <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[140px]">
                  {postContent || (
                    <span className="text-slate-300 italic">
                      Your post draft will preview here in real-time as you write or generate it with AI...
                    </span>
                  )}
                </div>

                {/* Social Interaction Buttons Mockup */}
                <div className="border-t border-slate-100 pt-2 flex items-center justify-around text-xs text-slate-500 font-semibold">
                  <span className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-slate-50 cursor-pointer">
                    <ThumbsUp size={13} />
                    <span>Like</span>
                  </span>
                  <span className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-slate-50 cursor-pointer">
                    <MessageSquare size={13} />
                    <span>Comment</span>
                  </span>
                  <span className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-slate-50 cursor-pointer">
                    <Share2 size={13} />
                    <span>Repost</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB 2: AUTO-REPLY ON PROSPECT POSTS */}
      {activeTab === 'auto_reply' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Sparkles size={18} className="text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-indigo-950">
                    Contextual AI Commenting Engine (Prospect Posts)
                  </h4>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    Engage key prospects by contributing insightful, non-salesy comments on their posts. Build familiarity before shooting direct outreach.
                  </p>
                </div>
              </div>

              <div className="text-xs font-bold text-indigo-900 shrink-0">
                {pendingCommentsCount} posts waiting for review
              </div>
            </div>
          </div>

          {/* Prospect Comments Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="relative min-w-44 max-w-sm flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search prospects by name, headline, or post text..."
                  value={commentSearch}
                  onChange={(e) => setCommentSearch(e.target.value)}
                  className="input pl-8 pr-3 py-1.5 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Filter size={13} className="text-slate-400" />
                <select
                  value={commentStatusFilter}
                  onChange={(e) => setCommentStatusFilter(e.target.value as any)}
                  className="input py-1.5 text-xs w-auto font-medium bg-slate-50 border-slate-200"
                >
                  <option value="all">All Prospects ({comments.length})</option>
                  <option value="pending_approval">Needs Review ({comments.filter((c) => c.status === 'pending_approval').length})</option>
                  <option value="posted">Approved &amp; Posted ({comments.filter((c) => c.status === 'posted').length})</option>
                  <option value="skipped">Skipped ({comments.filter((c) => c.status === 'skipped').length})</option>
                </select>
              </div>

              {(commentSearch.trim() || commentStatusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setCommentSearch('');
                    setCommentStatusFilter('all');
                  }}
                  className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-rose-600 hover:bg-rose-50 border-rose-200 font-semibold"
                  title="Reset prospect comments filter"
                >
                  <X size={12} />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <span className="text-xs text-slate-500 font-medium">
              Showing <strong className="text-slate-900 font-bold">{filteredComments.length}</strong> posts
            </span>
          </div>

          {/* List of Detected Prospect Posts */}
          <div className="space-y-4">
            {filteredComments.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl">
                <Sparkles size={24} className="mx-auto text-slate-400 mb-1.5" />
                <p className="text-xs text-slate-600 font-semibold">No prospect posts found matching the filter.</p>
              </div>
            ) : (
              filteredComments.map((item) => {
              const currentComment = editingComments[item.id] !== undefined ? editingComments[item.id] : item.generatedComment;

              return (
                <div
                  key={item.id}
                  className={`card p-4.5 border transition-all ${
                    item.status === 'posted'
                      ? 'border-emerald-200 bg-emerald-50/10'
                      : item.status === 'skipped'
                      ? 'opacity-60 border-slate-200 bg-slate-50/50'
                      : 'border-slate-200 bg-white shadow-2xs hover:border-indigo-300'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    {/* Prospect Info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs">
                        {item.prospectName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900">{item.prospectName}</h4>
                          <span className="rounded-full bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 text-[10px] font-bold">
                            LinkedIn Prospect
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              item.status === 'posted'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'skipped'
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-indigo-100 text-indigo-800 animate-pulse'
                            }`}
                          >
                            {item.status === 'pending_approval' ? 'Needs Review' : item.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{item.prospectHeadline}</p>
                      </div>
                    </div>

                    {/* Post Link */}
                    {item.postUrl && (
                      <a
                        href={item.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold shrink-0"
                      >
                        <span>View on LinkedIn</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>

                  {/* Original Prospect Post Snippet */}
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 border border-slate-200 text-xs text-slate-800 leading-relaxed">
                    <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider block mb-1">
                      Prospect's Recent Post:
                    </span>
                    <p className="italic">"{item.postSnippet}"</p>
                  </div>

                  {/* AI Generated Comment Draft (Editable) */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                        <Sparkles size={12} className="text-indigo-600" />
                        <span>AI Value-Adding Comment Draft:</span>
                      </label>
                      <span className="text-[10px] text-slate-400">Click to edit before posting</span>
                    </div>

                    <textarea
                      rows={2}
                      value={currentComment}
                      disabled={item.status === 'posted'}
                      onChange={(e) => setEditingComments({ ...editingComments, [item.id]: e.target.value })}
                      className="textarea text-xs bg-indigo-50/30 border-indigo-200 focus:border-indigo-500"
                    />
                  </div>

                  {/* Action Bar */}
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-[11px] text-slate-400">
                      Detected {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>

                    {item.status === 'pending_approval' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSkipComment(item.id)}
                          className="btn-secondary text-xs py-1.5 px-3 text-slate-500 hover:text-slate-700"
                        >
                          Skip
                        </button>

                        <button
                          onClick={() => handleApproveComment(item.id)}
                          disabled={approvingTaskId === item.id}
                          className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-2xs"
                        >
                          <Send size={12} className={approvingTaskId === item.id ? 'animate-spin' : ''} />
                          <span>{approvingTaskId === item.id ? 'Posting...' : 'Approve & Post Comment'}</span>
                        </button>
                      </div>
                    )}

                    {item.status === 'posted' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        <CheckCircle2 size={13} />
                        <span>Comment Live on Post</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            }))}
          </div>
        </div>
      )}

      {/* MODAL: Connect / Manage LinkedIn Account */}
      <Modal open={isConnectModalOpen} onClose={() => setIsConnectModalOpen(false)} title="Manage LinkedIn Account & Automation">
        <form onSubmit={handleConnect} className="space-y-4">
          <div className="rounded-xl bg-blue-50/80 border border-blue-200 p-3.5 text-xs text-blue-950 leading-relaxed">
            <p className="font-bold flex items-center gap-1.5 text-blue-900 mb-1">
              <ShieldCheck size={16} className="text-blue-700" />
              <span>Two Ways to Publish to LinkedIn</span>
            </p>
            <div className="mt-2 space-y-1.5 text-slate-700 text-[11px]">
              <p>
                <strong>1. 1-Click Direct Share (Default):</strong> No cookies required. When you click Share, the dashboard copies your post to your clipboard and opens LinkedIn in your browser so you can post immediately.
              </p>
              <p>
                <strong>2. Headless Background Auto-Posting:</strong> Provide your <code>li_at</code> session cookie below. The server will automatically publish posts directly to your feed in the background.
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">Account Full Name</label>
            <input
              type="text"
              value={connectName}
              onChange={(e) => setConnectName(e.target.value)}
              placeholder="e.g. Anupam Kumar"
              required
              className="input text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">Professional Headline</label>
            <input
              type="text"
              value={connectHeadline}
              onChange={(e) => setConnectHeadline(e.target.value)}
              placeholder="e.g. SEO Specialist & Growth Partner @ Online Digital Solution"
              required
              className="input text-xs"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">
                LinkedIn Session Cookie (<code>li_at</code>)
              </label>
              <span className="text-[10px] text-slate-500 font-normal">Optional for background auto-posting</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="password"
                value={connectCookie}
                onChange={(e) => {
                  setConnectCookie(e.target.value);
                  setCookieTestResult(null);
                }}
                placeholder="Paste li_at cookie here (e.g. AQEDAQ...)"
                className="input text-xs font-mono flex-1"
              />
              <button
                type="button"
                onClick={handleTestCookie}
                disabled={isTestingCookie || !connectCookie.trim()}
                className="btn-secondary text-xs py-2 px-3 font-semibold shrink-0 border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                {isTestingCookie ? (
                  <span className="flex items-center gap-1">
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Testing...</span>
                  </span>
                ) : (
                  <span>🧪 Test Cookie</span>
                )}
              </button>
            </div>

            {/* Test Result Message */}
            {cookieTestResult && (
              <div
                className={`mt-2 rounded-lg p-2.5 text-xs flex items-start gap-2 ${
                  cookieTestResult.valid
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border border-rose-200 text-rose-900'
                }`}
              >
                {cookieTestResult.valid ? (
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  {cookieTestResult.valid ? (
                    <p>
                      <strong>Cookie Verified!</strong> Connected to LinkedIn feed as{' '}
                      <strong>{cookieTestResult.accountName || 'LinkedIn Member'}</strong>.
                    </p>
                  ) : (
                    <p>
                      <strong>Cookie Error:</strong> {cookieTestResult.error || 'Could not verify session cookie'}. Make sure you copied the full value.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Visual Guide on how to get li_at */}
            <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
              <p className="font-bold text-slate-800">📌 How to get your <code>li_at</code> cookie in 15 seconds:</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Open <strong>linkedin.com</strong> in Google Chrome where you are logged in.</li>
                <li>Right-click anywhere and select <strong>Inspect</strong> (or press <code>⌥⌘I</code> / <code>F12</code>).</li>
                <li>Click the <strong>Application</strong> tab (or <strong>Storage</strong>) at the top.</li>
                <li>In the left panel, expand <strong>Cookies</strong> &gt; click <code>https://www.linkedin.com</code>.</li>
                <li>Find the row named <strong><code>li_at</code></strong>, double-click its <strong>Value</strong>, copy and paste here.</li>
              </ol>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsConnectModalOpen(false)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isConnecting}
              className="btn-primary text-xs py-1.5 px-4 font-bold bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isConnecting ? 'Saving...' : 'Save Account Settings'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Schedule Post Date/Time */}
      <Modal open={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)} title="📅 Schedule LinkedIn Post">
        <div className="space-y-4">
          {/* Native LinkedIn Scheduling Banner */}
          <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 text-xs text-purple-900 leading-relaxed">
            <div className="flex items-start gap-2">
              <Clock size={16} className="text-purple-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-purple-950">Option A: Schedule in Automated Outreach Queue</p>
                <p className="text-[11px] text-purple-800 mt-0.5">
                  Pick a target time below to queue the post. The system will hold the draft until the designated time.
                </p>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-purple-200/80 text-[11px] text-purple-900">
              <span className="font-bold">💡 Option B: Schedule Directly on LinkedIn:</span> When you click <strong>1-Click Share</strong>, LinkedIn opens in a new tab. In the LinkedIn composer popup, click the <strong>clock icon (🕒)</strong> right next to the blue <strong>Post</strong> button to schedule natively on your profile!
            </div>
          </div>

          {/* Quick Presets for Peak Engagement */}
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1.5 block">⚡ Quick Presets (Optimal LinkedIn B2B Times)</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => applySchedulePreset('tomorrow_830')}
                className="btn-secondary py-1.5 px-2.5 text-xs text-left font-medium border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition flex items-center justify-between"
              >
                <span>Tomorrow 8:30 AM</span>
                <span className="text-[10px] text-indigo-600 font-bold">Peak</span>
              </button>
              <button
                type="button"
                onClick={() => applySchedulePreset('tomorrow_1000')}
                className="btn-secondary py-1.5 px-2.5 text-xs text-left font-medium border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition flex items-center justify-between"
              >
                <span>Tomorrow 10:00 AM</span>
                <span className="text-[10px] text-slate-400">Morning</span>
              </button>
              <button
                type="button"
                onClick={() => applySchedulePreset('in_2_days')}
                className="btn-secondary py-1.5 px-2.5 text-xs text-left font-medium border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition flex items-center justify-between"
              >
                <span>In 2 Days (9:00 AM)</span>
                <span className="text-[10px] text-slate-400">+48h</span>
              </button>
              <button
                type="button"
                onClick={() => applySchedulePreset('next_tuesday')}
                className="btn-secondary py-1.5 px-2.5 text-xs text-left font-medium border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition flex items-center justify-between"
              >
                <span>Next Tuesday (9:00 AM)</span>
                <span className="text-[10px] text-emerald-600 font-bold">Top Day</span>
              </button>
            </div>
          </div>

          {/* Exact Datetime Input */}
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">Custom Date &amp; Time</label>
            <input
              type="datetime-local"
              value={scheduleDateTime}
              onChange={(e) => setScheduleDateTime(e.target.value)}
              className="input text-xs font-medium"
            />
          </div>

          {/* Post Snippet Preview */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Post Preview</p>
            <p className="text-xs text-slate-700 line-clamp-2 italic font-sans">
              "{postContent || 'No post content entered'}"
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsScheduleModalOpen(false)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handlePublishPost(true)}
              disabled={!scheduleDateTime || isPublishingPost}
              className="btn-primary text-xs py-1.5 px-4 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
            >
              {isPublishingPost ? 'Scheduling...' : 'Confirm Schedule'}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Reschedule Existing Scheduled Post */}
      <Modal open={isRescheduleModalOpen} onClose={() => setIsRescheduleModalOpen(false)} title="📅 Reschedule Post">
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Update the scheduled delivery date and time for: <strong>"{reschedulingPost?.title || 'Scheduled Post'}"</strong>
          </p>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">New Target Date &amp; Time</label>
            <input
              type="datetime-local"
              value={rescheduleDateTime}
              onChange={(e) => setRescheduleDateTime(e.target.value)}
              className="input text-xs font-medium"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsRescheduleModalOpen(false);
                setReschedulingPost(null);
              }}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveReschedule}
              disabled={!rescheduleDateTime}
              className="btn-primary text-xs py-1.5 px-4 font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs cursor-pointer"
            >
              Save New Time
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Add Prospect Post to Monitor */}
      <Modal open={isAddProspectPostOpen} onClose={() => setIsAddProspectPostOpen(false)} title="Add Prospect Post to Monitor">
        <form onSubmit={handleAddProspectPost} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">Prospect Name</label>
            <input
              type="text"
              value={newProspectName}
              onChange={(e) => setNewProspectName(e.target.value)}
              placeholder="e.g. Sarah Jenkins"
              required
              className="input text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">Prospect Headline / Title</label>
            <input
              type="text"
              value={newProspectHeadline}
              onChange={(e) => setNewProspectHeadline(e.target.value)}
              placeholder="e.g. VP of Operations at Tech Corp"
              className="input text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">LinkedIn Post URL</label>
            <input
              type="url"
              value={newPostUrl}
              onChange={(e) => setNewPostUrl(e.target.value)}
              placeholder="https://www.linkedin.com/posts/..."
              className="input text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">Post Snippet / Text Content</label>
            <textarea
              rows={4}
              value={newPostSnippet}
              onChange={(e) => setNewPostSnippet(e.target.value)}
              placeholder="Paste what the prospect wrote in their post here..."
              required
              className="textarea text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddProspectPostOpen(false)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAddingPost}
              className="btn-primary text-xs py-1.5 px-4 font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isAddingPost ? 'Drafting AI Comment...' : 'Add & Draft Comment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
