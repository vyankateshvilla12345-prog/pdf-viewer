let activeSessionToken = null;
let activeSessionId = null;

export function setSessionAuth(token, sessionId) {
  activeSessionToken = token;
  activeSessionId = sessionId;
}

export function getSessionToken() {
  return activeSessionToken;
}

export function getSessionId() {
  return activeSessionId;
}

export function clearSessionAuth() {
  activeSessionToken = null;
  activeSessionId = null;
}
