'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Search, Send, Users } from 'lucide-react';
import { chatService } from '@/lib/api/chat.service';
import { connectSocket } from '@/lib/socket/socket.client';
import { useAuthStore } from '@/store/auth.store';
import type { ChatContact, ChatConversation, ChatMessage } from '@/types/chat';
import './chat.css';

function roleLabel(roles: string[] = []) {
  if (roles.includes('super_admin')) return 'Super admin';
  if (roles.includes('admin')) return 'Admin';
  if (roles.includes('db_admin')) return 'DB admin';
  if (roles.includes('employee')) return 'Employee';
  return 'User';
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function formatTime(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
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
    const rows = await chatService.getMessages(conversationId, { limit: 80 });
    setMessages(rows);
    await chatService.markRead(conversationId);
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
    );
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
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load chat');
        }
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

  const openConversation = async (conversationId: string) => {
    setActiveId(conversationId);
    try {
      await loadMessages(conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load messages');
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
      await loadMessages(convo.id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start chat');
    }
  };

  const onSend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!activeId || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft('');
    setSending(true);
    try {
      const msg = await chatService.sendMessage(activeId, text);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      await refreshConversations();
    } catch (err) {
      setDraft(text);
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const q = query.trim().toLowerCase();
  const filteredContacts = useMemo(() => {
    if (!q) return contacts;
    return contacts.filter((c) => {
      const hay = `${c.displayName} ${c.email} ${c.employeeId ?? ''} ${roleLabel(c.roles)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, q]);

  const filteredConversations = useMemo(() => {
    if (!q) return conversations;
    return conversations.filter((c) => {
      const hay = `${c.peerName} ${c.peerEmail} ${c.lastMessageText}`.toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, q]);

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  return (
    <div className="wa-chat">
      <aside className="wa-chat__sidebar">
        <header className="wa-chat__side-head">
          <div className="wa-chat__brand">
            <MessageCircle className="h-5 w-5" />
            <div>
              <strong>Chat</strong>
              <span>Team messaging</span>
            </div>
          </div>
        </header>

        <label className="wa-chat__search">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
          />
        </label>

        {error && <p className="wa-chat__error">{error}</p>}

        <div className="wa-chat__lists">
          <section>
            <h3>
              <MessageCircle className="h-3.5 w-3.5" />
              Chats
            </h3>
            {loading && <p className="wa-chat__muted">Loading…</p>}
            {!loading && filteredConversations.length === 0 && (
              <p className="wa-chat__muted">No chats yet — pick a contact to start.</p>
            )}
            <ul>
              {filteredConversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`wa-chat__row${activeId === c.id ? ' is-active' : ''}`}
                    onClick={() => void openConversation(c.id)}
                  >
                    <span className="wa-chat__avatar">{initials(c.peerName)}</span>
                    <span className="wa-chat__row-body">
                      <span className="wa-chat__row-top">
                        <strong>{c.peerName}</strong>
                        <time>{formatTime(c.lastMessageAt)}</time>
                      </span>
                      <span className="wa-chat__row-bottom">
                        <em>{c.lastMessageText || 'Tap to open chat'}</em>
                        {c.unread > 0 && <span className="wa-chat__badge">{c.unread}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>
              <Users className="h-3.5 w-3.5" />
              Contacts
            </h3>
            <ul>
              {filteredContacts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="wa-chat__row"
                    onClick={() => void startWithContact(c)}
                  >
                    <span className="wa-chat__avatar wa-chat__avatar--soft">
                      {initials(c.displayName)}
                    </span>
                    <span className="wa-chat__row-body">
                      <span className="wa-chat__row-top">
                        <strong>{c.displayName}</strong>
                      </span>
                      <span className="wa-chat__row-bottom">
                        <em>{roleLabel(c.roles)}</em>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>

      <main className="wa-chat__main">
        {!activeConversation ? (
          <div className="wa-chat__empty">
            <MessageCircle className="h-12 w-12" />
            <h2>Start a conversation</h2>
            <p>Select any employee, admin, or super admin from contacts to chat in real time.</p>
          </div>
        ) : (
          <>
            <header className="wa-chat__header">
              <span className="wa-chat__avatar">
                {initials(activeConversation.peerName)}
              </span>
              <div>
                <strong>{activeConversation.peerName}</strong>
                <span>
                  {roleLabel(
                    activeConversation.peerRoles.length
                      ? activeConversation.peerRoles
                      : contactById.get(activeConversation.peerId)?.roles ?? [],
                  )}
                  {activeConversation.peerEmail ? ` · ${activeConversation.peerEmail}` : ''}
                </span>
              </div>
            </header>

            <div className="wa-chat__thread">
              {messages.map((m) => {
                const mine = m.senderId === myId;
                return (
                  <div
                    key={m.id}
                    className={`wa-chat__bubble${mine ? ' is-mine' : ' is-theirs'}`}
                  >
                    <p>{m.text}</p>
                    <time>{formatTime(m.createdAt)}</time>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form className="wa-chat__composer" onSubmit={(e) => void onSend(e)}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message"
                maxLength={4000}
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
