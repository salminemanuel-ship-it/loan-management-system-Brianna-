import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { pool } from "./db";

interface BootstrapAdmin {
  username: string;
  fullName: string;
  password: string;
}

function getBootstrapAdmin(): BootstrapAdmin | null {
  const rawUsername = process.env.BML_BOOTSTRAP_ADMIN_USERNAME;
  const rawFullName = process.env.BML_BOOTSTRAP_ADMIN_NAME;
  const password = process.env.BML_BOOTSTRAP_ADMIN_PASSWORD;
  const anyConfigured = rawUsername !== undefined || rawFullName !== undefined || password !== undefined;

  if (!anyConfigured) return null;

  const username = rawUsername?.trim().toLowerCase();
  const fullName = rawFullName?.trim();
  if (!username || !fullName || !password || password.length < 12) {
    throw new Error("Set BML_BOOTSTRAP_ADMIN_USERNAME, BML_BOOTSTRAP_ADMIN_NAME and BML_BOOTSTRAP_ADMIN_PASSWORD together. The password must be at least 12 characters.");
  }

  return { username, fullName, password };
}

async function assertSchemaOwnership(client: import("pg").PoolClient): Promise<void> {
  const result = await client.query<{ object_name: string; owner: string }>(`
    SELECT object_name, owner
    FROM (
      SELECT format('%I.%I', n.nspname, c.relname) AS object_name,
             pg_get_userbyid(c.relowner) AS owner
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
      UNION ALL
      SELECT format('%I.%I()', n.nspname, p.proname) AS object_name,
             pg_get_userbyid(p.proowner) AS owner
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('audit_log_readonly', 'loan_decision_records_readonly')
    ) AS app_objects
    WHERE owner <> current_user
    ORDER BY object_name
  `);

  if (result.rowCount) {
    const owners = result.rows.map(({ object_name, owner }) => `${object_name} (owner: ${owner})`).join(", ");
    throw new Error(`Database setup stopped before applying schema changes. Connect as the owner of the BML public schema objects or transfer these app objects to the DATABASE_URL role (${owners}).`);
  }

  const schemaCreate = await client.query<{ allowed: boolean }>(
    "SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS allowed"
  );
  if (!schemaCreate.rows[0]?.allowed) {
    throw new Error("Database setup stopped before applying schema changes. The DATABASE_URL role needs CREATE permission on the public schema.");
  }
}

async function main() {
  // Validate operator input before opening a transaction or changing the schema.
  const bootstrapAdmin = getBootstrapAdmin();
  // Resolve from this file so the setup script does not depend on the shell's cwd.
  const schema = fs.readFileSync(path.resolve(__dirname, "../sql/schema.sql"), "utf8");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await assertSchemaOwnership(client);
    await client.query(schema);

    if (bootstrapAdmin) {
      const passwordHash = await bcrypt.hash(bootstrapAdmin.password, 12);
      const inserted = await client.query(
        `INSERT INTO users (username, full_name, password_hash, role)
         VALUES ($1, $2, $3, 'admin') ON CONFLICT (username) DO NOTHING
         RETURNING username`,
        [bootstrapAdmin.username, bootstrapAdmin.fullName, passwordHash]
      );

      if (inserted.rowCount) {
        console.log(`Bootstrap administrator created for ${bootstrapAdmin.username}.`);
      } else {
        const existing = await client.query<{ role: string; active: boolean }>(
          "SELECT role, active FROM users WHERE username = $1",
          [bootstrapAdmin.username]
        );
        if (existing.rows[0]?.role !== "admin" || !existing.rows[0]?.active) {
          throw new Error(`Username ${bootstrapAdmin.username} already belongs to a non-admin or inactive account. Choose a new unique BML_BOOTSTRAP_ADMIN_USERNAME; setup does not alter existing accounts.`);
        }
        console.log(`Administrator ${bootstrapAdmin.username} already exists; its password and account settings were left unchanged.`);
      }
    }

    await client.query("COMMIT");
    if (!bootstrapAdmin) {
      console.log("Database schema is ready. No bootstrap administrator was configured or created.");
    } else {
      console.log("Database setup completed successfully.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
