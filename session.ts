let activeSessionToken: string | null = null;
let activeSessionId: string | null = null;

export function setSessionAuth(token: string, sessionId: string) {
  activeSessionToken = token;
  activeSessionId = sessionId;
}

export function getSessionToken(): string | null {
  return activeSessionToken;
}

export function getSessionId(): string | null {
  return activeSessionId;
}

export function clearSessionAuth() {
  activeSessionToken = null;
  activeSessionId = null;
}
