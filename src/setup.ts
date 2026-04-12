import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import {
  type Config,
  getConfig,
  getDbPath,
  getReplicaPath,
  updateConfig,
} from "./db";

const TURSO_DB_NAME = "shelf";

function exec(
  cmd: string,
  args: string[],
): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return { ok: true, stdout, stderr: "" };
  } catch (err: any) {
    return {
      ok: false,
      stdout: (err.stdout || "").trim(),
      stderr: (err.stderr || "").trim(),
    };
  }
}

function execShell(cmd: string): {
  ok: boolean;
  stdout: string;
  stderr: string;
} {
  try {
    const stdout = execFileSync("sh", ["-c", cmd], {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return { ok: true, stdout, stderr: "" };
  } catch (err: any) {
    return {
      ok: false,
      stdout: (err.stdout || "").trim(),
      stderr: (err.stderr || "").trim(),
    };
  }
}

function handleCancel(value: unknown): value is symbol {
  if (isCancel(value)) {
    cancel("Setup cancelled.");
    process.exit(0);
  }
  return false;
}

async function testTursoConnection(
  url: string,
  authToken: string,
): Promise<boolean> {
  try {
    const { createClient } = await import("@libsql/client");
    const client = createClient({ url, authToken });
    await client.execute("SELECT 1");
    client.close();
    return true;
  } catch {
    return false;
  }
}

function isTursoCLIInstalled(): boolean {
  return exec("turso", ["--version"]).ok;
}

function isTursoAuthenticated(): boolean {
  const result = exec("turso", ["auth", "whoami"]);
  return result.ok && !result.stderr.includes("not logged in");
}

function tursoDbExists(name: string): boolean {
  const result = exec("turso", ["db", "show", name, "--url"]);
  return result.ok && result.stdout.startsWith("libsql://");
}

export async function runSetup() {
  const config = getConfig();

  intro("ril setup");

  if (config.backend) {
    log.info(`Current backend: ${config.backend}`);
  }

  const backend = await select({
    message: "Where should your data live?",
    options: [
      {
        value: "local",
        label: "Local SQLite",
        hint: `data stays on this machine at ${getDbPath()}`,
      },
      {
        value: "turso",
        label: "Turso Cloud",
        hint: "synced across devices, works offline",
      },
    ],
  });
  if (handleCancel(backend)) return;

  if (backend === "turso") {
    await setupTurso(config);
  } else {
    await setupLocal(config);
  }
}

async function setupLocal(config: Config) {
  const wasOnTurso = config.backend === "turso";
  updateConfig({ backend: "local" });

  log.success(`Backend set to local\nDatabase: ${getDbPath()}`);

  if (wasOnTurso) {
    log.info(
      "Your Turso credentials are still saved. Run `ril setup` to switch back.",
    );

    const migrate = await confirm({
      message: "Migrate data from Turso to local?",
    });
    if (handleCancel(migrate)) return;

    if (migrate) {
      const s = spinner();
      s.start("Migrating data...");
      const { migrateTursoToLocal } = await import("./migrate");
      await migrateTursoToLocal();
      s.stop("Data migrated!");
    }
  }

  outro("Setup complete!");
}

async function setupTurso(config: Config) {
  const envUrl = process.env.TURSO_DATABASE_URL;
  const envToken = process.env.TURSO_AUTH_TOKEN;

  if (envUrl && envToken) {
    log.info(`Found credentials in environment variables.\nURL: ${envUrl}`);

    const useEnv = await confirm({ message: "Use these credentials?" });
    if (handleCancel(useEnv)) return;

    if (useEnv) {
      await finalizeTurso(envUrl, envToken, config);
      return;
    }
  }

  if (config.turso?.url && config.turso?.authToken) {
    log.info(`Existing config found: ${config.turso.url}`);

    const reuse = await confirm({ message: "Use existing credentials?" });
    if (handleCancel(reuse)) return;

    if (reuse) {
      await finalizeTurso(config.turso.url, config.turso.authToken, config);
      return;
    }
  }

  const method = await select({
    message: "How do you want to set up Turso?",
    options: [
      {
        value: "auto",
        label: "Automatic",
        hint: "install CLI, authenticate, create database",
      },
      {
        value: "manual",
        label: "Manual",
        hint: "paste URL and token yourself",
      },
    ],
  });
  if (handleCancel(method)) return;

  if (method === "manual") {
    await manualTursoSetup(config);
    return;
  }

  await autoTursoSetup(config);
}

async function autoTursoSetup(config: Config) {
  const s = spinner();

  if (isTursoCLIInstalled()) {
    log.success("Turso CLI already installed");
  } else {
    s.start("Installing Turso CLI...");
    const install = execShell(
      "curl -sSfL https://get.tur.so/install.sh | bash",
    );
    if (!install.ok) {
      s.stop("Failed to install Turso CLI");
      log.warn("Falling back to manual setup.");

      note(
        [
          "Install manually:",
          "  curl -sSfL https://get.tur.so/install.sh | bash",
          "",
          "Or on macOS:",
          "  brew install tursodatabase/tap/turso",
        ].join("\n"),
        "Manual install",
      );

      await manualTursoSetup(config);
      return;
    }
    s.stop("Turso CLI installed!");
  }

  if (isTursoAuthenticated()) {
    const whoami = exec("turso", ["auth", "whoami"]);
    log.success(`Authenticated as ${whoami.stdout}`);
  } else {
    const authAction = await select({
      message: "Do you have a Turso account?",
      options: [
        { value: "signup", label: "Sign up", hint: "opens browser" },
        { value: "login", label: "Log in", hint: "opens browser" },
      ],
    });
    if (handleCancel(authAction)) return;

    log.info("Opening browser for authentication...");
    const authArgs =
      authAction === "signup" ? ["auth", "signup"] : ["auth", "login"];
    const auth = exec("turso", authArgs);
    if (!auth.ok) {
      log.error(`Authentication failed: ${auth.stderr}`);
      log.warn("Falling back to manual setup.");
      await manualTursoSetup(config);
      return;
    }
    log.success("Authenticated!");
  }

  s.start("Setting up database...");

  let dbUrl: string;

  if (tursoDbExists(TURSO_DB_NAME)) {
    const urlResult = exec("turso", ["db", "show", TURSO_DB_NAME, "--url"]);
    dbUrl = urlResult.stdout;
    s.stop(`Using existing database: ${dbUrl}`);
  } else {
    const create = exec("turso", ["db", "create", TURSO_DB_NAME]);
    if (!create.ok) {
      s.stop("Failed to create database");
      log.error(create.stderr);
      log.warn("Falling back to manual setup.");
      await manualTursoSetup(config);
      return;
    }
    const urlResult = exec("turso", ["db", "show", TURSO_DB_NAME, "--url"]);
    dbUrl = urlResult.stdout;
    s.stop(`Database created: ${dbUrl}`);
  }

  s.start("Generating auth token...");
  const tokenResult = exec("turso", ["db", "tokens", "create", TURSO_DB_NAME]);
  if (!tokenResult.ok) {
    s.stop("Failed to generate token");
    log.error(tokenResult.stderr);
    log.warn("Falling back to manual setup.");
    await manualTursoSetup(config);
    return;
  }
  const authToken = tokenResult.stdout;
  s.stop("Auth token generated!");

  await finalizeTurso(dbUrl, authToken, config);
}

async function manualTursoSetup(config: Config) {
  note(
    [
      "1. Install the Turso CLI:",
      "   curl -sSfL https://get.tur.so/install.sh | bash",
      "",
      "2. Sign up or log in:",
      "   turso auth signup",
      "",
      `3. Create a database:`,
      `   turso db create ${TURSO_DB_NAME}`,
      "",
      "4. Get your database URL:",
      `   turso db show ${TURSO_DB_NAME} --url`,
      "",
      "5. Create an auth token:",
      `   turso db tokens create ${TURSO_DB_NAME}`,
    ].join("\n"),
    "Turso setup instructions",
  );

  const url = await text({
    message: "Turso database URL",
    placeholder: `libsql://${TURSO_DB_NAME}-username.turso.io`,
    validate: (value) => {
      if (!value) return "URL is required";
      if (!value.startsWith("libsql://"))
        return "URL must start with libsql://";
    },
  });
  if (handleCancel(url)) return;

  const authToken = await text({
    message: "Turso auth token",
    placeholder: "eyJ...",
    validate: (value) => {
      if (!value) return "Auth token is required";
    },
  });
  if (handleCancel(authToken)) return;

  await finalizeTurso(url as string, authToken as string, config);
}

async function finalizeTurso(url: string, authToken: string, config: Config) {
  const s = spinner();

  s.start("Testing connection...");
  const ok = await testTursoConnection(url, authToken);
  if (!ok) {
    s.stop("Connection failed");

    const retry = await confirm({
      message: "Try again with different credentials?",
    });
    if (handleCancel(retry)) return;

    if (retry) {
      await manualTursoSetup(config);
      return;
    }
    cancel("Setup aborted.");
    return;
  }
  s.stop("Connected!");

  const wasLocal = config.backend !== "turso";

  updateConfig({
    backend: "turso",
    turso: { url, authToken },
  });

  log.success(
    [
      "Backend set to turso (embedded replica)",
      `Remote: ${url}`,
      `Local replica: ${getReplicaPath()}`,
    ].join("\n"),
  );

  if (wasLocal) {
    const hasLocalData = getDbPath() !== ":memory:" && existsSync(getDbPath());

    if (hasLocalData) {
      const migrate = await confirm({
        message: "Migrate existing local data to Turso?",
      });
      if (handleCancel(migrate)) return;

      if (migrate) {
        s.start("Migrating data...");
        const { migrateLocalToTurso } = await import("./migrate");
        await migrateLocalToTurso();
        s.stop("Data migrated!");
      }
    }
  }

  outro("Setup complete!");
}
