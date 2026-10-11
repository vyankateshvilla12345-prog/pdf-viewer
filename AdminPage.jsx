import React, { useState, useEffect } from 'react';
import ProtectedAdminRoute from '../components/ProtectedAdminRoute';
import {
  getAdminOverview,
  getAdminLogs,
  getAdminSessionDetails,
  revokeAdminSession,
  getAdminIpBlocks,
  createAdminIpBlock,
  deleteAdminIpBlock,
} from '../api';
import {
  ShieldAlert,
  Ban,
  Clock,
  RefreshCw,
  Search,
  LogOut,
  MapPin,
  AlertTriangle,
  FileText,
  ExternalLink,
  Laptop,
} from 'lucide-react';

export default function AdminPage() {
  return (
    <ProtectedAdminRoute>
      {({ idToken, adminUser, onSignOut }) => (
        <AdminDashboardView idToken={idToken} adminUser={adminUser} onSignOut={onSignOut} />
      )}
    </ProtectedAdminRoute>
  );
}

function AdminDashboardView({ idToken, adminUser, onSignOut }) {
  const [overview, setOverview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [ipBlocks, setIpBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');

  // Selected session for timeline inspection
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSessionTimeline, setSelectedSessionTimeline] = useState(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // New IP Block form
  const [blockIp, setBlockIp] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, logsData, blocksData] = await Promise.all([
        getAdminOverview(idToken),
        getAdminLogs(idToken, {
          eventType: eventTypeFilter || undefined,
          outcome: outcomeFilter || undefined,
          search: search || undefined,
          limit: 100,
        }),
        getAdminIpBlocks(idToken),
      ]);

      setOverview(overviewData.stats);
      setLogs(logsData.logs || []);
      setIpBlocks(blocksData.blocks || []);
    } catch (err) {
      console.error('[Admin Dashboard Error]', err);
      setError(err.message || 'Failed to load administrator telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [eventTypeFilter, outcomeFilter]);

  const handleInspectSession = async (sessionId) => {
    if (!sessionId || sessionId === 'none') return;
    setSelectedSessionId(sessionId);
    setLoadingTimeline(true);
    try {
      const data = await getAdminSessionDetails(idToken, sessionId);
      setSelectedSessionTimeline(data);
    } catch (err) {
      alert(`Error loading session timeline: ${err.message}`);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleRevokeSession = async (sessionId) => {
    if (!window.confirm(`Revoke session ${sessionId}? The visitor's view will be closed immediately.`)) {
      return;
    }
    try {
      await revokeAdminSession(idToken, sessionId);
      alert(`Session ${sessionId} has been revoked.`);
      loadData();
      if (selectedSessionId === sessionId) {
        handleInspectSession(sessionId);
      }
    } catch (err) {
      alert(`Revocation error: ${err.message}`);
    }
  };

  const handleQuickBlockIp = async (ipToBlock) => {
    if (!ipToBlock || ipToBlock === 'unknown') return;
    if (!window.confirm(`Block IP address ${ipToBlock} from accessing this document?`)) return;
    try {
      await createAdminIpBlock(idToken, {
        ip: ipToBlock,
        reason: 'Blocked via access log action',
      });
      alert(`IP ${ipToBlock} has been blocked.`);
      loadData();
    } catch (err) {
      alert(`Failed to block IP: ${err.message}`);
    }
  };

  const handleCreateBlock = async (e) => {
    e.preventDefault();
    if (!blockIp.trim()) return;
    try {
      await createAdminIpBlock(idToken, {
        ip: blockIp.trim(),
        reason: blockReason.trim() || 'Admin enforcement',
      });
      setBlockIp('');
      setBlockReason('');
      loadData();
    } catch (err) {
      alert(`Failed to create block: ${err.message}`);
    }
  };

  const handleDeleteBlock = async (ipHash) => {
    if (!window.confirm('Deactivate this IP block?')) return;
    try {
      await deleteAdminIpBlock(idToken, ipHash);
      loadData();
    } catch (err) {
      alert(`Failed to remove block: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* Top Admin Navigation */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
              <span>Security & Audit Control Center</span>
              <span className="text-[10px] bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-indigo-300 font-mono">
                /home/admin=@
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Live Monitoring & Perimeter Security
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition flex items-center gap-1.5 text-xs cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>
          <button
            onClick={onSignOut}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {error && (
          <div className="p-4 bg-rose-950/60 border border-rose-900 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Summary Metrics Cards */}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-400">Total Attempts</div>
              <div className="text-2xl font-bold text-white mt-1 font-mono">
                {overview.totalOpenAttempts ?? 0}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="text-[11px] font-medium text-emerald-400">Authorized Opens</div>
              <div className="text-2xl font-bold text-emerald-300 mt-1 font-mono">
                {overview.successfulOpens ?? 0}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="text-[11px] font-medium text-rose-400">Denied Opens</div>
              <div className="text-2xl font-bold text-rose-300 mt-1 font-mono">
                {overview.deniedOpens ?? 0}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="text-[11px] font-medium text-indigo-400">Unique Sessions</div>
              <div className="text-2xl font-bold text-indigo-300 mt-1 font-mono">
                {overview.uniqueSessions ?? 0}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="text-[11px] font-medium text-amber-400">Location Denials</div>
              <div className="text-2xl font-bold text-amber-300 mt-1 font-mono">
                {overview.locationDenials ?? 0}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="text-[11px] font-medium text-purple-400">Render Errors</div>
              <div className="text-2xl font-bold text-purple-300 mt-1 font-mono">
                {overview.renderErrors ?? 0}
              </div>
            </div>
          </div>
        )}

        {/* 2. IP Blocking Controls */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-400" />
              <h2 className="text-sm font-semibold text-white">Network Perimeter IP Blocks</h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">{ipBlocks.length} active blocks</span>
          </div>

          <form onSubmit={handleCreateBlock} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={blockIp}
              onChange={(e) => setBlockIp(e.target.value)}
              placeholder="IP address to block (e.g. 192.168.1.100)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
            />
            <input
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Reason (e.g. Policy violation)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
            />
            <button
              type="submit"
              className="py-2 px-4 bg-rose-700 hover:bg-rose-600 text-white text-xs font-medium rounded-xl transition cursor-pointer"
            >
              Enforce IP Block
            </button>
          </form>

          {ipBlocks.length > 0 && (
            <div className="border border-slate-800 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-950 text-slate-400 text-[11px]">
                  <tr>
                    <th className="p-2.5">IP Hash</th>
                    <th className="p-2.5">Reason</th>
                    <th className="p-2.5">Created At</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                  {ipBlocks.map((b) => (
                    <tr key={b.ipHash} className="hover:bg-slate-800/40">
                      <td className="p-2.5 text-slate-300">{b.ipHash.slice(0, 16)}...</td>
                      <td className="p-2.5 font-sans text-slate-400">{b.reason}</td>
                      <td className="p-2.5 text-slate-500">{new Date(b.createdAt).toLocaleString()}</td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleDeleteBlock(b.ipHash)}
                          className="text-xs text-rose-400 hover:text-rose-300 font-sans cursor-pointer"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 3. Search & Filter Bar */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadData()}
              placeholder="Search IP, session, reason..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Event Types</option>
              <option value="access_requested">access_requested</option>
              <option value="access_granted">access_granted</option>
              <option value="access_denied">access_denied</option>
              <option value="location_permission_granted">location_permission_granted</option>
              <option value="location_permission_denied">location_permission_denied</option>
              <option value="session_expired">session_expired</option>
              <option value="invalid_session">invalid_session</option>
              <option value="viewer_error">viewer_error</option>
            </select>

            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Outcomes</option>
              <option value="success">Success</option>
              <option value="denied">Denied</option>
              <option value="info">Info</option>
            </select>
          </div>
        </section>

        {/* 4. Authoritative Audit Table with REAL IP and REAL LOCATION */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Authoritative Access Logs ({logs.length})</h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">Real-time device tracking</span>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-x-auto text-xs">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-950 text-slate-400 text-[11px]">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Event Type</th>
                  <th className="p-3">Outcome</th>
                  <th className="p-3 font-semibold text-indigo-300">Client IP Address</th>
                  <th className="p-3 font-semibold text-emerald-300">Geographic Location</th>
                  <th className="p-3">Session ID</th>
                  <th className="p-3">Device / Browser</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                      No matching audit records found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const hasCoords = log.latitude != null && log.longitude != null;
                    const mapsUrl = hasCoords
                      ? `https://www.google.com/maps?q=${log.latitude},${log.longitude}`
                      : null;
                    const displayIp = log.ipAddress || (log.ipHash ? log.ipHash.slice(0, 12) : '127.0.0.1');

                    return (
                      <tr key={log.eventId} className="hover:bg-slate-800/40 transition">
                        {/* 1. Timestamp */}
                        <td className="p-3 text-slate-400">
                          {new Date(log.createdAtMs || log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>

                        {/* 2. Event Type */}
                        <td className="p-3 font-sans font-medium text-slate-200">
                          {log.eventType}
                        </td>

                        {/* 3. Outcome */}
                        <td className="p-3 font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              log.outcome === 'success'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : log.outcome === 'denied'
                                ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {log.outcome}
                          </span>
                        </td>

                        {/* 4. REAL CLIENT IP ADDRESS */}
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800">
                              {displayIp}
                            </span>
                            {displayIp !== 'unknown' && displayIp !== '127.0.0.1' && (
                              <button
                                onClick={() => handleQuickBlockIp(displayIp)}
                                title="Block this IP"
                                className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-slate-800 cursor-pointer"
                              >
                                <Ban className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 5. REAL GEOGRAPHIC LOCATION & MAPS LINK */}
                        <td className="p-3 font-sans">
                          {hasCoords ? (
                            <div className="flex items-center gap-2">
                              <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 hover:bg-emerald-900 text-[11px] font-mono transition cursor-pointer"
                                title="Open exact coordinates on Google Maps"
                              >
                                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span>
                                  {Number(log.latitude).toFixed(4)}°, {Number(log.longitude).toFixed(4)}°
                                </span>
                                <ExternalLink className="w-3 h-3 text-emerald-400/80 ml-0.5 shrink-0" />
                              </a>
                              {log.accuracy != null && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  ±{Math.round(log.accuracy)}m
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[11px]">
                              {log.locationPermissionStatus === 'denied' ? (
                                <span className="text-rose-400">Permission Denied</span>
                              ) : log.locationPermissionStatus === 'granted' ? (
                                <span className="text-amber-400">Coords Pending</span>
                              ) : (
                                'Not requested'
                              )}
                            </span>
                          )}
                        </td>

                        {/* 6. Session ID */}
                        <td className="p-3 text-indigo-300">
                          {log.sessionId && log.sessionId !== 'none' ? (
                            <button
                              onClick={() => handleInspectSession(log.sessionId)}
                              className="hover:underline cursor-pointer font-mono"
                              title="Inspect session timeline"
                            >
                              {log.sessionId.slice(-10)}
                            </button>
                          ) : (
                            '-'
                          )}
                        </td>

                        {/* 7. Device / User Agent */}
                        <td className="p-3 text-slate-400 font-sans text-[11px] max-w-[200px] truncate" title={log.userAgent}>
                          {log.userAgent && log.userAgent !== 'unknown' ? (
                            <span className="flex items-center gap-1">
                              <Laptop className="w-3 h-3 text-slate-500 shrink-0" />
                              <span className="truncate">{log.userAgent.slice(0, 32)}...</span>
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>

                        {/* 8. Actions */}
                        <td className="p-3 text-right font-sans">
                          <div className="flex items-center justify-end gap-2">
                            {log.sessionId && log.sessionId !== 'none' && (
                              <button
                                onClick={() => handleInspectSession(log.sessionId)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded text-[11px] cursor-pointer transition"
                              >
                                Timeline
                              </button>
                            )}
                            {log.sessionId && log.sessionId !== 'none' && log.eventType === 'access_granted' && (
                              <button
                                onClick={() => handleRevokeSession(log.sessionId)}
                                className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-900 text-rose-300 rounded text-[11px] cursor-pointer transition"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. Session Timeline Modal */}
        {selectedSessionId && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Session Inspector: <span className="font-mono text-indigo-300">{selectedSessionId}</span>
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedSessionId(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="my-4 overflow-y-auto flex-1 space-y-4 text-xs font-mono">
                {loadingTimeline ? (
                  <div className="text-slate-400 text-center py-8 font-sans">Loading timeline...</div>
                ) : selectedSessionTimeline ? (
                  <>
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>Status: <span className={`font-bold ${selectedSessionTimeline.session?.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}`}>{selectedSessionTimeline.session?.status}</span></div>
                        <button
                          onClick={() => handleRevokeSession(selectedSessionId)}
                          disabled={selectedSessionTimeline.session?.status === 'revoked'}
                          className="px-3 py-1 bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white rounded text-xs cursor-pointer font-sans"
                        >
                          Revoke Active Session
                        </button>
                      </div>

                      {/* Real Location in Session Inspector */}
                      {selectedSessionTimeline.session?.coordinates && (
                        <div className="flex items-center gap-2 pt-1">
                          <MapPin className="w-4 h-4 text-emerald-400" />
                          <span>Coordinates:</span>
                          <a
                            href={`https://www.google.com/maps?q=${selectedSessionTimeline.session.coordinates.latitude},${selectedSessionTimeline.session.coordinates.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 hover:underline flex items-center gap-1"
                          >
                            <span>
                              {selectedSessionTimeline.session.coordinates.latitude}°, {selectedSessionTimeline.session.coordinates.longitude}°
                            </span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}

                      <div>Created: {selectedSessionTimeline.session?.createdAt}</div>
                      <div>Last Activity: {selectedSessionTimeline.session?.lastSeenAt}</div>
                      <div>Page Requests: {selectedSessionTimeline.session?.pageRequestCount || 1}</div>
                      <div>Viewing Duration: {selectedSessionTimeline.session?.totalViewingSecondsEstimate || 0} seconds</div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-sans font-semibold text-slate-300">Activity Timeline</div>
                      <div className="space-y-1.5 border-l border-slate-800 pl-3">
                        {selectedSessionTimeline.timeline?.map((t) => (
                          <div key={t.eventId} className="py-1">
                            <span className="text-slate-500">{new Date(t.createdAtMs).toLocaleTimeString()}</span>{' '}
                            <span className="text-indigo-300 font-sans font-medium">{t.eventType}</span>{' '}
                            <span className="text-slate-400 font-sans">({t.outcome})</span>
                            {t.ipAddress && <span className="text-slate-500 ml-2">IP: {t.ipAddress}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500">No session data available.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
