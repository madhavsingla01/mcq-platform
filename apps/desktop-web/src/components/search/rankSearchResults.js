function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let beforePrevious;
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        current[column] = Math.min(current[column], beforePrevious[column - 2] + 1);
      }
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[right.length];
}

function wordScore(token, word) {
  if (word === token) return 40;
  if (word.startsWith(token)) return 30;
  if (word.includes(token)) return 20;
  const tolerance = token.length >= 7 ? 2 : token.length >= 4 || (token.length === 3 && token[0] === word[0]) ? 1 : 0;
  if (!tolerance || Math.abs(word.length - token.length) > tolerance) return 0;
  const distance = editDistance(token, word);
  return distance <= tolerance ? 15 - distance * 4 : 0;
}

export function createSearchScorer(query) {
  const phrase = normalize(query);
  if (!phrase) return () => 1;
  const tokens = [...new Set(phrase.split(' '))];

  return (fields) => {
    const values = fields.flat().map(normalize).filter(Boolean);
    let phraseScore = 0;
    const words = new Set();
    values.forEach((value, index) => {
      const score = value === phrase ? 400 : value.startsWith(phrase) ? 300 : value.includes(phrase) ? 200 : 0;
      phraseScore = Math.max(phraseScore, score && score + (index === 0 ? 10 : 0));
      if (!phraseScore) value.split(' ').forEach(word => words.add(word));
    });
    if (phraseScore) return phraseScore;

    let total = 0;
    for (const token of tokens) {
      let best = 0;
      for (const word of words) {
        best = Math.max(best, wordScore(token, word));
        if (best === 40) break;
      }
      if (!best) return 0;
      total += best;
    }
    return total / tokens.length;
  };
}

export function rankSearchResults(items, query, fieldsFor) {
  if (!normalize(query)) return items;
  const score = createSearchScorer(query);
  return items.map(item => ({ item, rank: score(fieldsFor(item)) }))
    .filter(result => result.rank > 0)
    .sort((left, right) => right.rank - left.rank)
    .map(result => result.item);
}
