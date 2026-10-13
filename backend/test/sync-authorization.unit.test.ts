import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SyncConfigSnapshot } from "../src/sync/config.js";
import {
  assertApprovedSyncTarget,
  createLocalFileSyncApprovalProvider,
  SyncAuthorizationError,
} from "../src/sync/authorization.js";

const now = new Date("2026-10-12T10:00:00.000Z");
const snapshot = {
  fiscalYear: 2569,
  currentQuarter: 4,
  provinceCode: "54",
} as SyncConfigSnapshot;
const valid = Object.freeze({
  schemaVersion: 1,
  approvalId: "approved-unit-fixture",
  runMode: "manual",
  fiscalYear: 2569,
  currentQuarter: 4,
  provinceCode: "54",
  districtAreaPrefix: "5406",
  issuedAt: "2026-10-11T10:00:00.000Z",
  expiresAt: "2026-10-13T10:00:00.000Z",
});

test("T007: matching separately-provisioned policy has strict target/time", () => {
  const result = assertApprovedSyncTarget(valid, snapshot, "5406", now, "manual");
  assert.equal(result.approvalId, valid.approvalId);
  assert.equal(Object.isFrozen(result), true);
});

test("T007: reject invalid, expired, mismatched, overlong and forged policy", async (t) => {
  const cases: ReadonlyArray<[string, unknown]> = [
    ["empty", undefined],
    ["null", null],
    ["array", []],
    ["missing version", { ...valid, schemaVersion: undefined }],
    ["other version", { ...valid, schemaVersion: 2 }],
    ["missing ID", { ...valid, approvalId: "" }],
    ["wrong run mode", { ...valid, runMode: "scheduled" }],
    ["wrong FY", { ...valid, fiscalYear: 2570 }],
    ["wrong quarter", { ...valid, currentQuarter: 1 }],
    ["wrong province", { ...valid, provinceCode: "55" }],
    ["wrong district", { ...valid, districtAreaPrefix: "5499" }],
    ["future issue", { ...valid, issuedAt: "2026-10-14T10:00:00.000Z" }],
    ["expired", { ...valid, expiresAt: "2026-10-11T10:00:00.000Z" }],
    ["zero duration", { ...valid, expiresAt: valid.issuedAt }],
    ["excessive duration", { ...valid, expiresAt: "2026-11-13T10:00:00.000Z" }],
    ["bad calendar", { ...valid, issuedAt: "2026-02-30T10:00:00.000Z" }],
    ["local time", { ...valid, expiresAt: "2026-10-13T17:00:00+07:00" }],
    ["unrecognized extra field", { ...valid, bypass: true }],
    ["malformed quarter", { ...valid, currentQuarter: "4" }],
  ];
  for (const [label, policy] of cases) {
    await t.test(label, () => {
      assert.throws(
        () => assertApprovedSyncTarget(policy, snapshot, "5406", now, "manual"),
        SyncAuthorizationError,
      );
    });
  }
});

test("T007: local provider rejects missing and relative file path", async () => {
  await assert.rejects(createLocalFileSyncApprovalProvider(undefined)(now), SyncAuthorizationError);
  await assert.rejects(createLocalFileSyncApprovalProvider("approval.json")(now), SyncAuthorizationError);
});

test("T007: local provider rejects symlinks, writable parent and worker-owned file", async () => {
  const temp = await mkdtemp(join(tmpdir(), "pa-auth-test-"));
  const file = join(temp, "policy.json");
  const link = join(temp, "alias.json");
  try {
    await writeFile(file, JSON.stringify(valid), { mode: 0o600 });
    await symlink(file, link);
    await assert.rejects(createLocalFileSyncApprovalProvider(file)(now), SyncAuthorizationError);
    await assert.rejects(createLocalFileSyncApprovalProvider(link)(now), SyncAuthorizationError);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("T007: protected file provider does not accept a directory", async () => {
  const temp = await mkdtemp(join(tmpdir(), "pa-auth-test-"));
  const sub = join(temp, "sub");
  try {
    await mkdir(sub);
    await assert.rejects(createLocalFileSyncApprovalProvider(sub)(now), SyncAuthorizationError);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("T007: scheduled run refuses FY2569 after Oct 2026 fiscal rollover", () => {
  assert.throws(
    () => assertApprovedSyncTarget(
      { ...valid, runMode: "scheduled" },
      snapshot,
      "5406",
      now,
      "scheduled",
    ),
    SyncAuthorizationError,
  );
});

test("T007: a manual backfill remains possible only with explicit manual authority", () => {
  const result = assertApprovedSyncTarget(
    valid, snapshot, "5406", now, "manual",
  );
  assert.equal(result.runMode, "manual");
});
