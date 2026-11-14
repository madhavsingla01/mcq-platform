// This helper is mirrored in independently packaged services. Keep the copies in sync.
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordCharacter = '[\\p{L}\\p{N}]';

function closeWord(token: string) {
  const characters = Array.from(token);
  if (characters.length < 4 || characters.length > 24) return escapeRegex(token);

  const variants = new Set();
  for (let index = 0; index <= characters.length; index += 1) {
    const before = characters.slice(0, index).join('');
    const after = characters.slice(index).join('');
    variants.add(before + wordCharacter + after);
    if (index < characters.length) {
      const rest = characters.slice(index + 1).join('');
      variants.add(before + rest);
      variants.add(before + wordCharacter + rest);
    }
    if (index + 1 < characters.length) {
      variants.add(before + characters[index + 1] + characters[index] + characters.slice(index + 2).join(''));
    }
  }
  return `(?:^|[^\\p{L}\\p{N}])(?:${[...variants].join('|')})(?=$|[^\\p{L}\\p{N}])`;
}

const fieldsMatch = (fields: readonly string[], regex: string) => fields.map(field => ({ [field]: { $regex: regex, $options: 'i' } }));
const matchesText = (input: string, regex: string) => ({
  $regexMatch: { input: { $convert: { input, to: 'string', onNull: '', onError: '' } }, regex, options: 'i' },
});

interface SearchOptions {
  primary: string;
  fields?: readonly string[];
  arrays?: readonly string[];
  wordFields?: readonly string[];
  literalFields?: readonly string[];
  literalOnly?: boolean;
}

export function buildClosestSearch(query: string, { primary, fields = [], arrays = [], wordFields = [], literalFields = [], literalOnly = false }: SearchOptions) {
  const text = query.trim().slice(0, 100);
  const phrase = escapeRegex(text);
  const words = [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])];
  const tokens = !literalOnly && words.length <= 8 ? words : [];
  const closestFields = [primary, ...fields, ...arrays];
  const allFields = [...closestFields, ...wordFields, ...literalFields];
  const matchesAny = (regex: string, extraFields = literalFields) => ({ $or: [
    ...[primary, ...fields, ...wordFields, ...extraFields].map(field => matchesText(`$${field}`, regex)),
    ...arrays.map(field => ({ $anyElementTrue: [{ $map: {
      input: { $cond: [{ $isArray: `$${field}` }, `$${field}`, []] }, as: 'item', in: matchesText('$$item', regex),
    } }] })),
  ] });

  const filter: { $or: Array<Record<string, unknown>> } = { $or: fieldsMatch(allFields, phrase) };
  if (tokens.length) {
    filter.$or.push({ $and: tokens.map(token => ({ $or: [
      ...fieldsMatch([...closestFields, ...wordFields], escapeRegex(token)),
      ...fieldsMatch(closestFields, closeWord(token)),
    ] })) });
  }
  const score = { $switch: { branches: [
    { case: matchesText(`$${primary}`, `^${phrase}$`), then: 400 },
    { case: matchesAny(`^${phrase}$`), then: 390 },
    { case: matchesText(`$${primary}`, `^${phrase}`), then: 300 },
    { case: matchesText(`$${primary}`, phrase), then: 200 },
    { case: matchesAny(phrase), then: 100 },
  ], default: { $add: [0, ...tokens.map(token => ({ $cond: [matchesAny(escapeRegex(token), []), 1, 0] }))] } } };

  return { filter, score };
}
