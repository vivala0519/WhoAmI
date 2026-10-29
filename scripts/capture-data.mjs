import fs from 'node:fs/promises';
const base = 'https://tmapi.transfermarkt.technology';
const source = JSON.parse(
  await fs.readFile(
    new URL('../../../whatsMyValue/src/captured-data.json', import.meta.url),
    'utf8',
  ),
);
const ids = [...new Set([...source.world, ...source.premier].map((p) => p.id))];
async function get(path, ids) {
  const query = ids ? '?' + new URLSearchParams(ids.map((id) => ['ids[]', String(id)])) : '';
  const r = await fetch(base + path + query, {
    headers: { 'Accept-Language': 'en-GB' },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  const data = await r.json();
  if (!data.data) throw new Error(`No data for ${path}`);
  return data.data;
}
const players = [];
for (let i = 0; i < ids.length; i += 100) {
  players.push(...(await get('/players', ids.slice(i, i + 100))));
  console.log(`Players: ${players.length}/${ids.length}`);
}
await fs.writeFile('docs/evidence/players.json', JSON.stringify(players));
const clubIds = [
  ...new Set(
    players
      .map((p) => p.clubAssignments?.find((c) => c.type === 'current')?.clubId)
      .filter(Boolean),
  ),
];
const clubs = [];
for (let i = 0; i < clubIds.length; i += 100)
  clubs.push(...(await get('/clubs', clubIds.slice(i, i + 100))));
const competitionIds = [
  ...new Set(clubs.map((c) => c.baseDetails?.primaryCompetitionId).filter(Boolean)),
];
const [attributes, competitions] = await Promise.all([
  get('/attributes'),
  get('/competitions', competitionIds),
]);
await fs.writeFile(
  'docs/evidence/entities.json',
  JSON.stringify({ clubs, competitions, attributes }),
);
await fs.writeFile(
  'docs/evidence/pools.json',
  JSON.stringify({
    world: source.world.map((p) => p.id),
    premier: source.premier.map((p) => p.id),
  }),
);
console.log(
  JSON.stringify({
    players: players.length,
    clubs: clubs.length,
    competitions: competitions.length,
    sample: players[0],
    club: clubs[0],
    position: attributes.positions[0],
  }),
);
