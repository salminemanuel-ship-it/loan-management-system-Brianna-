import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { pool } from "./db";

export type Role = "loan_officer" | "supervisor" | "committee" | "finance" | "management" | "admin" | "customer";

export interface JwtUser {
  id: number;
  username: string;
  role: Role;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    const session = jwt.verify(token, config.jwtSecret) as JwtUser;
    const result = await pool.query("SELECT active, admin_locked FROM users WHERE id = $1", [session.id]);
    const account = result.rows[0];
    if (!account || !account.active) return res.status(401).json({ message: "This account is inactive. Sign in again." });
    if (account.admin_locked) return res.status(423).json({ message: "This account has been locked by a system administrator." });
    res.locals.user = session;
    next();
  } catch {
    res.status(401).json({ message: "Your session has ended. Sign in again." });
  }
}
