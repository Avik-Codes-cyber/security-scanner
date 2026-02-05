import { stat } from "fs/promises";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

export async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export function sanitizePath(path: string): string {
  return path.replace(/\0/g, "");
}

export async function readText(path: string, maxBytes = DEFAULT_MAX_BYTES): Promise<string> {
  const file = Bun.file(path);
  const size = file.size;
  if (size !== undefined && size > maxBytes) {
    throw new Error(`File too large to read: ${path}`);
  }
  return await file.text();
}

export async function readBytes(path: string, maxBytes = DEFAULT_MAX_BYTES): Promise<Uint8Array> {
  const file = Bun.file(path);
  const size = file.size;
  if (size !== undefined && size > maxBytes) {
    throw new Error(`File too large to read: ${path}`);
  }
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export function isProbablyBinary(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let suspicious = 0;
  const sampleSize = Math.min(bytes.length, 512);

  for (let i = 0; i < sampleSize; i++) {
    const b = bytes[i];
    if (b === 0) return true; // Null byte
    if (b < 9 || (b > 13 && b < 32) || b === 127) {
      suspicious++;
    }
  }

  return suspicious / sampleSize > 0.2;
}

export function isInSkippedDir(path: string, skipDirs: string[]): boolean {
  const parts = path.split(/[\\/]/g);
  return parts.some((part) => skipDirs.includes(part));
}
