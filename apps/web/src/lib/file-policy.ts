export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const PROJECT_FILE_QUOTA = 100 * 1024 * 1024;
const types: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
};
export class FileProblem extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function fileMetadata(name: string) {
  if (!name || name.length > 180 || /[\\/\x00-\x1f\x7f]/.test(name) || name.trim() !== name)
    throw new FileProblem(
      'Use a filename without folders or control characters (maximum 180 characters).',
    );
  const extension = name.split('.').pop()?.toLowerCase() || '';
  const mimeType = types[extension];
  if (!mimeType)
    throw new FileProblem('Choose a PDF, DOCX, XLSX, PPTX, TXT, Markdown or CSV file.');
  return { name, extension, mimeType };
}
export function validateFile(name: string, body: Uint8Array) {
  const metadata = fileMetadata(name);
  if (!body.length) throw new FileProblem('The file is empty.');
  if (body.length > MAX_FILE_BYTES) throw new FileProblem('Files must be 4 MiB or smaller.', 413);
  if (metadata.extension === 'pdf' && Buffer.from(body.subarray(0, 5)).toString() !== '%PDF-')
    throw new FileProblem('This file does not have a PDF signature.');
  if (
    ['docx', 'xlsx', 'pptx'].includes(metadata.extension) &&
    (body[0] !== 0x50 || body[1] !== 0x4b || body[2] !== 3 || body[3] !== 4)
  )
    throw new FileProblem('This file does not have an Office ZIP signature.');
  if (['txt', 'md', 'csv'].includes(metadata.extension)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(body);
    } catch {
      throw new FileProblem('Text files must use UTF-8 encoding.');
    }
    if (body.includes(0)) throw new FileProblem('Text files cannot contain binary content.');
  }
  return metadata;
}
export async function readUpload(request: Request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_FILE_BYTES) throw new FileProblem('Files must be 4 MiB or smaller.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new FileProblem('Choose a file to upload.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_FILE_BYTES) {
      await reader.cancel();
      throw new FileProblem('Files must be 4 MiB or smaller.', 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
