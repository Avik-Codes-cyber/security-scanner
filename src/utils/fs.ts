import { stat } from "fs/promises";
import { resolve, normalize } from "path";
import { homedir } from "os";
import { FILE_SIZE_LIMITS } from "../constants";

const DEFAULT_MAX_BYTES = FILE_SIZE_LIMITS.MAX_SCAN_BYTES;
const STREAMING_THRESHOLD = FILE_SIZE_LIMITS.STREAMING_THRESHOLD;

/**
 * Detect text encoding from a buffer sample.
 * Returns the detected encoding or 'utf-8' as default.
 */
export function detectEncoding(buffer: Uint8Array): string {
  // Check for BOM (Byte Order Mark)
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return "utf-8"; // UTF-8 BOM
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return "utf-16be"; // UTF-16 BE BOM
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return "utf-16le"; // UTF-16 LE BOM
  }

  // Heuristic detection for common encodings
  let nullBytes = 0;
  let highBytes = 0;
  let validUtf8Sequences = 0;
  let invalidUtf8Sequences = 0;

  for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
    const byte = buffer[i];

    if (byte === 0) {
      nullBytes++;
    }

    if (byte >= 0x80) {
      highBytes++;

      // Check for valid UTF-8 multi-byte sequences
      if ((byte & 0xE0) === 0xC0 && i + 1 < buffer.length) {
        // 2-byte sequence
        if ((buffer[i + 1] & 0xC0) === 0x80) {
          validUtf8Sequences++;
          i++;
        } else {
          invalidUtf8Sequences++;
        }
      } else if ((byte & 0xF0) === 0xE0 && i + 2 < buffer.length) {
        // 3-byte sequence
        if ((buffer[i + 1] & 0xC0) === 0x80 && (buffer[i + 2] & 0xC0) === 0x80) {
          validUtf8Sequences++;
          i += 2;
        } else {
          invalidUtf8Sequences++;
        }
      } else if ((byte & 0xF8) === 0xF0 && i + 3 < buffer.length) {
        // 4-byte sequence
        if ((buffer[i + 1] & 0xC0) === 0x80 && (buffer[i + 2] & 0xC0) === 0x80 && (buffer[i + 3] & 0xC0) === 0x80) {
          validUtf8Sequences++;
          i += 3;
        } else {
          invalidUtf8Sequences++;
        }
      }
    }
  }

  // If we have null bytes, likely binary or UTF-16
  if (nullBytes > 0) {
    return "binary";
  }

  // If we have high bytes but invalid UTF-8, might be Latin-1 or other encoding
  if (highBytes > 0 && invalidUtf8Sequences > validUtf8Sequences) {
    return "latin1"; // ISO-8859-1
  }

  // Default to UTF-8
  return "utf-8";
}

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

/**
 * Sanitize and normalize a file path for security
 * - Removes null bytes
 * - Expands home directory (~)
 * - Normalizes path (resolves .., ., etc.)
 * - Converts to absolute path
 */
export function sanitizePath(path: string): string {
  // Remove null bytes
  let cleaned = path.replace(/\0/g, "");

  // Expand home directory
  if (cleaned.startsWith("~/") || cleaned === "~") {
    cleaned = cleaned.replace(/^~/, homedir());
  }

  // Normalize and resolve to absolute path
  return resolve(normalize(cleaned));
}

export async function readText(path: string, maxBytes = DEFAULT_MAX_BYTES): Promise<string> {
  const file = Bun.file(path);
  const size = file.size;

  // Reject files that are too large
  if (size !== undefined && size > maxBytes) {
    throw new Error(`File too large to read: ${path} (${size} bytes, max ${maxBytes})`);
  }

  // For very large files (but within limit), warn the user
  if (size !== undefined && size > STREAMING_THRESHOLD) {
    console.warn(`⚠️  Reading large file: ${path} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  }

  // Read a sample to detect encoding
  const sampleSize = Math.min(size || 8192, 8192);
  const sample = new Uint8Array(await file.slice(0, sampleSize).arrayBuffer());
  const encoding = detectEncoding(sample);

  // If binary, throw error
  if (encoding === "binary") {
    throw new Error(`File appears to be binary: ${path}`);
  }

  // Read with detected encoding
  try {
    if (encoding === "utf-8") {
      return await file.text();
    } else {
      // For non-UTF-8 encodings, read as buffer and decode
      const buffer = await file.arrayBuffer();
      const decoder = new TextDecoder(encoding, { fatal: false });
      return decoder.decode(buffer);
    }
  } catch (error) {
    // Fallback to UTF-8 with replacement characters
    const buffer = await file.arrayBuffer();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return decoder.decode(buffer);
  }
}

export async function readBytes(path: string, maxBytes = DEFAULT_MAX_BYTES): Promise<Uint8Array> {
  const file = Bun.file(path);
  const size = file.size;

  // Reject files that are too large
  if (size !== undefined && size > maxBytes) {
    throw new Error(`File too large to read: ${path} (${size} bytes, max ${maxBytes})`);
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
