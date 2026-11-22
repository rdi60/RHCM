import "express-session";

declare module "express-session" {
  interface SessionData {
    /** Set once password (and MFA, if enrolled) have both been verified. */
    userId?: string;
    /** Set after a correct password, before MFA has been verified, for accounts with MFA enabled. */
    pendingMfaUserId?: string;
    loginAt?: number;
  }
}
