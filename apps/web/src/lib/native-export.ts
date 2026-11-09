import * as Y from 'yjs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import {
  calculateCell,
  columnName,
  sheetDimension,
  SHEET_MAX_COLUMNS,
  SHEET_MAX_ROWS,
} from '@flowstate/contracts';
export const nativeMime: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
function textRuns(node: Y.XmlElement | Y.XmlText): TextRun[] {
  if (node instanceof Y.XmlText)
    return node
      .toDelta()
      .filter((delta: { insert: unknown }) => typeof delta.insert === 'string')
      .map(
        (delta: { insert: string; attributes?: Record<string, unknown> }) =>
          new TextRun({
            text: delta.insert as string,
            bold: Boolean(delta.attributes?.bold),
            italics: Boolean(delta.attributes?.italic),
            strike: Boolean(delta.attributes?.strike),
            underline: delta.attributes?.underline ? {} : undefined,
          }),
      );
  return node
    .toArray()
    .flatMap((child) =>
      child instanceof Y.XmlText || child instanceof Y.XmlElement ? textRuns(child) : [],
    );
}
function wordParagraphs(fragment: Y.XmlFragment): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  function walk(node: Y.XmlElement | Y.XmlText, bullet = false, quote = false) {
    if (
      node instanceof Y.XmlElement &&
      ['bulletList', 'orderedList', 'listItem', 'blockquote'].includes(node.nodeName)
    ) {
      node.toArray().forEach((child) => {
        if (child instanceof Y.XmlElement || child instanceof Y.XmlText)
          walk(
            child,
            bullet || ['bulletList', 'orderedList'].includes(node.nodeName),
            quote || node.nodeName === 'blockquote',
          );
      });
      return;
    }
    const level = node instanceof Y.XmlElement ? Number(node.getAttribute('level')) : 0;
    const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
    paragraphs.push(
      new Paragraph({
        children: textRuns(node),
        ...(node instanceof Y.XmlElement && node.nodeName === 'heading'
          ? { heading: headings[Math.min(2, Math.max(0, level - 1))] }
          : {}),
        ...(bullet ? { bullet: { level: 0 } } : {}),
        ...(quote ? { indent: { left: 500 } } : {}),
        spacing: { after: 180 },
      }),
    );
  }
  fragment.toArray().forEach((node) => {
    if (node instanceof Y.XmlElement || node instanceof Y.XmlText) walk(node);
  });
  return paragraphs.length ? paragraphs : [new Paragraph('')];
}
export async function exportNativeDocument(
  kind: string,
  title: string,
  state: Uint8Array | null,
  format: string,
) {
  const document = new Y.Doc();
  try {
    if (state) Y.applyUpdate(document, state);
    if (format === 'docx' && ['richtext', 'word', 'pdf'].includes(kind)) {
      const word = new Document({
        creator: 'FLOWSTATE',
        title,
        sections: [
          {
            children: [
              new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
              ...wordParagraphs(document.getXmlFragment('default')),
            ],
          },
        ],
      });
      return await Packer.toBuffer(word);
    }
    const studio = document.getMap<string>('studio');
    if (format === 'xlsx' && kind === 'sheet') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'FLOWSTATE';
      workbook.calcProperties.fullCalcOnLoad = true;
      const sheet = workbook.addWorksheet('Sheet 1');
      const rows = sheetDimension(studio.get('sheet:rows'), 20, SHEET_MAX_ROWS),
        columns = sheetDimension(studio.get('sheet:columns'), 8, SHEET_MAX_COLUMNS);
      const cells: Record<string, string> = {};
      for (const [key, value] of studio.entries())
        if (/^[A-Z]\d+$/.test(key) && typeof value === 'string') cells[key] = value.slice(0, 500);
      for (let c = 0; c < columns; c++) sheet.getColumn(c + 1).width = 20;
      for (let r = 1; r <= rows; r++)
        for (let c = 0; c < columns; c++) {
          const key = `${columnName(c)}${r}`,
            raw = cells[key] || '',
            cell = sheet.getCell(r, c + 1);
          if (raw.startsWith('=')) {
            const result = calculateCell(cells, key);
            if (typeof result === 'number') cell.value = { formula: raw.slice(1), result };
            else cell.value = String(result);
          } else cell.value = raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
          cell.font = { name: 'Calibri', size: 11 };
          cell.alignment = { vertical: 'top', wrapText: true };
        }
      return Buffer.from(await workbook.xlsx.writeBuffer());
    }
    if (format === 'pptx' && kind === 'slides') {
      const deck = new PptxGenJS();
      deck.layout = 'LAYOUT_WIDE';
      deck.author = 'FLOWSTATE';
      deck.subject = title;
      deck.title = title;
      deck.company = 'FLOWSTATE';
      const ids = document
        .getArray<string>('slides')
        .toArray()
        .filter((id) => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id))
        .slice(0, 30);
      for (const [index, id] of ids.entries()) {
        const slide = deck.addSlide();
        slide.background = { color: 'F7F5F0' };
        const heading = studio.get(`${id}:title`),
          body = studio.get(`${id}:body`);
        slide.addShape(deck.ShapeType.rect, {
          x: 0.6,
          y: 0.7,
          w: 0.6,
          h: 0.06,
          fill: { color: '2B44C7' },
          line: { color: '2B44C7' },
        });
        slide.addText(typeof heading === 'string' ? heading.slice(0, 150) : 'Untitled slide', {
          x: 0.65,
          y: 1.1,
          w: 12,
          h: 1.3,
          fontFace: 'Aptos Display',
          fontSize: 34,
          bold: true,
          color: '1B1B18',
          breakLine: false,
          fit: 'shrink',
        });
        slide.addText(typeof body === 'string' ? body.slice(0, 4000) : '', {
          x: 0.65,
          y: 2.65,
          w: 11.8,
          h: 3.8,
          fontFace: 'Aptos',
          fontSize: 22,
          color: '55524A',
          valign: 'top',
          breakLine: false,
          fit: 'shrink',
        });
        slide.addText(String(index + 1), {
          x: 11.8,
          y: 6.9,
          w: 0.6,
          h: 0.2,
          fontSize: 11,
          color: '6B675D',
          align: 'right',
        });
      }
      if (!ids.length) deck.addSlide();
      const output = await deck.write({ outputType: 'nodebuffer' });
      if (typeof output === 'string' || output instanceof Blob)
        throw new Error('Unexpected presentation output.');
      return Buffer.from(output as Uint8Array);
    }
    throw new Error('Choose an export format supported by this document.');
  } finally {
    document.destroy();
  }
}
