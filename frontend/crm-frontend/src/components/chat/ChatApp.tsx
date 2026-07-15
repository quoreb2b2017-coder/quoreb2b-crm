'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  Eye,
  FileText,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  Smile,
  Users,
  X,
} from 'lucide-react';
import { chatService } from '@/lib/api/chat.service';
import { extractApiError } from '@/lib/api/errors';
import { connectSocket } from '@/lib/socket/socket.client';
import { useAuthStore } from '@/store/auth.store';
import type { ChatContact, ChatConversation, ChatMessage } from '@/types/chat';
import './chat.css';

type SideTab = 'chats' | 'contacts';

const CHAT_EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: [
      '😀', '😁', '😂', '🤣', '😅', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘',
      '😋', '😜', '🤗', '🤔', '🤨', '😐', '🙄', '😏', '😴', '😷', '🤒', '🤯',
      '😎', '🥳', '😭', '😤', '😡', '🥺', '😳', '🤭', '🤫', '🤐', '🫡', '🫶',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '👍', '👎', '👏', '🙌', '👋', '🤝', '🙏', '💪', '✌️', '🤞', '🤟', '👌',
      '👆', '👇', '👈', '👉', '🫵', '👀', '🧠', '💬', '✅', '❌', '⭐', '🔥',
    ],
  },
  {
    label: 'Work',
    emojis: [
      '📎', '📁', '📂', '📄', '📝', '📌', '📍', '📅', '⏰', '💼', '💻', '🖥️',
      '📧', '📞', '📱', '🔔', '✅', '☑️', '❗', '❓', '💡', '🎯', '📊', '🚀',
    ],
  },
  {
    label: 'More',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💯', '✨',
      '🎉', '🎊', '🎁', '☕', '🍕', '🍔', '🍻', '🏠', '🚗', '✈️', '☀️', '🌧️',
    ],
  },
];

function formatBytes(n: number) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function roleLabel(roles: string[] = []) {
  if (roles.includes('super_admin')) return 'Super admin';
  if (roles.includes('admin')) return 'Admin';
  if (roles.includes('db_admin')) return 'DB admin';
  if (roles.includes('employee')) return 'Employee';
  return 'User';
}

function roleTone(roles: string[] = []) {
  if (roles.includes('super_admin')) return 'super';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('db_admin')) return 'db';
  return 'employee';
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function formatListTime(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startToday.getTime() - startMsg.getTime()) / 86_400_000);
  if (dayDiff === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function formatBubbleTime(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayKey(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startToday.getTime() - startMsg.getTime()) / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function avatarColor(seed: string) {
  const palette = [
    '#00a884',
    '#027eb5',
    '#7c3aed',
    '#db2777',
    '#ea580c',
    '#059669',
    '#2563eb',
    '#b45309',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function ChatApp({ mode = 'mine' }: { mode?: 'mine' | 'oversight' }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const myId = user?.id ?? '';
  const isOversightMode = mode === 'oversight';

  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<SideTab>('chats');
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const activeObserverRef = useRef(false);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [activeId, conversations],
  );
  const isViewOnly = isOversightMode || Boolean(activeConversation?.isObserver);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    activeObserverRef.current = isViewOnly;
  }, [isViewOnly]);

  const refreshConversations = useCallback(async () => {
    const { conversations: rows } = await chatService.listConversations(mode);
    setConversations(rows);
  }, [mode]);

  const loadMessages = useCallback(async (conversationId: string, observe = false) => {
    setMessagesLoading(true);
    try {
      const rows = await chatService.getMessages(conversationId, { limit: 100 });
      setMessages(rows);
      if (!observe) {
        await chatService.markRead(conversationId);
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
        );
      }
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setActiveId(null);
        setMessages([]);
        setPendingFiles([]);
        const jobs: Promise<unknown>[] = [chatService.listConversations(mode)];
        if (!isOversightMode) {
          jobs.unshift(chatService.listContacts());
        }
        const results = await Promise.all(jobs);
        if (cancelled) return;
        if (isOversightMode) {
          const convoResult = results[0] as Awaited<ReturnType<typeof chatService.listConversations>>;
          setContacts([]);
          setConversations(convoResult.conversations);
          setSideTab('chats');
        } else {
          const contactRows = results[0] as ChatContact[];
          const convoResult = results[1] as Awaited<ReturnType<typeof chatService.listConversations>>;
          setContacts(contactRows);
          setConversations(convoResult.conversations);
          if (convoResult.conversations.length === 0) setSideTab('contacts');
        }
        setError(null);
      } catch (e) {
        if (!cancelled) setError(extractApiError(e, 'Failed to load chat'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, isOversightMode]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = connectSocket(accessToken);

    const onMessage = (payload: { conversationId: string; message: ChatMessage }) => {
      if (!payload?.message) return;
      if (activeIdRef.current === payload.conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.message.id)) return prev;
          return [...prev, payload.message];
        });
        if (!activeObserverRef.current) {
          void chatService.markRead(payload.conversationId);
        }
      }
      void refreshConversations();
    };

    const onConvoUpdated = () => {
      void refreshConversations();
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:conversation-updated', onConvoUpdated);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:conversation-updated', onConvoUpdated);
    };
  }, [accessToken, refreshConversations]);

  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (emojiPanelRef.current?.contains(t)) return;
      if ((t as HTMLElement)?.closest?.('.wa-chat__emoji-btn')) return;
      setEmojiOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [emojiOpen]);

  useEffect(() => {
    setEmojiOpen(false);
  }, [activeId, isViewOnly]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeId]);

  useEffect(() => {
    if (!activeId || isViewOnly) return;
    const t = window.setTimeout(() => composerRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [activeId, isViewOnly]);

  const insertEmoji = (emoji: string) => {
    const el = composerRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    if (next.length > 4000) return;
    setDraft(next);
    requestAnimationFrame(() => {
      const box = composerRef.current;
      if (!box) return;
      box.focus();
      const pos = start + emoji.length;
      box.setSelectionRange(pos, pos);
      box.style.height = 'auto';
      box.style.height = `${Math.min(box.scrollHeight, 140)}px`;
    });
  };

  const openConversation = async (conversationId: string) => {
    const target = conversations.find((c) => c.id === conversationId);
    const observe = isOversightMode || Boolean(target?.isObserver);
    setActiveId(conversationId);
    setMobileShowThread(true);
    setSideTab('chats');
    setPendingFiles([]);
    try {
      await loadMessages(conversationId, observe);
      setError(null);
    } catch (e) {
      setError(extractApiError(e, 'Failed to load messages'));
    }
  };

  const startWithContact = async (contact: ChatContact) => {
    try {
      const convo = await chatService.startConversation(contact.id);
      setConversations((prev) => {
        const rest = prev.filter((c) => c.id !== convo.id);
        return [convo, ...rest];
      });
      setActiveId(convo.id);
      setMobileShowThread(true);
      setSideTab('chats');
      await loadMessages(convo.id);
      setError(null);
    } catch (e) {
      setError(extractApiError(e, 'Could not start chat'));
    }
  };

  const onSend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!activeId || sending) return;
    if (isViewOnly) return;
    const text = draft.trim();
    const files = [...pendingFiles];
    if (!text && !files.length) return;

    setDraft('');
    setPendingFiles([]);
    setEmojiOpen(false);
    if (composerRef.current) composerRef.current.style.height = 'auto';
    setSending(true);

    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      conversationId: activeId,
      senderId: myId,
      text,
      attachments: files.map((f) => ({
        fileName: f.name,
        mimeType: f.type || 'application/octet-stream',
        sizeBytes: f.size,
      })),
      readBy: [myId],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const attachments = [];
      for (const file of files) {
        const presign = await chatService.presignAttachment(activeId, {
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSizeBytes: file.size,
        });
        if (presign.storage === 's3' && presign.uploadUrl) {
          const put = await fetch(presign.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          if (!put.ok) throw new Error(`Upload failed for ${file.name}`);
          attachments.push({
            key: presign.key,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
          });
        } else {
          const uploaded = await chatService.uploadLocalAttachment(
            activeId,
            presign.key,
            file,
          );
          attachments.push(uploaded);
        }
      }

      const msg = await chatService.sendMessage(activeId, {
        text: text || undefined,
        attachments: attachments.length ? attachments : undefined,
      });
      setMessages((prev) => {
        const withoutTmp = prev.filter((m) => m.id !== optimisticId);
        if (withoutTmp.some((m) => m.id === msg.id)) return withoutTmp;
        return [...withoutTmp, msg];
      });
      await refreshConversations();
      setError(null);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(text);
      setPendingFiles(files);
      setError(extractApiError(err, 'Send failed'));
    } finally {
      setSending(false);
    }
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  };

  const onComposerInput = () => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const q = query.trim().toLowerCase();

  const filteredContacts = useMemo(() => {
    const list = !q
      ? contacts
      : contacts.filter((c) => {
          const hay =
            `${c.displayName} ${c.email} ${c.employeeId ?? ''} ${roleLabel(c.roles)}`.toLowerCase();
          return hay.includes(q);
        });
    return [...list].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [contacts, q]);

  const filteredConversations = useMemo(() => {
    if (!q) return conversations;
    return conversations.filter((c) => {
      const names = (c.participants ?? []).map((p) => p.name).join(' ');
      const hay = `${c.peerName} ${c.peerEmail} ${c.lastMessageText} ${names}`.toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, q]);

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const threadItems = useMemo(() => {
    const items: Array<
      | { kind: 'day'; key: string; label: string }
      | { kind: 'message'; key: string; message: ChatMessage }
    > = [];
    let lastDay = '';
    for (const m of messages) {
      const key = dayKey(m.createdAt);
      if (key && key !== lastDay) {
        items.push({ kind: 'day', key: `day-${key}`, label: dayLabel(m.createdAt) });
        lastDay = key;
      }
      items.push({ kind: 'message', key: m.id, message: m });
    }
    return items;
  }, [messages]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread > 0 ? c.unread : 0), 0),
    [conversations],
  );

  const backToList = () => {
    setMobileShowThread(false);
  };

  const peerRoles =
    activeConversation?.peerRoles?.length
      ? activeConversation.peerRoles
      : contactById.get(activeConversation?.peerId ?? '')?.roles ?? [];

  return (
    <div className={`wa-chat${mobileShowThread && activeConversation ? ' is-thread-open' : ''}`}>
      <aside className="wa-chat__sidebar">
        <header className="wa-chat__side-head">
          <div className="wa-chat__brand">
            <span className="wa-chat__brand-icon">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div>
              <strong>{isOversightMode ? 'Team chats' : 'Messages'}</strong>
              <span>
                {isOversightMode
                  ? 'View-only · all conversations'
                  : `${contacts.length} people`}
                {!isOversightMode && totalUnread > 0 ? ` · ${totalUnread} unread` : ''}
              </span>
            </div>
          </div>
        </header>

        <label className="wa-chat__search">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, role…"
          />
        </label>

        {!isOversightMode && (
        <div className="wa-chat__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={sideTab === 'chats'}
            className={sideTab === 'chats' ? 'is-active' : ''}
            onClick={() => setSideTab('chats')}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Chats
            {totalUnread > 0 && <span className="wa-chat__tab-badge">{totalUnread}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sideTab === 'contacts'}
            className={sideTab === 'contacts' ? 'is-active' : ''}
            onClick={() => setSideTab('contacts')}
          >
            <Users className="h-3.5 w-3.5" />
            Contacts
            <span className="wa-chat__tab-count">{contacts.length}</span>
          </button>
        </div>
        )}

        {error && (
          <p className="wa-chat__error" role="alert">
            {error}
          </p>
        )}

        <div className="wa-chat__lists">
          {sideTab === 'chats' || isOversightMode ? (
            <section>
              {loading && (
                <div className="wa-chat__skeleton-list" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="wa-chat__skeleton-row" />
                  ))}
                </div>
              )}
              {!loading && filteredConversations.length === 0 && (
                <div className="wa-chat__empty-side">
                  <MessageCircle className="h-8 w-8" />
                  <p>{isOversightMode ? 'No team chats yet' : 'No chats yet'}</p>
                  {!isOversightMode && (
                    <button type="button" onClick={() => setSideTab('contacts')}>
                      Pick someone to message
                    </button>
                  )}
                </div>
              )}
              <ul>
                {filteredConversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`wa-chat__row${activeId === c.id ? ' is-active' : ''}`}
                      onClick={() => void openConversation(c.id)}
                    >
                      <span
                        className="wa-chat__avatar"
                        style={{ background: avatarColor(c.peerId || c.peerName) }}
                      >
                        {initials(c.peerName)}
                      </span>
                      <span className="wa-chat__row-body">
                        <span className="wa-chat__row-top">
                          <strong>
                            {(isOversightMode || c.isObserver) && (
                              <Eye className="wa-chat__observe-icon" aria-hidden />
                            )}
                            {c.peerName}
                          </strong>
                          <time>{formatListTime(c.lastMessageAt)}</time>
                        </span>
                        <span className="wa-chat__row-bottom">
                          <em>
                            {c.lastMessageSenderId === myId ? 'You: ' : ''}
                            {c.lastMessageText || 'Tap to open chat'}
                          </em>
                          {c.unread > 0 && <span className="wa-chat__badge">{c.unread}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section>
              {loading && (
                <div className="wa-chat__skeleton-list" aria-hidden>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="wa-chat__skeleton-row" />
                  ))}
                </div>
              )}
              {!loading && filteredContacts.length === 0 && (
                <div className="wa-chat__empty-side">
                  <Users className="h-8 w-8" />
                  <p>{q ? 'No matching contacts' : 'No contacts yet'}</p>
                </div>
              )}
              <ul>
                {filteredContacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="wa-chat__row"
                      onClick={() => void startWithContact(c)}
                    >
                      <span
                        className="wa-chat__avatar"
                        style={{ background: avatarColor(c.id) }}
                      >
                        {initials(c.displayName)}
                      </span>
                      <span className="wa-chat__row-body">
                        <span className="wa-chat__row-top">
                          <strong>{c.displayName}</strong>
                          <span className={`wa-chat__role-chip is-${roleTone(c.roles)}`}>
                            {roleLabel(c.roles)}
                          </span>
                        </span>
                        <span className="wa-chat__row-bottom">
                          <em>{c.email}</em>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>

      <main className="wa-chat__main">
        {!activeConversation ? (
          <div className="wa-chat__empty">
            <div className="wa-chat__empty-card">
              <span className="wa-chat__empty-icon">
                <MessageCircle className="h-10 w-10" />
              </span>
              <h2>Quore team chat</h2>
              <p>
                Select any employee, admin, DB admin, or super admin from Contacts — anyone can
                message anyone in real time.
              </p>
              <button type="button" className="wa-chat__empty-cta" onClick={() => setSideTab('contacts')}>
                Browse contacts
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="wa-chat__header">
              <button
                type="button"
                className="wa-chat__back"
                aria-label="Back to chats"
                onClick={backToList}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <span
                className="wa-chat__avatar wa-chat__avatar--lg"
                style={{ background: avatarColor(activeConversation.peerId) }}
              >
                {initials(activeConversation.peerName)}
              </span>
              <div className="wa-chat__header-meta">
                <strong>{activeConversation.peerName}</strong>
                <span>
                  {isViewOnly ? (
                    <span className="wa-chat__role-chip is-admin">
                      <Eye className="h-3 w-3" /> Observing
                    </span>
                  ) : (
                    <span className={`wa-chat__role-chip is-${roleTone(peerRoles)}`}>
                      {roleLabel(peerRoles)}
                    </span>
                  )}
                  {activeConversation.peerEmail ? (
                    <span className="wa-chat__header-email">{activeConversation.peerEmail}</span>
                  ) : null}
                </span>
              </div>
            </header>

            <div className="wa-chat__thread">
              {messagesLoading && messages.length === 0 && (
                <p className="wa-chat__thread-loading">Loading messages…</p>
              )}
              {!messagesLoading && messages.length === 0 && (
                <div className="wa-chat__thread-empty">
                  <p>
                    {isViewOnly
                      ? 'No messages in this conversation yet'
                      : `Say hello to ${activeConversation.peerName.split(' ')[0]}`}
                  </p>
                </div>
              )}
              {threadItems.map((item) => {
                if (item.kind === 'day') {
                  return (
                    <div key={item.key} className="wa-chat__day">
                      <span>{item.label}</span>
                    </div>
                  );
                }
                const m = item.message;
                const mine = m.senderId === myId;
                const pending = m.id.startsWith('tmp-');
                const read = mine && !pending && (m.readBy?.length ?? 0) > 1;
                return (
                  <div
                    key={m.id}
                    className={`wa-chat__bubble${mine ? ' is-mine' : ' is-theirs'}${pending ? ' is-pending' : ''}`}
                  >
                    {m.text ? <p>{m.text}</p> : null}
                    {(m.attachments?.length ?? 0) > 0 && (
                      <div className="wa-chat__files">
                        {m.attachments!.map((att, idx) => (
                          <button
                            key={`${m.id}-att-${idx}`}
                            type="button"
                            className="wa-chat__file"
                            disabled={pending}
                            onClick={() =>
                              void chatService
                                .downloadAttachment(m.conversationId, m.id, idx)
                                .catch((err) =>
                                  setError(extractApiError(err, 'Download failed')),
                                )
                            }
                          >
                            <FileText className="h-4 w-4" />
                            <span>
                              <strong>{att.fileName}</strong>
                              <em>{formatBytes(att.sizeBytes)}</em>
                            </span>
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    )}
                    <span className="wa-chat__meta">
                      <time>{formatBubbleTime(m.createdAt)}</time>
                      {mine &&
                        (read ? (
                          <CheckCheck className="wa-chat__ticks is-read" aria-hidden />
                        ) : (
                          <Check className="wa-chat__ticks" aria-hidden />
                        ))}
                    </span>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {isViewOnly ? (
              <div className="wa-chat__observer-bar">
                <Eye className="h-4 w-4" />
                Team chats view — read &amp; download only
              </div>
            ) : (
              <form className="wa-chat__composer" onSubmit={(e) => void onSend(e)}>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  multiple
                  accept="*/*"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    if (!picked.length) return;
                    const oversize = picked.find((f) => f.size > 25 * 1024 * 1024);
                    if (oversize) {
                      setError(`"${oversize.name}" is over 25 MB`);
                      e.target.value = '';
                      return;
                    }
                    setPendingFiles((prev) => [...prev, ...picked].slice(0, 5));
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="wa-chat__attach"
                  aria-label="Attach file"
                  title="Attach file (any type, max 25 MB, up to 5)"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <div className="wa-chat__composer-wrap">
                  {emojiOpen && (
                    <div
                      ref={emojiPanelRef}
                      className="wa-chat__emoji-panel"
                      role="dialog"
                      aria-label="Emoji picker"
                    >
                      {CHAT_EMOJI_GROUPS.map((group) => (
                        <div key={group.label} className="wa-chat__emoji-group">
                          <p>{group.label}</p>
                          <div className="wa-chat__emoji-grid">
                            {group.emojis.map((emoji) => (
                              <button
                                key={`${group.label}-${emoji}`}
                                type="button"
                                className="wa-chat__emoji-item"
                                onClick={() => insertEmoji(emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="wa-chat__composer-main">
                    {pendingFiles.length > 0 && (
                      <div className="wa-chat__pending-files">
                        {pendingFiles.map((f, i) => (
                          <span key={`${f.name}-${i}`} className="wa-chat__pending-chip">
                            <FileText className="h-3 w-3" />
                            {f.name}
                            <button
                              type="button"
                              aria-label={`Remove ${f.name}`}
                              onClick={() =>
                                setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="wa-chat__composer-row">
                      <button
                        type="button"
                        className={`wa-chat__emoji-btn${emojiOpen ? ' is-open' : ''}`}
                        aria-label="Emoji"
                        aria-expanded={emojiOpen}
                        title="Emoji"
                        onClick={() => setEmojiOpen((v) => !v)}
                        disabled={sending}
                      >
                        <Smile className="h-4 w-4" />
                      </button>
                      <textarea
                        ref={composerRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onComposerKeyDown}
                        onInput={onComposerInput}
                        placeholder="Type a message, emoji, or attach a file"
                        maxLength={4000}
                        rows={1}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={(!draft.trim() && !pendingFiles.length) || sending}
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
