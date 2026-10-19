import { BadRequestException } from '@nestjs/common';
import { open, unlink } from 'node:fs/promises';
import { extname } from 'node:path';

/** The most the server will ever accept; the limit Admin sets (default 5 MB) is applied within it. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

interface Kind { mime: string; magic: (b: Buffer) => boolean }
const starts = (b: Buffer, ...bytes: number[]) => bytes.every((v, i) => b[i] === v);

/** Extension -> expected mime + signature. We trust neither the client's mime type nor the file name alone. */
export const ALLOWED: Record<string, Kind> = {
  '.pdf': { mime: 'application/pdf', magic: (b) => starts(b, 0x25, 0x50, 0x44, 0x46) },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: (b) => starts(b, 0x50, 0x4b, 0x03, 0x04) },
  '.doc': { mime: 'application/msword', magic: (b) => starts(b, 0xd0, 0xcf, 0x11, 0xe0) },
  '.png': { mime: 'image/png', magic: (b) => starts(b, 0x89, 0x50, 0x4e, 0x47) },
  '.jpg': { mime: 'image/jpeg', magic: (b) => starts(b, 0xff, 0xd8, 0xff) },
  '.jpeg': { mime: 'image/jpeg', magic: (b) => starts(b, 0xff, 0xd8, 0xff) },
};
export const RESUME_EXTENSIONS = ['.pdf', '.doc', '.docx'];

/** Display-safe file name: no path, no control characters, bounded length. Never used for storage. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().slice(-120);
  return clean || 'file';
}

export function extensionOf(name: string) {
  return extname(name).toLowerCase();
}

/** Checks the real bytes on disk. Deletes the file and throws when it is not what its extension claims. */
export async function verifyStoredFile(path: string, originalName: string, allowed: string[]) {
  const ext = extensionOf(originalName);
  const kind = allowed.includes(ext) ? ALLOWED[ext] : undefined;
  let ok = false;
  if (kind) {
    const fh = await open(path, 'r');
    try {
      const buf = Buffer.alloc(8);
      await fh.read(buf, 0, 8, 0);
      ok = kind.magic(buf);
    } finally {
      await fh.close();
    }
  }
  if (!kind || !ok) {
    await unlink(path).catch(() => undefined);
    throw new BadRequestException({
      message: `Unsupported or corrupted file. Allowed types: ${allowed.join(', ').replace(/\./g, '').toUpperCase()}`,
      code: 'INVALID_FILE',
    });
  }
  return kind.mime;
}
