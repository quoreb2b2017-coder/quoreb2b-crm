'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  MessageCircle,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { chatService } from '@/lib/api/chat.service';
import { extractApiError } from '@/lib/api/errors';
import { connectSocket } from '@/lib/socket/socket.client';
import { useAuthStore } from '@/store/auth.store';
import type { ChatContact, ChatConversation, ChatMessage } from '@/types/chat';
import './chat.css';

type SideTab = 'chats' | 'contacts';

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

export function ChatApp() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const myId = user?.id ?? '';

  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<SideTab>('chats');
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [activeId, conversations],
  );

  const refreshConversations = useCallback(async () => {
    const rows = await chatService.listConversations();
    setConversations(rows);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const rows = await chatService.getMessages(conversationId, { limit: 100 });
      setMessages(rows);
      await chatService.markRead(conversationId);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
      );
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [contactRows, convoRows] = await Promise.all([
          chatService.listContacts(),
          chatService.listConversations(),
        ]);
        if (cancelled) return;
        setContacts(contactRows);
        setConversations(convoRows);
        if (convoRows.length === 0) setSideTab('contacts');
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
  }, []);

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
        void chatService.markRead(payload.conversationId);
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeId]);

  useEffect(() => {
    if (!activeId) return;
    const t = window.setTimeout(() => composerRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [activeId]);

  const openConversation = async (conversationId: string) => {
    setActiveId(conversationId);
    setMobileShowThread(true);
    setSideTab('chats');
    try {
      await loadMessages(conversationId);
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
    if (!activeId || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft('');
    if (composerRef.current) composerRef.current.style.height = 'auto';
    setSending(true);

    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      conversationId: activeId,
      senderId: myId,
      text,
      readBy: [myId],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const msg = await chatService.sendMessage(activeId, text);
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
      const hay = `${c.peerName} ${c.peerEmail} ${c.lastMessageText}`.toLowerCase();
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
              <strong>Messages</strong>
              <span>
                {contacts.length} people · anyone can chat
                {totalUnread > 0 ? ` · ${totalUnread} unread` : ''}
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

        {error && (
          <p className="wa-chat__error" role="alert">
            {error}
          </p>
        )}

        <div className="wa-chat__lists">
          {sideTab === 'chats' ? (
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
                  <p>No chats yet</p>
                  <button type="button" onClick={() => setSideTab('contacts')}>
                    Pick someone to message
                  </button>
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
                          <strong>{c.peerName}</strong>
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
                  <span className={`wa-chat__role-chip is-${roleTone(peerRoles)}`}>
                    {roleLabel(peerRoles)}
                  </span>
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
                  <p>Say hello to {activeConversation.peerName.split(' ')[0]}</p>
                  <span>Messages are delivered instantly</span>
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
                    <p>{m.text}</p>
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

            <form className="wa-chat__composer" onSubmit={(e) => void onSend(e)}>
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onComposerKeyDown}
                onInput={onComposerInput}
                placeholder="Type a message"
                maxLength={4000}
                rows={1}
                autoComplete="off"
              />
              <button type="submit" disabled={!draft.trim() || sending} aria-label="Send">
                <Send className="h-4 w-4" />
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
