import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeRound,
  compare,
  dailyAnswers,
  DAILY_COUNT,
  dayKey,
  initialState,
  MAX_ATTEMPTS,
  playerMap,
  players,
  pools,
  reducer,
  restore,
  searchPlayers,
  shareText,
} from '../src/game.ts';

test('snapshot contains complete, localized real player attributes', () => {
  assert.equal(players.length, 380);
  assert.equal(pools.unlimited.length, 250);
  assert.equal(pools.daily.length, 250);
  assert.equal(new Set(players.map((p) => p.id)).size, players.length);
  for (const p of players) {
    assert.match(p.name, /[가-힣]/);
    assert.match(p.country, /[가-힣]/);
    assert.match(p.club, /[가-힣]/);
    assert.ok(p.age > 0 && p.value > 0);
    assert.ok(p.positionGroup);
  }
  assert.ok(
    pools.daily.every((id) => {
      const p = playerMap.get(id)!;
      return p.leagueId === 'GB1' && p.value >= 3000000;
    }),
  );
});
test('daily selection contains one eligible answer, is deterministic, and changes by day', () => {
  assert.equal(DAILY_COUNT, 1);
  const answers = dailyAnswers('2026-10-29');
  assert.equal(answers.length, 1);
  assert.ok(pools.daily.includes(answers[0]));
  assert.deepEqual(answers, dailyAnswers('2026-10-29'));
  assert.notDeepEqual(answers, dailyAnswers('2026-10-30'));
});
test('Korean calendar turns over at Seoul midnight', () => {
  assert.equal(dayKey(new Date('2026-10-29T14:59:59Z')), '2026-10-29');
  assert.equal(dayKey(new Date('2026-10-29T15:00:00Z')), '2026-10-30');
});
test('only position category gets partial match; numbers use exact equality and arrows', () => {
  const p = players[0],
    a = {
      ...p,
      birthYear: p.birthYear + 1,
      value: p.value + 1,
      number: (p.number ?? 0) + 1,
      positionId: 999,
      countryId: 'other',
    };
  const clues = compare(p, a);
  assert.deepEqual(clues.map((c) => c.key), [
    'country', 'club', 'position', 'birthYear', 'number', 'value',
  ]);
  assert.equal(clues.find((c) => c.key === 'position')!.match, 'near');
  assert.equal(clues.find((c) => c.key === 'country')!.match, 'miss');
  for (const key of ['birthYear', 'number', 'value']) {
    const clue = clues.find((c) => c.key === key)!;
    assert.equal(clue.match, 'miss');
    assert.equal(clue.direction, 'up');
  }
  assert.ok(compare(p, p).every((c) => c.match === 'exact' && !c.direction));
  assert.equal(compare(a, p).find((c) => c.key === 'value')!.direction, 'down');
});
test('search accepts Hangul, Latin without accents, and initials; hides used players', () => {
  const p = searchPlayers('홀란', 'unlimited')[0];
  assert.equal(p.latin, 'Erling Haaland');
  assert.equal(searchPlayers('Haaland', 'unlimited')[0].id, p.id);
  assert.ok(searchPlayers('ㅇㄹㅎㄹ', 'unlimited').some((x) => x.id === p.id));
  assert.equal(searchPlayers('Haaland', 'unlimited', [p.id]).length, 0);
  assert.ok(searchPlayers('mbappe', 'unlimited').some((x) => x.latin.includes('Mbapp')));
  assert.equal(searchPlayers('없는선수', 'daily').length, 0);
});
test('duplicate or ineligible guesses do not spend a chance', () => {
  let s = initialState();
  const id = pools.daily.find((id) => id !== s.daily[0].answer)!;
  s = reducer(s, { type: 'guess', id });
  assert.equal(activeRound(s).guesses.length, 1);
  assert.equal(reducer(s, { type: 'guess', id }), s);
  assert.equal(reducer(s, { type: 'guess', id: 'bogus' }), s);
});
test('daily win records once and blocks further guesses, reveal, and advancement', () => {
  let s = initialState();
  s = reducer(s, { type: 'guess', id: activeRound(s).answer });
  assert.equal(activeRound(s).status, 'won');
  assert.equal(s.stats.won, 1);
  assert.equal(s.stats.distribution[0], 1);
  assert.equal(reducer(s, { type: 'reveal' }), s);
  assert.equal(reducer(s, { type: 'guess', id: activeRound(s).answer }), s);
  assert.equal(reducer(s, { type: 'next' }), s);
  assert.equal(s.active, 0);
  assert.equal(s.daily.length, 1);
});
test('eight unsuccessful guesses end a round and reset streak', () => {
  let s = initialState();
  s = { ...s, stats: { ...s.stats, streak: 3, best: 3 } };
  for (const id of pools.daily.filter((id) => id !== s.daily[0].answer).slice(0, 8))
    s = reducer(s, { type: 'guess', id });
  assert.equal(activeRound(s).guesses.length, MAX_ATTEMPTS);
  assert.equal(activeRound(s).status, 'lost');
  assert.equal(s.stats.played, 1);
  assert.equal(s.stats.streak, 0);
  assert.equal(s.stats.best, 3);
});
test('reveal finishes without adding a guess and does not count as a win', () => {
  let s = initialState();
  s = reducer(s, { type: 'reveal' });
  assert.equal(activeRound(s).status, 'revealed');
  assert.equal(activeRound(s).guesses.length, 0);
  assert.equal(s.stats.played, 1);
  assert.equal(s.stats.won, 0);
});
test('both modes preserve progress, unlimited can advance, and the sole daily round cannot', () => {
  let s = initialState();
  const guess = pools.daily.find((id) => id !== s.daily[0].answer)!;
  s = reducer(s, { type: 'guess', id: guess });
  s = reducer(s, { type: 'mode', mode: 'unlimited' });
  s = reducer(s, { type: 'reveal' });
  const oldAnswer = s.unlimited.answer;
  s = reducer(s, { type: 'next' });
  assert.notEqual(s.unlimited.answer, oldAnswer);
  assert.equal(s.unlimited.status, 'playing');
  assert.deepEqual(s.unlimited.guesses, []);
  s = reducer(s, { type: 'mode', mode: 'daily' });
  assert.deepEqual(activeRound(s).guesses, [guess]);
  assert.equal(reducer(s, { type: 'daily', index: 1 }), s);
  s = reducer(s, { type: 'reveal' });
  assert.equal(s.active, 0);
  assert.equal(s.daily.length, 1);
  assert.equal(activeRound(s).status, 'revealed');
  assert.equal(reducer(s, { type: 'next' }), s);
});
test('restore validates saved data and new day keeps stats and unlimited progress', () => {
  let s = initialState('2026-10-29');
  s = reducer(s, { type: 'reveal' });
  s = reducer(s, { type: 'mode', mode: 'unlimited' });
  s = reducer(s, { type: 'guess', id: s.unlimited.answer });
  assert.deepEqual(restore(JSON.stringify(s), '2026-10-29'), s);
  const next = restore(JSON.stringify(s), '2026-10-30');
  assert.equal(next.stats.played, 2);
  assert.equal(next.unlimited.status, 'won');
  assert.equal(next.active, 0);
  assert.equal(next.daily.length, 1);
  assert.ok(next.daily.every((r) => r.status === 'playing'));
  assert.deepEqual(next.daily.map((r) => r.answer), dailyAnswers('2026-10-30'));
  for (const raw of [
    'broken',
    '{}',
    'null',
    JSON.stringify({ ...s, active: 9 }),
    JSON.stringify({ ...s, stats: {} }),
  ])
    assert.equal(restore(raw).stats.played, 0);
});
test('restore migrates three-round saves while retaining the first round, statistics, and unlimited progress', () => {
  let s = initialState('2026-10-29');
  s = reducer(s, { type: 'guess', id: s.daily[0].answer });
  s = reducer(s, { type: 'mode', mode: 'unlimited' });
  s = reducer(s, { type: 'guess', id: s.unlimited.answer });
  const otherAnswers = pools.daily.filter((id) => id !== s.daily[0].answer).slice(0, 2);
  const legacy = {
    ...s,
    mode: 'daily',
    active: 2,
    daily: [
      s.daily[0],
      { answer: otherAnswers[0], guesses: [], status: 'revealed' },
      { answer: otherAnswers[1], guesses: [], status: 'playing' },
    ],
    stats: { ...s.stats, played: 3, streak: 0 },
  };
  const migrated = restore(JSON.stringify(legacy), '2026-10-29');
  assert.equal(migrated.mode, 'daily');
  assert.equal(migrated.active, 0);
  assert.deepEqual(migrated.daily, [legacy.daily[0]]);
  assert.deepEqual(migrated.stats, legacy.stats);
  assert.deepEqual(migrated.unlimited, legacy.unlimited);
  assert.equal(reducer(migrated, { type: 'next' }), migrated);
  assert.equal(reducer(migrated, { type: 'guess', id: migrated.daily[0].answer }), migrated);
  assert.deepEqual(restore(JSON.stringify(migrated), '2026-10-29'), migrated);
  const nextDay = restore(JSON.stringify(legacy), '2026-10-30');
  assert.equal(nextDay.active, 0);
  assert.equal(nextDay.daily.length, 1);
  assert.equal(nextDay.daily[0].status, 'playing');
  assert.deepEqual(nextDay.stats, legacy.stats);
  assert.deepEqual(nextDay.unlimited, legacy.unlimited);
});
test('shared result contains feedback grid without revealing the answer', () => {
  let s = initialState();
  s = reducer(s, { type: 'guess', id: activeRound(s).answer });
  const shared = shareText(s);
  assert.match(shared, /1\/8/);
  assert.match(shared, /^🟩{6}$/mu);
  assert.ok(!shared.includes(playerMap.get(activeRound(s).answer)!.name));
});
