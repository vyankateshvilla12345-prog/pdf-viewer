const API_BASE = '/api';

export async function requestAccess({ latitude, longitude, accuracy, permissionStatus }) {
  const response = await fetch(`${API_BASE}/access/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude, accuracy, permissionStatus }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Access request was not approved.');
    error.code = data.code || 'ACCESS_DENIED';
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function sendHeartbeat(token) {
  if (!token) return null;
  const response = await fetch(`${API_BASE}/access/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  return response.json().catch(() => ({}));
}

export async function fetchPdfPreview() {
  const response = await fetch(`${API_BASE}/pdf/preview`);
  if (!response.ok) {
    throw new Error('Unable to load preview.');
  }
  return await response.arrayBuffer();
}

export async function fetchPdfDocument(token) {
  if (!token) {
    throw new Error('Valid authorization session required.');
  }

  const response = await fetch(`${API_BASE}/pdf`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.error || `Unable to load document: HTTP ${response.status}`);
    error.code = errorData.code || 'DOCUMENT_FETCH_FAILED';
    error.status = response.status;
    throw error;
  }

  return await response.arrayBuffer();
}

export async function sendSecurityEvent(eventType, { sessionId, locationPermissionStatus, pageNumber, details } = {}) {
  try {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        sessionId: sessionId || 'none',
        locationPermissionStatus: locationPermissionStatus || 'unknown',
        pageNumber,
        details: details || {},
      }),
    });
    return await res.json().catch(() => ({}));
  } catch {
    return null;
  }
}

// Administrator APIs (Protected with Firebase ID token)
export async function getAdminOverview(idToken) {
  const res = await fetch(`${API_BASE}/admin/overview`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch overview metrics');
  return data;
}

export async function getAdminLogs(idToken, { limit = 50, startAfter, eventType, outcome, sessionId, search } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (startAfter) params.set('startAfter', startAfter);
  if (eventType) params.set('eventType', eventType);
  if (outcome) params.set('outcome', outcome);
  if (sessionId) params.set('sessionId', sessionId);
  if (search) params.set('search', search);

  const res = await fetch(`${API_BASE}/admin/access-logs?${params.toString()}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch access logs');
  return data;
}

export async function getAdminSessionDetails(idToken, sessionId) {
  const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch session timeline');
  return data;
}

export async function revokeAdminSession(idToken, sessionId) {
  const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to revoke session');
  return data;
}

export async function getAdminIpBlocks(idToken) {
  const res = await fetch(`${API_BASE}/admin/ip-blocks`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch IP blocks');
  return data;
}

export async function createAdminIpBlock(idToken, { ip, ipHash, reason, expiresAt }) {
  const res = await fetch(`${API_BASE}/admin/ip-blocks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ ip, ipHash, reason, expiresAt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create IP block');
  return data;
}

export async function deleteAdminIpBlock(idToken, hash) {
  const res = await fetch(`${API_BASE}/admin/ip-blocks/${hash}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to remove IP block');
  return data;
}
