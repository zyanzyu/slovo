import Papa from 'papaparse';

export interface ParsedEntry {
  ru: string;
  zh: string;
  transcription?: string;
  source: string;
}

const CYRILLIC = /[А-Яа-яЁё]/;
const CJK = /[\u3400-\u9fff]/;
const HEADER_WORDS =
  /^(слово|слова|слов|перевод|фразы|выражения|лексика|word|words|vocabulary|translation|russian|chinese|俄语|中文|单词|释义|序号|no\.?)$/i;

function clean(value: string): string {
  return value
    .replace(/^[\s"'«»“”„]+|[\s"'«»“”„]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNumbering(line: string): string {
  return line.replace(/^\s*(?:\d{1,4}\s*[.)、．]|[-–—•●·*])\s*/u, '').trim();
}

function splitPair(line: string): [string, string] | null {
  const separators: Array<string | RegExp> = [
    /\t+/,
    /\s*\|\s*/,
    /\s+[—–]\s+/,
    /\s+-\s+/,
    /\s*:\s*/,
    /\s*;\s*/,
    /\s*[，,]\s*/,
  ];

  for (const separator of separators) {
    if (typeof separator === 'string') continue;
    const match = line.match(separator);
    if (match && match.index !== undefined && match.index > 0) {
      const left = clean(line.slice(0, match.index));
      const right = clean(line.slice(match.index + match[0].length));
      if (left && right && CYRILLIC.test(left)) return [left, right];
    }
  }

  const wide = line.match(/^(.+?)\s{2,}(.+)$/);
  if (wide && CYRILLIC.test(wide[1])) return [clean(wide[1]), clean(wide[2])];

  const cjkSplit = line.match(/^(.+?)\s*([\u3400-\u9fff].+)$/);
  if (cjkSplit && CYRILLIC.test(cjkSplit[1])) return [clean(cjkSplit[1]), clean(cjkSplit[2])];

  const latinSplit = line.match(/^([А-Яа-яЁё][А-Яа-яЁё\s'’()-]+?)\s{2,}([A-Za-z].+)$/);
  if (latinSplit) return [clean(latinSplit[1]), clean(latinSplit[2])];

  return null;
}

function cleanRu(value: string): { ru: string; transcription?: string } {
  let ru = clean(value).replace(/[.,;:!?·]+$/g, '').trim();
  let transcription: string | undefined;
  const bracket = ru.match(/\[([^\]]+)\]/);
  if (bracket) {
    transcription = clean(bracket[1]);
    ru = clean(ru.replace(bracket[0], ''));
  }
  const paren = ru.match(/\(([^)]*[А-Яа-яЁё][^)]*)\)/);
  if (!transcription && paren) {
    transcription = clean(paren[1]);
    ru = clean(ru.replace(paren[0], ''));
  }
  ru = ru.replace(/[.,;:!?·]+$/g, '').trim();
  return { ru, transcription };
}

function addIfValid(entries: ParsedEntry[], ruValue: string, zhValue: string, source: string) {
  const { ru, transcription } = cleanRu(ruValue);
  const zh = clean(zhValue);
  if (!ru || !CYRILLIC.test(ru)) return;
  if (HEADER_WORDS.test(ru) || /^(russian|word)$/i.test(zh)) return;
  // Reject obvious page furniture.
  if (/^\d+$/.test(ru) || ru.length > 90) return;
  entries.push({ ru, zh: zh || '', transcription, source });
}

function pairAlternatingLines(lines: string[]): ParsedEntry[] | null {
  if (lines.length < 4 || lines.length % 2 !== 0) return null;
  const entries: ParsedEntry[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    const first = lines[index];
    const second = lines[index + 1];
    if (!CYRILLIC.test(first) || CJK.test(first) || !CJK.test(second)) return null;
    if (CYRILLIC.test(second) && !CJK.test(second)) return null;
    entries.push({ ru: first, zh: second, source: `${first} ${second}` });
  }
  return entries.length ? entries : null;
}

export function parseVocabularyText(input: string): ParsedEntry[] {
  const rawLines = input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^[-=_*]{3,}$/.test(line));

  const lines = rawLines.map(stripNumbering).filter(Boolean);
  if (!lines.length) return [];

  const alternating = pairAlternatingLines(lines);
  if (alternating) return alternating;

  const entries: ParsedEntry[] = [];
  let pendingRussian = '';
  for (const line of lines) {
    if (HEADER_WORDS.test(line)) continue;

    const pair = splitPair(line);
    if (pair) {
      addIfValid(entries, pair[0], pair[1], line);
      pendingRussian = '';
      continue;
    }

    if (CYRILLIC.test(line) && !CJK.test(line)) {
      // A bare Russian line may be followed by its translation on the next line.
      if (pendingRussian && !CJK.test(pendingRussian)) {
        addIfValid(entries, pendingRussian, '', pendingRussian);
      }
      pendingRussian = line;
      continue;
    }

    if (CJK.test(line) && pendingRussian) {
      addIfValid(entries, pendingRussian, line, `${pendingRussian} ${line}`);
      pendingRussian = '';
      continue;
    }

    if (CYRILLIC.test(line)) addIfValid(entries, line, '', line);
  }

  if (pendingRussian) addIfValid(entries, pendingRussian, '', pendingRussian);
  return entries;
}

function valueFromObject(value: unknown): ParsedEntry | null {
  if (typeof value === 'string') {
    const parsed = parseVocabularyText(value);
    return parsed[0] ?? null;
  }
  if (Array.isArray(value)) {
    if (typeof value[0] === 'string' && typeof value[1] === 'string') {
      return { ru: value[0], zh: value[1], source: value.join(' — ') };
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
    return '';
  };
  const ru = pick('ru', 'russian', 'word', 'term', 'слово', 'Русский', '俄语', '单词');
  const zh = pick('zh', 'cn', 'chinese', 'translation', 'meaning', 'перевод', '中文', '释义', '翻译');
  if (!ru) return null;
  return {
    ru,
    zh,
    transcription: pick('transcription', 'transcription_ru', '音标', '重音') || undefined,
    source: `${ru}${zh ? ` — ${zh}` : ''}`,
  };
}

export function parseVocabularyJson(raw: string): ParsedEntry[] {
  const parsed = JSON.parse(raw);
  const source = Array.isArray(parsed) ? parsed : parsed.words ?? parsed.data ?? parsed.items;
  if (!Array.isArray(source)) throw new Error('JSON 中未找到单词数组');
  return source
    .map(valueFromObject)
    .filter((entry): entry is ParsedEntry => Boolean(entry))
    .map((entry) => {
      const { ru, transcription } = cleanRu(entry.ru);
      return { ...entry, ru, transcription: entry.transcription ?? transcription };
    })
    .filter((entry) => CYRILLIC.test(entry.ru));
}

export function parseVocabularyCsv(raw: string): ParsedEntry[] {
  const result = Papa.parse<string[]>(raw.trim(), { skipEmptyLines: true });
  const rows = result.data.filter((row) => Array.isArray(row) && row.some((cell) => String(cell).trim()));
  if (!rows.length) return [];

  const first = rows[0].map((cell) => String(cell).trim().toLowerCase());
  const hasHeader = first.some((cell) =>
    /^(ru|russian|word|слово|俄语|单词|zh|cn|chinese|translation|中文|释义|翻译)$/i.test(cell),
  );

  let ruIndex = 0;
  let zhIndex = 1;
  let transIndex = -1;
  if (hasHeader) {
    const find = (regex: RegExp, fallback: number) => {
      const index = first.findIndex((cell) => regex.test(cell));
      return index >= 0 ? index : fallback;
    };
    ruIndex = find(/^(ru|russian|word|слово|俄语|单词)$/i, 0);
    zhIndex = find(/^(zh|cn|chinese|translation|meaning|中文|释义|翻译)$/i, ruIndex === 0 ? 1 : 0);
    transIndex = first.findIndex((cell) => /^(transcription|音标|重音)$/i.test(cell));
  }

  const body = hasHeader ? rows.slice(1) : rows;
  const entries: ParsedEntry[] = [];
  for (const row of body) {
    const cells = row.map((cell) => clean(String(cell ?? '')));
    if (!cells.length) continue;
    addIfValid(entries, cells[ruIndex] ?? '', cells[zhIndex] ?? '', cells.join(' — '));
    if (transIndex >= 0 && entries.length) {
      const last = entries[entries.length - 1];
      if (!last.transcription && cells[transIndex]) last.transcription = cells[transIndex];
    }
  }
  return entries;
}

export function parseTabularRows(rows: unknown[][]): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  let start = 0;
  if (rows.length) {
    const first = rows[0].map((cell) => String(cell ?? '').trim().toLowerCase());
    if (first.some((cell) => /^(ru|russian|word|слово|俄语|单词|zh|cn|chinese|translation|中文|释义)$/i.test(cell))) {
      start = 1;
    }
  }
  for (let index = start; index < rows.length; index++) {
    const cells = rows[index].map((cell) => String(cell ?? '').trim());
    if (!cells.some(Boolean)) continue;
    let ru = cells.find((cell) => CYRILLIC.test(cell)) ?? cells[0] ?? '';
    let zh = cells.find((cell, i) => i !== cells.indexOf(ru) && (CJK.test(cell) || /[A-Za-z]/.test(cell))) ?? '';
    addIfValid(entries, ru, zh, cells.join(' — '));
  }
  return entries;
}
