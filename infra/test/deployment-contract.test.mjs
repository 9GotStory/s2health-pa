// G-03 source-only checks. No Podman, systemd, registry, database or network calls.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFile(join(root, path), "utf8");
const renderPath = join(root, "infra/render-quadlets.mjs");
const digest = "a".repeat(64);
const api = "ghcr.io/9gotstory/s2health-pa-api@sha256:" + digest;
const db = "docker.io/library/postgres@sha256:" + digest;
const renderedExpected = [
  "pa-dashboard-api.container",
  "pa-dashboard-app.network",
  "pa-dashboard-db-data.volume",
  "pa-dashboard-db.container",
  "pa-dashboard-migrate.container",
  "pa-dashboard-reference.container",
  "pa-dashboard-sync.container",
].sort();

function render(output, apiImage=api, dbImage=db, extra=[]) {
  return spawnSync(
    process.execPath,
    [renderPath, "--output", output, "--api-image", apiImage, "--db-image", dbImage, ...extra],
    { cwd: root, encoding: "utf8", timeout: 15000 },
  );
}

test("API Containerfile builds imported Backend-v2 without frontend", async () => {
  const source = await read("infra/containers/api.Containerfile");
  assert.match(source, /COPY backend\/package\.json backend\/package-lock\.json/);
  assert.match(source, /COPY backend\/src \.\/src/);
  assert.match(source, /COPY --chown=node:node backend\/migrations \.\/migrations/);
  assert.match(source, /RUN npm ci --omit=dev/);
  assert.match(source, /USER node/);
  assert.match(source, /org\.opencontainers\.image\.source="https:\/\/github\.com\/9GotStory\/s2health-pa"/);
  assert.match(source, /SOURCE_REVISION/);
  assert.doesNotMatch(source, /COPY src\/|web\.Containerfile|pa-dashboard-web/);
});

test("Quadlet source has exactly API and database topology with no legacy web unit", async () => {
  const names = (await readdir(join(root, "infra/quadlet"))).sort();
  assert.deepEqual(names, renderedExpected.map(n => n.endsWith(".container") ? n + ".in" : n).sort());
});

test("API keeps loopback binding, private DNS and migration order", async () => {
  const unit = await read("infra/quadlet/pa-dashboard-api.container.in");
  assert.match(unit, /ContainerName=pa-dashboard-api/);
  assert.match(unit, /NetworkAlias=pa-dashboard-api/);
  assert.match(unit, /PublishPort=127\.0\.0\.1:13001:3001/);
  assert.match(unit, /Requires=pa-dashboard-migrate\.service/);
  assert.match(unit, /Image=@@PA_API_IMAGE@@/);
  assert.doesNotMatch(unit, /Network=edge|PublishPort=0\.0\.0\.0/);
});

test("PostgreSQL retains actual old named volume and PG18 mount", async () => {
  const unit = await read("infra/quadlet/pa-dashboard-db.container.in");
  assert.match(unit, /ContainerName=pa-dashboard-db/);
  assert.match(unit, /Volume=pa-dashboard-db-data\.volume:\/var\/lib\/postgresql/);
  assert.match(unit, /Network=pa-dashboard-app\.network/);
  assert.doesNotMatch(unit, /PublishPort=/);
  assert.match(await read("infra/quadlet/pa-dashboard-db-data.volume"), /\[Volume\]/);
});

test("migration stays checksum-protected one-shot dependency", async () => {
  const unit = await read("infra/quadlet/pa-dashboard-migrate.container.in");
  assert.match(unit, /Exec=node dist\/src\/db\/migrate\.js/);
  assert.match(unit, /RemainAfterExit=yes/);
  assert.match(unit, /Type=oneshot/);
  assert.match(unit, /@@PA_API_IMAGE@@/);
});

test("sync and reference are manual only, not boot-triggered", async () => {
  const ref = await read("infra/quadlet/pa-dashboard-reference.container.in");
  const sync = await read("infra/quadlet/pa-dashboard-sync.container.in");
  for (const unit of [ref, sync]) {
    const activeConfig = unit.split("\n").filter(line => !line.trimStart().startsWith("#")).join("\n");
    assert.match(activeConfig, /Type=oneshot/);
    assert.match(activeConfig, /@@PA_API_IMAGE@@/);
    assert.doesNotMatch(activeConfig, /\[Install\]|WantedBy=|RemainAfterExit=yes/);
  }
  assert.match(ref, /Exec=node dist\/src\/reference\/populate\.js/);
  assert.match(sync, /Exec=node dist\/src\/sync\/run\.js/);
});

test("renderer emits seven compatible units with pinned image digests and no web", async () => {
  const dir = await mkdtemp(join(tmpdir(), "s2health-g03-render-"));
  try {
    const result = render(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual((await readdir(dir)).sort(), renderedExpected);
    const apiUnit = await readFile(join(dir, "pa-dashboard-api.container"), "utf8");
    const dbUnit = await readFile(join(dir, "pa-dashboard-db.container"), "utf8");
    assert.ok(apiUnit.includes("Image=" + api));
    assert.ok(dbUnit.includes("Image=" + db));
    for (const name of renderedExpected.filter(n => n.endsWith(".container"))) {
      const unit = await readFile(join(dir, name), "utf8");
      assert.doesNotMatch(unit, /@@PA_[A-Z_]+@@/);
    }
    assert.ok(!result.stdout.includes("pa-dashboard-web.container"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("renderer rejects mutable tags, incomplete refs and missing image arguments", async () => {
  const cases = [
    ["ghcr.io/9gotstory/s2health-pa-api:latest", db],
    ["ghcr.io/9gotstory/s2health-pa-api@sha256:abc", db],
    [api, "docker.io/library/postgres:18"],
  ];
  for (const [badApi, badDb] of cases) {
    const dir = await mkdtemp(join(tmpdir(), "s2health-g03-bad-"));
    try {
      const result = render(join(dir, "output"), badApi, badDb);
      assert.notEqual(result.status, 0);
      assert.ok(!result.stdout.includes("rendered"));
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
  const noArg = spawnSync(process.execPath, [renderPath, "--output", "/tmp/unused-g03-only"], { encoding: "utf8" });
  assert.notEqual(noArg.status, 0);
});

test("renderer fails closed on nonempty output without overwriting files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "s2health-g03-nonempty-"));
  try {
    await writeFile(join(dir, "marker"), "keep");
    const result = render(dir);
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(join(dir, "marker"), "utf8"), "keep");
    assert.deepEqual(await readdir(dir), ["marker"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("release can only be invoked by explicit OCI tag and current main", async () => {
  const workflow = await read(".github/workflows/oci-release.yml");
  assert.match(workflow, /tags:\s*\n\s*- "oci-\*"/);
  assert.match(workflow, /GITHUB_REF_TYPE/);
  assert.match(workflow, /GITHUB_REF_NAME/);
  assert.match(workflow, /refs\/heads\/main:refs\/remotes\/origin\/main/);
  assert.match(workflow, /main_sha.*GITHUB_SHA/);
  assert.match(workflow, /ghcr\.io\/9gotstory\/s2health-pa-api:sha-/);
  assert.match(workflow, /ghcr\.io\/9gotstory\/s2health-pa-api@/);
  assert.match(workflow, /SOURCE_REVISION=/);
  assert.doesNotMatch(workflow, /workflow_dispatch:|schedule:|pa-dashboard-web|build-web|deploy-pages|docker\/publish-action/);
});

test("CI only builds API OCI image without publishing or production mutation", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  assert.match(workflow, /infra\/test\/deployment-contract\.test\.mjs/);
  assert.match(workflow, /docker build .*infra\/containers\/api\.Containerfile/);
  assert.doesNotMatch(workflow, /docker push|podman system|systemctl|gh auth|ghcr\.io\/9gotstory\/pa-dashboard-web/);
});

test("image build context excludes secrets, outputs and local modules", async () => {
  const ignore = await read(".dockerignore");
  for (const rule of [".git", "**/node_modules", "backend/dist", "**/.env*"]) {
    assert.ok(ignore.split("\n").includes(rule), rule);
  }
});
