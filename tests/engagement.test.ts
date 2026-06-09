import { describe, it, expect } from 'vitest';
import {
  decideAction,
  canAct,
  dedupKey,
  renderReply,
  type EngagementItem,
  type EngageConfig,
  type ActGate,
} from '../src/core/engagement.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(kind: EngagementItem['kind'], id = 'item-1'): EngagementItem {
  return {
    id,
    kind,
    platform: 'bluesky',
    authorHandle: '@alice.bsky.social',
    authorId: 'did:plc:alice',
    subjectUri: 'at://did:plc:alice/app.bsky.feed.post/abc123',
    subjectCid: 'bafyreidfabc',
    text: 'great post!',
    createdAtIso: '2026-06-03T10:00:00.000Z',
  };
}

const allOff: EngageConfig = {
  likeEnabled: false,
  followBackEnabled: false,
  replyEnabled: false,
  dailyCap: 20,
};

const likeOnly: EngageConfig = { ...allOff, likeEnabled: true };
const replyOnly: EngageConfig = { ...allOff, replyEnabled: true };
const followOnly: EngageConfig = { ...allOff, followBackEnabled: true };
const allOn: EngageConfig = {
  likeEnabled: true,
  followBackEnabled: true,
  replyEnabled: true,
  dailyCap: 20,
};

// ── decideAction ──────────────────────────────────────────────────────────────

describe('decideAction', () => {
  it('follow + followBackEnabled → follow-back', () => {
    expect(decideAction(makeItem('follow'), followOnly)).toBe('follow-back');
  });

  it('follow + followBackEnabled=false → skip', () => {
    expect(decideAction(makeItem('follow'), allOff)).toBe('skip');
  });

  it('follow with all flags on → follow-back (follow-back takes precedence)', () => {
    expect(decideAction(makeItem('follow'), allOn)).toBe('follow-back');
  });

  it('reply + replyEnabled → reply', () => {
    expect(decideAction(makeItem('reply'), replyOnly)).toBe('reply');
  });

  it('reply + replyEnabled + likeEnabled → reply (reply preferred over like)', () => {
    expect(decideAction(makeItem('reply'), allOn)).toBe('reply');
  });

  it('reply + only likeEnabled → like (fallback when reply off)', () => {
    expect(decideAction(makeItem('reply'), likeOnly)).toBe('like');
  });

  it('reply + nothing enabled → skip', () => {
    expect(decideAction(makeItem('reply'), allOff)).toBe('skip');
  });

  it('mention + replyEnabled → reply', () => {
    expect(decideAction(makeItem('mention'), replyOnly)).toBe('reply');
  });

  it('mention + only likeEnabled → like', () => {
    expect(decideAction(makeItem('mention'), likeOnly)).toBe('like');
  });

  it('mention + nothing enabled → skip', () => {
    expect(decideAction(makeItem('mention'), allOff)).toBe('skip');
  });

  it('like + likeEnabled → like', () => {
    expect(decideAction(makeItem('like'), likeOnly)).toBe('like');
  });

  it('like + likeEnabled=false → skip', () => {
    expect(decideAction(makeItem('like'), allOff)).toBe('skip');
  });

  it('repost → always skip (no auto-action defined)', () => {
    expect(decideAction(makeItem('repost'), allOn)).toBe('skip');
  });

  it('unknown → always skip', () => {
    expect(decideAction(makeItem('unknown'), allOn)).toBe('skip');
  });
});

// ── canAct ────────────────────────────────────────────────────────────────────

describe('canAct', () => {
  it('alreadyActed=true → ok:false, reason=already-acted', () => {
    const g: ActGate = { actedToday: 0, dailyCap: 10, alreadyActed: true };
    const result = canAct(g);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('already-acted');
  });

  it('actedToday === dailyCap → ok:false, reason=daily-cap', () => {
    const g: ActGate = { actedToday: 10, dailyCap: 10, alreadyActed: false };
    const result = canAct(g);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('daily-cap');
  });

  it('actedToday > dailyCap → ok:false, reason=daily-cap', () => {
    const g: ActGate = { actedToday: 15, dailyCap: 10, alreadyActed: false };
    const result = canAct(g);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('daily-cap');
  });

  it('alreadyActed takes precedence over daily-cap', () => {
    // both conditions true — alreadyActed checked first
    const g: ActGate = { actedToday: 10, dailyCap: 10, alreadyActed: true };
    const result = canAct(g);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('already-acted');
  });

  it('actedToday < dailyCap and not already acted → ok:true', () => {
    const g: ActGate = { actedToday: 5, dailyCap: 10, alreadyActed: false };
    const result = canAct(g);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('actedToday=0, dailyCap=1, not already acted → ok:true', () => {
    const g: ActGate = { actedToday: 0, dailyCap: 1, alreadyActed: false };
    expect(canAct(g).ok).toBe(true);
  });
});

// ── dedupKey ──────────────────────────────────────────────────────────────────

describe('dedupKey', () => {
  it('produces stable key for same inputs', () => {
    const k1 = dedupKey('bluesky', 'reply', 'item-42', 'like');
    const k2 = dedupKey('bluesky', 'reply', 'item-42', 'like');
    expect(k1).toBe(k2);
  });

  it('includes all four segments', () => {
    const k = dedupKey('mastodon', 'follow', 'notif-7', 'follow-back');
    expect(k).toContain('mastodon');
    expect(k).toContain('follow');
    expect(k).toContain('notif-7');
    expect(k).toContain('follow-back');
  });

  it('different platforms produce distinct keys', () => {
    const kb = dedupKey('bluesky', 'like', 'abc', 'like');
    const km = dedupKey('mastodon', 'like', 'abc', 'like');
    expect(kb).not.toBe(km);
  });

  it('different actions produce distinct keys', () => {
    const kLike = dedupKey('bluesky', 'mention', 'abc', 'like');
    const kReply = dedupKey('bluesky', 'mention', 'abc', 'reply');
    expect(kLike).not.toBe(kReply);
  });

  it('different itemIds produce distinct keys', () => {
    const k1 = dedupKey('bluesky', 'reply', 'item-1', 'reply');
    const k2 = dedupKey('bluesky', 'reply', 'item-2', 'reply');
    expect(k1).not.toBe(k2);
  });
});

// ── renderReply ───────────────────────────────────────────────────────────────

describe('renderReply', () => {
  it('substitutes {handle}', () => {
    expect(renderReply('Thanks {handle}!', { handle: '@alice' })).toBe('Thanks @alice!');
  });

  it('substitutes {name}', () => {
    expect(renderReply('Hi {name}, nice to meet you!', { name: 'Alice' })).toBe(
      'Hi Alice, nice to meet you!'
    );
  });

  it('substitutes both {handle} and {name}', () => {
    expect(
      renderReply('Hey {name} ({handle}), thanks!', { handle: '@alice', name: 'Alice' })
    ).toBe('Hey Alice (@alice), thanks!');
  });

  it('case-insensitive — {HANDLE} matches handle var', () => {
    expect(renderReply('Hi {HANDLE}', { handle: '@bob' })).toBe('Hi @bob');
  });

  it('empty handle collapses double-spaces', () => {
    // handle is '' (not provided) — leaves no orphaned spaces
    expect(renderReply('Hello {handle} there', { handle: '' })).toBe('Hello there');
  });

  it('unknown placeholder left intact', () => {
    const out = renderReply('See {unknown_var} here', { handle: '@x' });
    expect(out).toContain('{unknown_var}');
  });

  it('trims leading/trailing whitespace', () => {
    expect(renderReply('{handle} ', { handle: '@x' })).toBe('@x');
  });

  it('no vars returns template unchanged (no placeholders)', () => {
    expect(renderReply('Plain text reply!', {})).toBe('Plain text reply!');
  });
});
