// Scan integrity.
//
// The scanner must never report a file as clean because it failed to read
// or parse it. A silently empty read produces zero findings, which the
// ratchet (HARDSTYLE-006) would misread as debt reduction — and a baseline
// generated from it would silently drop real debt.
//
// This is not hypothetical: during Tranche B calibration, two App files that
// iCloud "Optimize Mac Storage" had evicted to dataless placeholders were read
// as empty on the first scan after an OS upgrade and reported zero findings,
// while the same files, once materialized, carry 177 findings between them.

import { statSync } from 'node:fs';

// Built at runtime rather than written as a literal, so this source file can
// never itself contain a raw NUL byte (which would make git treat it as binary).
const NUL = String.fromCharCode(0);

export class ScanIntegrityError extends Error {
  constructor(repoRelativePath, reason) {
    super(`${repoRelativePath}: ${reason}`);
    this.name = 'ScanIntegrityError';
    this.repoRelativePath = repoRelativePath;
    this.reason = reason;
  }
}

/**
 * Verifies that `text` is a complete, genuine read of `absPath`.
 * Throws ScanIntegrityError otherwise.
 */
export function assertCompleteRead(absPath, repoRelativePath, text) {
  const expectedBytes = statSync(absPath).size;
  const actualBytes = Buffer.byteLength(text, 'utf8');
  if (actualBytes !== expectedBytes) {
    throw new ScanIntegrityError(
      repoRelativePath,
      `read ${actualBytes} bytes but the file is ${expectedBytes} bytes (incomplete or placeholder read)`,
    );
  }
  if (expectedBytes > 0 && text.trim() === '') {
    throw new ScanIntegrityError(repoRelativePath, 'file content is blank despite a non-zero size');
  }
  if (text.includes(NUL)) {
    // Authored source never contains NUL; a zero-filled buffer is the
    // signature of an unmaterialized placeholder.
    throw new ScanIntegrityError(repoRelativePath, 'file content contains NUL bytes (placeholder or binary read)');
  }
}
