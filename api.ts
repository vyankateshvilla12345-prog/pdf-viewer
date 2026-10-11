import { getPublicClientIp } from './services/locationService';

const API_BASE = '/api';

interface AccessParams {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  permissionStatus?: string;
}

export async function requestAccess({ latitude, longitude, accuracy, permissionStatus }: AccessParams) {
  const clientPublicIp = await getPublicClientIp().catch(() => null);

  const response = await fetch(`${API_BASE}/access/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      latitude,
      longitude,
      accuracy,
      permissionStatus,
      clientPublicIp,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error: any = new Error(data.error || 'Access validation failed.');
    error.code = data.code || 'ACCESS_DENIED';
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function sendHeartbeat(token: string) {
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

export async function fetchPdfPreview(): Promise<ArrayBuffer> {
  const response = await fetch(`${API_BASE}/pdf/preview`);
  if (!response.ok) {
    throw new Error('Unable to load preview.');
  }
  return await response.arrayBuffer();
}

export async function fetchPdfDocument(token: string): Promise<ArrayBuffer> {
  if (!token) {
    throw new Error('No authorization session token provided.');
  }

  const response = await fetch(`${API_BASE}/pdf`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error: any = new Error(errorData.error || `Failed to fetch document: HTTP ${response.status}`);
    error.code = errorData.code || 'FETCH_FAILED';
    error.status = response.status;
    throw error;
  }

  return await response.arrayBuffer();
}

export async function sendSecurityEvent(
  eventType: string,
  {
    sessionId,
    locationPermissionStatus,
    coordinates,
    pageNumber,
    details,
  }: {
    sessionId?: string;
    locationPermissionStatus?: string;
    coordinates?: { latitude: number; longitude: number; accuracy?: number } | null;
    pageNumber?: number;
    details?: any;
  } = {}
) {
  try {
    const clientPublicIp = await getPublicClientIp().catch(() => null);

    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventType,
        sessionId: sessionId || 'none',
        locationPermissionStatus: locationPermissionStatus || 'unknown',
        coordinates: coordinates || null,
        clientPublicIp,
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
export async function getAdminOverview(idToken: string) {
  const res = await fetch(`${API_BASE}/admin/overview`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch overview metrics');
  return data;
}

export async function getAdminLogs(
  idToken: string,
  { limit = 50, startAfter, eventType, outcome, sessionId, search }: { limit?: number; startAfter?: string; eventType?: string; outcome?: string; sessionId?: string; search?: string } = {}
) {
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

export async function getAdminSessionDetails(idToken: string, sessionId: string) {
  const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch session timeline');
  return data;
}

export async function revokeAdminSession(idToken: string, sessionId: string) {
  const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to revoke session');
  return data;
}

export async function getAdminIpBlocks(idToken: string) {
  const res = await fetch(`${API_BASE}/admin/ip-blocks`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch IP blocks');
  return data;
}

export async function createAdminIpBlock(idToken: string, { ip, ipHash, reason, expiresAt }: { ip?: string; ipHash?: string; reason?: string; expiresAt?: string }) {
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

export async function deleteAdminIpBlock(idToken: string, hash: string) {
  const res = await fetch(`${API_BASE}/admin/ip-blocks/${hash}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to remove IP block');
  return data;
}
