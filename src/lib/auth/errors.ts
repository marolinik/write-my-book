/**
 * No signed-in user. The message stays "Unauthorized" because many routes
 * still match on it to answer 401.
 */
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * Clerk or the database failed while looking the user up, so the user is not
 * proven absent (P1-2). Routes answer 5xx, never 401: a 401 sends the writer
 * to /login in a loop while the real fault is an outage.
 */
export class AuthUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AuthUnavailableError";
  }
}
