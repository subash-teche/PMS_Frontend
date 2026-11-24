import { useNavigate } from 'react-router';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, ChevronsUpDown, KeyRound, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { ActionMenu } from '@/components/ui/Dropdown';
import { Avatar } from '@/components/ui/Display';
import { SCREENS } from '@/lib/constants';
import { flowApi } from '@/api/endpoints';

/** Decorative hills along the bottom of the menu (sits behind the footer) – from the design's app.js. */
export function SideHills() {
  return (
    <div className="side-hills">
      <svg viewBox="0 0 260 105" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="hlBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F7FCFA" stopOpacity="0" />
            <stop offset=".45" stopColor="#F7FCFA" />
            <stop offset="1" stopColor="#F9FDFB" />
          </linearGradient>
          <linearGradient id="hlMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#CDEFE1" />
            <stop offset="1" stopColor="#DCF3E9" />
          </linearGradient>
          <linearGradient id="hlLow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#B8E5D3" />
            <stop offset="1" stopColor="#D0EEE1" />
          </linearGradient>
          <linearGradient id="hlFront" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#B2E3D0" />
            <stop offset="1" stopColor="#8ED2B8" />
          </linearGradient>
        </defs>
        <rect width="260" height="105" fill="url(#hlBg)" />
        <path d="M30 26C55 30 90 45 127 65C150 77 175 77 196 71C221 63 240 53 260 51V105H30z" fill="url(#hlMid)" />
        <path d="M78 70C104 79 136 83 166 80C200 77 230 63 260 51V105H78z" fill="url(#hlLow)" />
        <path d="M0 10C20 13 37 23 57 43C77 63 100 88 128 105H0z" fill="url(#hlFront)" />
      </svg>
    </div>
  );
}

const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' });
const PREVIEW = { note: '', handover: 'Handed over · ', close: 'Closed their step · ' };

/** The bell: unread Messages (count on the bell, one row per person, newest first). Only for people who use the Tasks board. */
function MessagesBell() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const on = !!session.apps?.includes('tm');
  const inbox = useQuery({ queryKey: ['flow-inbox'], queryFn: () => flowApi.messages({ mine: 1 }), enabled: on, refetchInterval: 30_000 }).data;
  const people = useQuery({ queryKey: ['flow-people'], queryFn: () => flowApi.options(), enabled: on, staleTime: 300_000 }).data?.users ?? [];
  const readAll = useMutation({ mutationFn: () => flowApi.readAll(), onSuccess: () => qc.invalidateQueries({ queryKey: ['flow-inbox'] }) });
  const unread = inbox?.unread ?? 0;

  // one row per person, newest first (the feed is newest first, so the first post seen is the latest)
  const chats = useMemo(() => {
    const by = new Map();
    for (const p of inbox?.items ?? []) {
      if (p.authorId === user.id) continue;
      const n = p.mentions.some((m) => m.userId === user.id && !m.readAt) ? 1 : 0;
      const e = by.get(p.authorId);
      if (e) e.unread += n;
      else by.set(p.authorId, { last: p, unread: n });
    }
    return [...by.entries()];
  }, [inbox, user.id]);

  const rows = on && chats.length
    ? chats.map(([id, { last }]) => ({
        key: id,
        label: (
          <span className="bell-row">
            <span className="bell-row-top">
              <b>{people.find((u) => u.id === id)?.name ?? 'Someone'}</b>
              <span className="muted small">{clock(last.createdAt)}</span>
            </span>
            <span className="bell-row-msg">{PREVIEW[last.kind]}{last.taskTitle ? `${last.taskTitle}: ` : ''}{last.body}</span>
          </span>
        ),
        onClick: () => navigate('/messages', { state: { personId: id } }),
      }))
    : [{
        key: 'none',
        label: (
          <span className="dropdown-empty" style={{ display: 'block', textAlign: 'center' }}>
            <BellOff style={{ width: 18, height: 18, display: 'block', margin: '0 auto 6px' }} />
            You&apos;re all caught up
          </span>
        ),
      }];

  return (
    <ActionMenu
      alignRight={false}
      minWidth={320}
      trigger={({ toggle }) => (
        <button type="button" className="dropdown-toggle su-bell" title="Notifications" aria-label={`Notifications, ${unread} unread`} onClick={toggle}>
          <Bell />
          {unread > 0 && <span className="su-bell-count">{unread > 99 ? '99+' : unread}</span>}
        </button>
      )}
      header={
        <div className="row between" style={{ padding: '6px 10px 8px', gap: 8 }}>
          <b style={{ fontSize: 13.5 }}>Notifications</b>
          {on && unread > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={readAll.isPending} onClick={() => readAll.mutate()}>Mark all read</button>
          )}
        </div>
      }
      items={rows}
    />
  );
}

/** Profile menu + notifications, as in the design. */
export function SidebarFooter() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="side-foot">
      <div className="side-user">
        <ActionMenu
          alignRight={false}
          minWidth={220}
          trigger={({ toggle }) => (
            <button type="button" className="dropdown-toggle su-profile" title={`${user.name} – ${user.role.name}`} onClick={toggle}>
              <Avatar name={user.name} size="md" />
              <span className="su-who">
                <b>{user.name}</b>
                <span>{user.role.name}</span>
              </span>
              <span className="su-caret">
                <ChevronsUpDown />
              </span>
            </button>
          )}
          header={
            <>
              <div className="dropdown-option" style={{ cursor: 'default', background: 'none' }}>
                <Avatar name={user.name} />
                <span>
                  <b style={{ display: 'block', fontSize: 13 }}>{user.name}</b>
                  <span className="muted small">{user.email || user.username}</span>
                </span>
              </div>
              <div className="dropdown-divider" />
            </>
          }
          items={[
            {
              label: 'My profile',
              icon: UserRound,
              hidden: !can(SCREENS.USERS, 'edit'),
              onClick: () => navigate(`/administration/users/${user.id}/edit`),
            },
            { label: 'Change password', icon: KeyRound, onClick: () => navigate('/account/change-password') },
            { divider: true },
            { label: 'Log out', icon: LogOut, danger: true, onClick: () => logout().then(() => navigate('/login')) },
          ]}
        />
        <MessagesBell />
      </div>
    </div>
  );
}
