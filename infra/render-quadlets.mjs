#!/usr/bin/env node
// Render installable Quadlet units from the source templates in infra/quadlet.
//
// All .container.in templates carry digest placeholders (@@PA_*_IMAGE@@);
// this script substitutes immutable image references and writes the complete
// generated bundle (containers, network, volume) to an output directory of
// the caller's choice. The output directory must not exist yet or must be
// empty — rendering fails closed on any pre-existing entry so a stale file
// can never ride along into an installed bundle. It never installs anything:
// no systemctl, no podman, no writes to ~/.config/containers/systemd.

import {
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  homedir,
} from "node:os";

import {
  resolve,
} from "node:path";

import {
  fileURLToPath,
} from "node:url";

const QUADLET_SOURCE_DIRECTORY = resolve(
  fileURLToPath(
    new URL(
      "quadlet",
      import.meta.url,
    ),
  ),
);

// Immutable image reference: registry/repository path (no whitespace, no tag)
// followed by an exact sha256 digest of 64 lowercase hex characters.
const IMAGE_REFERENCE_PATTERN =
  /^[^\s@]+@sha256:[0-9a-f]{64}$/;

const PLACEHOLDER_PATTERN =
  /@@PA_[A-Z_]+@@/;

const IMAGE_ARGUMENTS = [
  {
    flag: "--api-image",
    placeholder: "@@PA_API_IMAGE@@",
    value: undefined,
  },
  {
    flag: "--db-image",
    placeholder: "@@PA_DB_IMAGE@@",
    value: undefined,
  },
];

const FORBIDDEN_OUTPUT_DIRECTORIES = [
  resolve(
    homedir(),
    ".config/containers/systemd",
  ),
];

function fail(
  message,
) {
  console.error(
    `render-quadlets: ${message}`,
  );

  process.exit(1);
}

function parseArguments(
  argv,
) {
  const output = {
    "--output": undefined,
  };

  for (const argument of IMAGE_ARGUMENTS) {
    output[argument.flag] =
      undefined;
  }

  let index = 0;

  while (
    index < argv.length
  ) {
    const flag =
      argv[index];

    const known =
      flag === "--output" ||
      IMAGE_ARGUMENTS.some(
        (candidate) =>
          candidate.flag ===
          flag,
      );

    if (
      !known ||
      output[flag] !==
        undefined
    ) {
      fail(
        `unknown or duplicate argument: ${flag}`,
      );
    }

    const value =
      argv[index + 1];

    if (
      value === undefined ||
      value.startsWith("--")
    ) {
      fail(
        `missing value for ${flag}`,
      );
    }

    output[flag] = value;

    index += 2;
  }

  for (const flag of Object.keys(
    output,
  )) {
    if (
      output[flag] ===
      undefined
    ) {
      fail(
        `required argument missing: ${flag}`,
      );
    }
  }

  return output;
}

function validateImageReference(
  flag,
  value,
) {
  if (
    !IMAGE_REFERENCE_PATTERN.test(
      value,
    )
  ) {
    fail(
      `${flag} must be an immutable image reference of the form ` +
        `registry/repository@sha256:<64 lowercase hex characters>; ` +
        `received: ${value}`,
    );
  }
}

// Fail-closed output precondition, checked before any generated artifact is
// written: the target must not exist yet, or must be an empty directory. Any
// existing entry (file, directory, symlink, hidden file) is rejected without
// deleting or overwriting anything.
async function assertOutputDirectoryEmpty(
  outputDirectory,
) {
  let entries;

  try {
    entries =
      await readdir(
        outputDirectory,
      );
  } catch (error) {
    if (
      error?.code ===
      "ENOENT"
    ) {
      // The directory does not exist yet and will be created.
      return;
    }

    fail(
      `output path exists but is not a readable directory: ${outputDirectory}`,
    );
  }

  if (
    entries.length > 0
  ) {
    fail(
      `output directory is not empty (${entries.length} existing ` +
        `entries); refusing to render into a directory that already ` +
        `holds files — use a fresh or empty directory so stale files ` +
        `cannot contaminate the generated bundle: ${outputDirectory}`,
    );
  }
}

async function renderQuadletBundle(
  substitutions,
  outputDirectory,
) {
  const entries =
    await readdir(
      QUADLET_SOURCE_DIRECTORY,
      {
        withFileTypes: true,
      },
    );

  const files =
    entries
      .filter(
        (entry) =>
          entry.isFile(),
      )
      .map(
        (entry) =>
          entry.name,
      );

  const templates =
    files.filter(
      (name) =>
        name.endsWith(
          ".container.in",
        ),
    );

  const staticFiles =
    files.filter(
      (name) =>
        name.endsWith(
          ".network",
        ) ||
        name.endsWith(
          ".volume",
        ),
    );

  if (
    templates.length === 0
  ) {
    fail(
      `no .container.in templates found in ${QUADLET_SOURCE_DIRECTORY}`,
    );
  }

  await mkdir(
    outputDirectory,
    {
      recursive: true,
    },
  );

  const written = [];

  for (const name of templates) {
    const source =
      await readFile(
        resolve(
          QUADLET_SOURCE_DIRECTORY,
          name,
        ),
        "utf8",
      );

    let rendered = source;

    for (const substitution of substitutions) {
      rendered =
        rendered.replaceAll(
          substitution.placeholder,
          substitution.value,
        );
    }

    if (
      PLACEHOLDER_PATTERN.test(
        rendered,
      )
    ) {
      fail(
        `unresolved image placeholder remains in ${name}`,
      );
    }

    const target =
      name.replace(
        /\.in$/,
        "",
      );

    await writeFile(
      resolve(
        outputDirectory,
        target,
      ),
      rendered,
    );

    written.push(
      target,
    );
  }

  for (const name of staticFiles) {
    const source =
      await readFile(
        resolve(
          QUADLET_SOURCE_DIRECTORY,
          name,
        ),
        "utf8",
      );

    await writeFile(
      resolve(
        outputDirectory,
        name,
      ),
      source,
    );

    written.push(
      name,
    );
  }

  return written;
}

const arguments_ =
  parseArguments(
    process.argv.slice(2),
  );

for (const argument of IMAGE_ARGUMENTS) {
  argument.value =
    arguments_[
      argument.flag
    ];

  validateImageReference(
    argument.flag,
    argument.value,
  );
}

const outputDirectory =
  resolve(
    arguments_[
      "--output"
    ],
  );

if (
  FORBIDDEN_OUTPUT_DIRECTORIES.includes(
    outputDirectory,
  )
) {
  fail(
    "refusing to write directly to ~/.config/containers/systemd; " +
      "render to a staging directory and review before installing",
  );
}

await assertOutputDirectoryEmpty(
  outputDirectory,
);

renderQuadletBundle(
  IMAGE_ARGUMENTS.map(
    (argument) => ({
      placeholder:
        argument.placeholder,
      value:
        argument.value,
    }),
  ),
  outputDirectory,
)
  .then((written) => {
    console.log(
      `rendered ${written.length} files to ${outputDirectory}:`,
    );

    for (const name of written) {
      console.log(
        `  ${name}`,
      );
    }
  })
  .catch(
    (error) => {
      fail(
        error instanceof Error
          ? error.message
          : "unknown rendering failure",
      );
    },
  );
