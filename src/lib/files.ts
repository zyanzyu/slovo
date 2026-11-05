import Papa from 'papaparse';
import { parseTabularRows, parseVocabularyCsv, parseVocabularyJson, parseVocabularyText, type ParsedEntry } from './parse';

export interface FileImportResult {
  entries: ParsedEntry[];
  rawText: string;
  kind: string;
  sheets?: number;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function readBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'));
    reader.readAsText(file, 'utf-8');
  });
}

function dedupeEntries(entries: ParsedEntry[]): ParsedEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.ru.toLowerCase().replace(/ё/g, 'е').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str;
      text += item.hasEOL ? '\n' : ' ';
    }
    pages.push(text.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, '  '));
  }
  return pages.join('\n');
}

async function extractXlsx(buffer: ArrayBuffer): Promise<{ entries: ParsedEntry[]; text: string; sheets: number }> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const entries: ParsedEntry[] = [];
  const texts: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
    });
    const parsed = parseTabularRows(rows);
    entries.push(...parsed);
    texts.push(
      `# ${name}\n` +
        rows
          .map((row) => row.map((cell) => String(cell ?? '').trim()).join('\t'))
          .join('\n'),
    );
  }
  return { entries: dedupeEntries(entries), text: texts.join('\n\n'), sheets: workbook.SheetNames.length };
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await (mammoth as unknown as {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  }).extractRawText({ arrayBuffer: buffer });
  return result.value;
}

function extractHtml(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  doc.querySelectorAll('script,style').forEach((node) => node.remove());
  return doc.body.innerText || doc.body.textContent || '';
}

export async function extractEntriesFromFile(file: File): Promise<FileImportResult> {
  if (file.size > MAX_FILE_SIZE) throw new Error('文件超过 25 MB，请拆分后再上传');
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (['json'].includes(ext)) {
    const text = await readText(file);
    const entries = parseVocabularyJson(text);
    return { entries: dedupeEntries(entries), rawText: text.slice(0, 20_000), kind: 'JSON' };
  }

  if (['csv', 'tsv'].includes(ext)) {
    const text = await readText(file);
    const entries = parseVocabularyCsv(text);
    return { entries: dedupeEntries(entries), rawText: text, kind: ext.toUpperCase() };
  }

  if (['txt', 'md', 'markdown', 'text'].includes(ext)) {
    const text = await readText(file);
    return { entries: dedupeEntries(parseVocabularyText(text)), rawText: text, kind: '文本' };
  }

  if (ext === 'html' || ext === 'htm') {
    const text = extractHtml(await readText(file));
    return { entries: dedupeEntries(parseVocabularyText(text)), rawText: text, kind: 'HTML' };
  }

  if (['xlsx', 'xls'].includes(ext)) {
    const buffer = await readBuffer(file);
    const result = await extractXlsx(buffer);
    return { entries: result.entries, rawText: result.text, kind: 'Excel', sheets: result.sheets };
  }

  if (ext === 'docx') {
    const text = await extractDocx(await readBuffer(file));
    return { entries: dedupeEntries(parseVocabularyText(text)), rawText: text, kind: 'Word' };
  }

  if (ext === 'pdf') {
    const text = await extractPdf(await readBuffer(file));
    return { entries: dedupeEntries(parseVocabularyText(text)), rawText: text, kind: 'PDF' };
  }

  if (ext === 'doc') {
    throw new Error('旧版 .doc 暂不支持，请另存为 .docx 或 PDF 后再上传');
  }

  if (['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(ext)) {
    throw new Error('图片请使用「拍照」或「照片」入口，以便进行 OCR 识别');
  }

  throw new Error('暂不支持该文件格式，请上传 TXT、CSV、JSON、DOCX、PDF、XLSX 或图片');
}

export function rowsToCsv(rows: Array<{ ru: string; zh: string }>): string {
  return Papa.unparse(rows.map((row) => [row.ru, row.zh]));
}
