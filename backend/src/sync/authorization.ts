import { constants as fsConstants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import type { SyncConfigSnapshot } from "./config.js";

const MAX_APPROVAL_BYTES = 4096;
const MAX_APPROVAL_DURATION_MS = 31 * 24 * 60 * 60 * 1000;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const APPROVAL_ID = /^[a-zA-Z0-9_-]{8,64}$/;

export class SyncAuthorizationError extends Error {
  override readonly name = "SyncAuthorizationError";
}

export interface SyncTargetApproval {
  readonly schemaVersion: 1;
  readonly approvalId: string;
  readonly runMode: "manual" | "scheduled";
  readonly fiscalYear: number;
  readonly currentQuarter: number;
  readonly provinceCode: string;
  readonly districtAreaPrefix: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export type SyncApprovalProvider =
  (now: Date) => Promise<unknown>;

function refuse(message: string): never {
  throw new SyncAuthorizationError("Sync approval rejected: " + message);
}

function requireObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return refuse("policy must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function parseDate(value: unknown, field: string): number {
  if (typeof value !== "string" || !ISO_UTC.test(value)) {
    return refuse(field + " must be an explicit UTC timestamp");
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    return refuse(field + " is invalid");
  }
  return time;
}

/**
 * Validates the content of an independently provisioned policy under the
 * existing PostgreSQL advisory lock, before any writing Sync run is created.
 *
 * This checks target and expiry; it does NOT by itself prove who issued the
 * JSON. Only the restricted local-file provider is wired by run.ts.
 */
export function assertApprovedSyncTarget(
  input: unknown,
  snapshot: SyncConfigSnapshot,
  districtAreaPrefix: string,
  now: Date,
  runMode: "manual" | "scheduled",
): SyncTargetApproval {
  const obj = requireObject(input);
  const allowed = [
    "schemaVersion", "approvalId", "runMode", "fiscalYear", "currentQuarter",
    "provinceCode", "districtAreaPrefix", "issuedAt", "expiresAt",
  ];
  if (Object.keys(obj).length !== allowed.length ||
      Object.keys(obj).some((k) => !allowed.includes(k))) {
    return refuse("unsupported or missing fields");
  }
  if (obj.schemaVersion !== 1 ||
      typeof obj.approvalId !== "string" ||
      !APPROVAL_ID.test(obj.approvalId)) {
    return refuse("invalid policy version or approval ID");
  }
  if (obj.runMode !== runMode) {
    return refuse("run mode does not match approved purpose");
  }
  if (!Number.isInteger(obj.fiscalYear) ||
      !Number.isInteger(obj.currentQuarter) ||
      typeof obj.provinceCode !== "string" ||
      typeof obj.districtAreaPrefix !== "string") {
    return refuse("invalid fiscal or area types");
  }
  if (!/^\d{2}$/.test(obj.provinceCode) ||
      !/^\d{4}$/.test(obj.districtAreaPrefix)) {
    return refuse("invalid area codes");
  }
  if (!districtAreaPrefix.startsWith(snapshot.provinceCode)) {
    return refuse("configured district does not belong to the configured province");
  }
  if (obj.fiscalYear !== snapshot.fiscalYear ||
      obj.currentQuarter !== snapshot.currentQuarter ||
      obj.provinceCode !== snapshot.provinceCode ||
      obj.districtAreaPrefix !== districtAreaPrefix) {
    return refuse("approved fiscal year, quarter or area does not match configuration");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return refuse("invalid verification clock");
  }
  // A timer must never silently resync a historical year. Manually
  // authorized backfills remain a distinct, explicitly labeled purpose.
  const bangkok = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(bangkok.find((p) => p.type === "year")?.value);
  const month = Number(bangkok.find((p) => p.type === "month")?.value);
  const currentThaiFiscalYear = year + 543 + (month >= 10 ? 1 : 0);
  if (runMode === "scheduled") {
    if (obj.fiscalYear !== currentThaiFiscalYear) {
      return refuse("scheduled runs cannot target a historical or future fiscal year");
    }
    const currentFiscalQuarter =
      month >= 10 ? 1 : month <= 3 ? 2 : month <= 6 ? 3 : 4;
    if (obj.currentQuarter !== currentFiscalQuarter) {
      return refuse("scheduled runs cannot target a past or future fiscal quarter");
    }
  }
  const issued = parseDate(obj.issuedAt, "issuedAt");
  const expires = parseDate(obj.expiresAt, "expiresAt");
  if (issued > now.getTime() || expires <= now.getTime() ||
      expires <= issued || expires - issued > MAX_APPROVAL_DURATION_MS) {
    return refuse("approval is not currently valid or exceeds 31 days");
  }
  return Object.freeze(obj as unknown as SyncTargetApproval);
}

/**
 * Only intended to read a host-provisioned, read-only and separately owned
 * approval file. The Fedora cutover gate MUST independently verify that the
 * host bind-mount and file ownership cannot be rewritten by the worker. A
 * mutable env var or plain JSON is NEVER a cryptographic attestation.
 */
export function createLocalFileSyncApprovalProvider(
  filePath: string | undefined,
): SyncApprovalProvider {
  return async () => {
    if (!filePath || !isAbsolute(filePath)) {
      return refuse("absolute PA_SYNC_APPROVAL_FILE is required");
    }
    if (resolve(filePath) !== filePath) {
      return refuse("noncanonical file path");
    }
    // Reject symlinks and writable parent components, including /tmp.
    let parent = dirname(filePath);
    while (true) {
      const stat = await lstat(parent).catch(() => refuse("unavailable parent directory"));
      const uid = process.getuid?.();
      if (!stat.isDirectory() || stat.isSymbolicLink() ||
          (stat.mode & 0o022) !== 0 ||
          (uid !== undefined && stat.uid === uid && (stat.mode & 0o200) !== 0)) {
        return refuse("untrusted approval parent directory");
      }
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }

    let handle;
    try {
      handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      const stat = await handle.stat();
      const uid = process.getuid?.();
      if (!stat.isFile() || stat.nlink !== 1 ||
          (stat.mode & 0o022) !== 0 ||
          (uid !== undefined && stat.uid === uid) ||
          stat.size <= 0 || stat.size > MAX_APPROVAL_BYTES) {
        return refuse("approval file ownership, permissions or size not trusted");
      }
      const content = await handle.readFile({ encoding: "utf8" });
      let payload: unknown;
      try {
        payload = JSON.parse(content) as unknown;
      } catch {
        return refuse("approval file JSON invalid");
      }
      return payload;
    } catch (error) {
      if (error instanceof SyncAuthorizationError) throw error;
      return refuse("approval file unavailable or unreadable");
    } finally {
      await handle?.close();
    }
  };
}
