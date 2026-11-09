import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { config } from "../config";
import { audit } from "../audit";
import { requireAuth, JwtUser } from "../auth";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const GENERIC_ERROR = "Incorrect username or password.";

function normalizeSignupPhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, "");
  if (/^0[67]\d{8}$/.test(compact)) return `+255${compact.slice(1)}`;
  if (/^255[67]\d{8}$/.test(compact)) return `+${compact}`;
  return compact;
}

export const authRoutes = Router();

authRoutes.get("/me", requireAuth, async (_req, res) => {
  try {
    const session = res.locals.user as JwtUser;
    const result = await pool.query("SELECT username, full_name, role, profile_image, active FROM users WHERE id = $1", [session.id]);
    const user = result.rows[0];
    if (!user || !user.active) return res.status(401).json({ message: "This account is inactive. Sign in again." });
    return res.json({ username: user.username, fullName: user.full_name, role: user.role, profileImage: user.profile_image ?? undefined });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not verify your account." });
  }
});

authRoutes.post("/register", async (req, res) => {
  const { fullName, username, phone, password, profileImage } = req.body ?? {};
  if (typeof fullName !== "string" || typeof username !== "string" || typeof phone !== "string" || typeof password !== "string" || (profileImage !== undefined && typeof profileImage !== "string")) {
    return res.status(400).json({ message: "Enter your full name, username, mobile phone, password and profile photo." });
  }
  const cleanUsername = username.trim().toLowerCase();
  const normalizedPhone = normalizeSignupPhone(phone);
  if (fullName.trim().length < 1 || fullName.trim().length > 120) {
    return res.status(400).json({ message: "Enter a name between 1 and 120 characters." });
  }
  if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
    return res.status(400).json({ message: "Enter a valid mobile phone number with an international country code." });
  }
  if (!/^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/.test(cleanUsername)) {
    return res.status(400).json({ message: "Choose a username with 3 to 30 letters, numbers, dots, underscores or hyphens." });
  }
  if (password.length < 10 || password.length > 128) {
    return res.status(400).json({ message: "Choose a password between 10 and 128 characters." });
  }
  if (profileImage !== undefined && (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(profileImage) || profileImage.length > 2_100_000)) {
    return res.status(400).json({ message: "Upload a JPEG, PNG or WebP profile photo no larger than 1.5 MB." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id FROM users WHERE phone = $1 OR lower(username) = $2", [normalizedPhone, cleanUsername]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "An account with this username or phone number already exists. Sign in instead." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await client.query(
      `INSERT INTO users (username, phone, full_name, password_hash, role, profile_image)
        VALUES ($1, $2, $3, $4, 'customer', $5) RETURNING id, username, role`,
            [cleanUsername, normalizedPhone, fullName.trim(), passwordHash, profileImage ?? null]
    );
    const user = created.rows[0];
    await client.query("INSERT INTO clients (full_name, user_id, phone) VALUES ($1, $2, $3)", [fullName.trim(), user.id, normalizedPhone]);
    await audit(user.username, "Customer account created", user.id.toString());
    await client.query("COMMIT");
    return res.status(201).json({ message: "Your customer account was created. Please sign in to continue." });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return res.status(500).json({ message: "Could not create your account. Try again." });
  } finally {
    client.release();
  }
});

authRoutes.post("/register-staff", async (req, res) => {
  const { fullName, username, phone, password, profileImage, requestedRole } = req.body ?? {};
  const staffRoles = ["loan_officer", "supervisor", "committee", "finance", "management"];
  if (typeof fullName !== "string" || typeof username !== "string" || typeof phone !== "string" || typeof password !== "string" || (profileImage !== undefined && typeof profileImage !== "string") || !staffRoles.includes(requestedRole)) {
    return res.status(400).json({ message: "Enter your name, username, phone, password, profile photo and requested staff role." });
  }
  const cleanUsername = username.trim().toLowerCase();
  const normalizedPhone = normalizeSignupPhone(phone);
  if (fullName.trim().length < 1 || fullName.trim().length > 120) return res.status(400).json({ message: "Enter a name between 1 and 120 characters." });
  if (!/^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/.test(cleanUsername)) return res.status(400).json({ message: "Choose a username with 3 to 30 letters, numbers, dots, underscores or hyphens." });
  if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) return res.status(400).json({ message: "Enter a valid mobile phone number with an international country code." });
  if (password.length < 10 || password.length > 128) return res.status(400).json({ message: "Choose a password between 10 and 128 characters." });
  if (profileImage !== undefined && (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(profileImage) || profileImage.length > 2_100_000)) {
    return res.status(400).json({ message: "Upload a JPEG, PNG or WebP profile photo no larger than 1.5 MB." });
  }
  try {
    const existing = await pool.query("SELECT id FROM users WHERE phone = $1 OR lower(username) = $2", [normalizedPhone, cleanUsername]);
    if (existing.rowCount) return res.status(409).json({ message: "An account or staff request with this username or phone number already exists." });
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await pool.query(
      `INSERT INTO users (username, phone, full_name, password_hash, role, requested_role, profile_image, active)
       VALUES ($1, $2, $3, $4, 'customer', $5, $6, FALSE) RETURNING id, username`,
      [cleanUsername, normalizedPhone, fullName.trim(), passwordHash, requestedRole, profileImage ?? null]
    );
    await audit(cleanUsername, "Staff registration requested", created.rows[0].id.toString(), `Requested role: ${requestedRole}`);
    return res.status(202).json({ message: "Your staff registration was received. An administrator must approve your requested role before you can sign in." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not submit the staff registration request." });
  }
});

authRoutes.get("/pending-users", requireAuth, async (_req, res) => {
  const actor = res.locals.user as JwtUser;
  if (actor.role !== "admin") return res.status(403).json({ message: "Only an administrator can review staff registration requests." });
  try {
    const pending = await pool.query(
      `SELECT id, username, full_name AS "fullName", phone, requested_role AS "requestedRole", created_at AS "createdAt"
         FROM users WHERE active = FALSE AND requested_role IS NOT NULL ORDER BY created_at ASC`
    );
    return res.json(pending.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load staff registration requests." });
  }
});

authRoutes.post("/pending-users/:id/approve", requireAuth, async (req, res) => {
  const actor = res.locals.user as JwtUser;
  if (actor.role !== "admin") return res.status(403).json({ message: "Only an administrator can approve staff registration requests." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid registration request." });
  try {
    const approved = await pool.query(
      `UPDATE users SET role = requested_role, requested_role = NULL, active = TRUE
        WHERE id = $1 AND active = FALSE AND requested_role IS NOT NULL
        RETURNING id, username, role`, [id]
    );
    if (!approved.rowCount) return res.status(404).json({ message: "This pending request was not found." });
    await audit(actor.username, "Staff registration approved", id.toString(), `Role: ${approved.rows[0].role}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not approve this staff registration." });
  }
});

authRoutes.delete("/pending-users/:id", requireAuth, async (req, res) => {
  const actor = res.locals.user as JwtUser;
  if (actor.role !== "admin") return res.status(403).json({ message: "Only an administrator can reject staff registration requests." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid registration request." });
  try {
    const rejected = await pool.query("DELETE FROM users WHERE id = $1 AND active = FALSE AND requested_role IS NOT NULL RETURNING id", [id]);
    if (!rejected.rowCount) return res.status(404).json({ message: "This pending request was not found." });
    await audit(actor.username, "Staff registration rejected", id.toString());
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not reject this staff registration." });
  }
});

authRoutes.patch("/profile", requireAuth, async (req, res) => {
  const user = res.locals.user as JwtUser;
  const { profileImage, fullName } = req.body ?? {};
  if (fullName !== undefined && (typeof fullName !== "string" || fullName.trim().length < 2 || fullName.trim().length > 120)) {
    return res.status(400).json({ message: "Enter a full name between 2 and 120 characters." });
  }
  if (profileImage !== undefined && (typeof profileImage !== "string" || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(profileImage) || profileImage.length > 2_100_000)) {
    return res.status(400).json({ message: "Upload a JPEG, PNG or WebP profile photo no larger than 1.5 MB." });
  }
  if (fullName === undefined && profileImage === undefined) return res.status(400).json({ message: "Update your name or profile photo." });
  try {
    const result = await pool.query(
      `UPDATE users SET full_name = COALESCE($1, full_name), profile_image = COALESCE($2, profile_image)
        WHERE id = $3 RETURNING full_name AS "fullName", profile_image AS "profileImage"`,
      [typeof fullName === "string" ? fullName.trim() : null, typeof profileImage === "string" ? profileImage : null, user.id]
    );
    await audit(user.username, "Profile updated", user.id.toString());
    return res.json({ ok: true, ...result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not update your profile photo." });
  }
});

authRoutes.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Enter your username and password." });
    }

    const typed = username.trim();
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE lower(username) = $1 LIMIT 1",
      [typed.toLowerCase()]
    );
    const user = rows[0];

    if (!user) {
      await audit(typed.toLowerCase(), "Sign-in failed", "", "Unknown or inactive account");
      return res.status(401).json({ message: GENERIC_ERROR });
    }

    if (!user.active) {
      if (user.requested_role) {
        await audit(user.username, "Sign-in blocked", user.id.toString(), "Staff registration awaiting approval");
        return res.status(403).json({ message: "Your staff registration is awaiting administrator approval. You can sign in after your role is approved." });
      }
      await audit(typed.toLowerCase(), "Sign-in failed", "", "Unknown or inactive account");
      return res.status(401).json({ message: GENERIC_ERROR });
    }

    if (user.admin_locked) {
      await audit(user.username, "Sign-in blocked", user.id.toString(), "Account locked by system administrator");
      return res.status(423).json({ message: "This account has been locked by a system administrator. Contact BML support." });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await audit(user.username, "Sign-in blocked", "", "Account is locked");
      return res.status(423).json({
        message: `Account locked after repeated failed attempts. Try again in ${LOCK_MINUTES} minutes or ask the system admin.`,
      });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      const attempts = user.failed_attempts + 1;
      const lock = attempts >= MAX_ATTEMPTS;
      await pool.query(
        `UPDATE users
            SET failed_attempts = CASE WHEN $3::boolean THEN 0 ELSE $2::int END,
                locked_until = CASE WHEN $3::boolean THEN now() + ($4::int * interval '1 minute') ELSE NULL END
          WHERE id = $1`,
        [user.id, attempts, lock, LOCK_MINUTES]
      );
      await audit(user.username, "Sign-in failed", "", lock ? "Account locked" : `Attempt ${attempts}`);
      return res.status(401).json({ message: GENERIC_ERROR });
    }

    await pool.query("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [user.id]);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: "8h" }
    );
    await audit(user.username, "Signed in");
    res.json({ token, user: { username: user.username, fullName: user.full_name, role: user.role, profileImage: user.profile_image ?? undefined } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong on the server. Try again." });
  }
});
