// แปลงข้อความ OCR (markdown จาก typhoon-ocr) → บรรทัดอ่านง่ายสำหรับ user
// และ clipboard helper — pure function ไม่พึ่ง React

export type OcrDisplayLine = { kind: 'heading' | 'bullet' | 'text' | 'blank'; text: string };

export function stripInlineMarkdown(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

// OCR จาก typhoon-ocr กลับมาเป็น markdown — แปลงเป็นบรรทัดอ่านง่ายสำหรับ user โดยไม่แตะข้อมูลดิบใน rawData
export function ocrDisplayLines(text: string): OcrDisplayLine[] {
  const out: OcrDisplayLine[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      out.push({ kind: 'blank', text: '' });
      continue;
    }
    if (line.includes('|') && line.includes('-') && /^[|\s:-]+$/.test(line)) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      out.push({ kind: 'heading', text: stripInlineMarkdown(heading[1]) });
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      out.push({ kind: 'bullet', text: stripInlineMarkdown(bullet[1]) });
      continue;
    }
    if (line.includes('|')) {
      const cells = line
        .split('|')
        .map((cell) => stripInlineMarkdown(cell))
        .filter(Boolean);
      out.push({ kind: 'text', text: cells.join('  ·  ') });
      continue;
    }
    out.push({ kind: 'text', text: stripInlineMarkdown(line) });
  }
  return out.filter(
    (line, index, all) => line.kind !== 'blank' || all[index - 1]?.kind !== 'blank',
  );
}

export function ocrPlainText(text: string) {
  return ocrDisplayLines(text)
    .map((line) => (line.kind === 'bullet' ? `• ${line.text}` : line.text))
    .join('\n')
    .trim();
}

export async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API ใช้ไม่ได้บน http ที่ไม่ใช่ localhost / document ไม่มี focus — fallback เป็น execCommand
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      scratch.remove();
    }
  }
}
