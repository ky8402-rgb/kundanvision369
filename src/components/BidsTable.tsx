import React, { useState, useEffect, useCallback } from 'react';
import { BackendBidItem, BACKEND_BASE_URL } from '../services/api';
import { formatPackageName } from './PackageChart';

interface BidsTableProps {
  onSelectBid?: (bid: BackendBidItem) => void;
  externalRefreshTrigger?: number;
  onBidsLoaded?: (bids: BackendBidItem[]) => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

// Local storage key for persistent work status & notes
const LOCAL_WORK_STORE_KEY = 'gigpilot_work_tracking_v1';

function getWorkTrackingStore(): Record<string, { work_status?: string; notes?: string }> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_WORK_STORE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveWorkTrackingStore(store: Record<string, { work_status?: string; notes?: string }>) {
  try {
    localStorage.setItem(LOCAL_WORK_STORE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error('[BidsTable] Failed to save work tracking to localStorage:', err);
  }
}

export const BidsTable: React.FC<BidsTableProps> = ({
  onSelectBid,
  externalRefreshTrigger,
  onBidsLoaded,
  onNotify,
}) => {
  const [bids, setBids] = useState<BackendBidItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [workTracking, setWorkTracking] = useState<Record<string, { work_status?: string; notes?: string }>>(getWorkTrackingStore());

  const fetchBids = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let response = await fetch(`${BACKEND_BASE_URL}/api/bids?limit=50`);
      if (!response.ok && response.status === 404) {
        // Fallback to local server proxy if remote is 404 or cold-starting
        response = await fetch(`/api/bids?limit=50`);
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch bids from ${BACKEND_BASE_URL}`);
      }
      const data = await response.json();
      const rawList: BackendBidItem[] = Array.isArray(data) ? data : (data.bids || []);
      setBids(rawList);
      setLastUpdated(new Date());
      if (onBidsLoaded) onBidsLoaded(rawList);
    } catch (err: any) {
      console.warn('[BidsTable] Backend fetch failed, trying local fallback:', err);
      try {
        const localRes = await fetch(`/api/freelancer/bids?limit=50`);
        if (localRes.ok) {
          const localData = await localRes.json();
          const list: BackendBidItem[] = Array.isArray(localData) ? localData : (localData.bids || []);
          if (list.length > 0) {
            setBids(list);
            setLastUpdated(new Date());
            if (onBidsLoaded) onBidsLoaded(list);
            setLoading(false);
            return;
          }
        }
      } catch {}
      setError(err?.message || 'Failed to load bids. Backend may be starting up.');
    } finally {
      setLoading(false);
    }
  }, [onBidsLoaded]);

  // Initial fetch and external refresh
  useEffect(() => {
    fetchBids();
  }, [fetchBids, externalRefreshTrigger]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      fetchBids();
    }, 60000);
    return () => clearInterval(timer);
  }, [fetchBids]);

  // Handle work status change
  const handleWorkStatusChange = (bidId: string, newStatus: string) => {
    const updated = {
      ...workTracking,
      [bidId]: {
        ...(workTracking[bidId] || {}),
        work_status: newStatus,
      },
    };
    setWorkTracking(updated);
    saveWorkTrackingStore(updated);
    if (onNotify) {
      onNotify(`Work status updated to "${newStatus}"`, 'success');
    }
  };

  // Handle notes change
  const handleNoteChange = (bidId: string, noteText: string) => {
    const updated = {
      ...workTracking,
      [bidId]: {
        ...(workTracking[bidId] || {}),
        notes: noteText,
      },
    };
    setWorkTracking(updated);
    saveWorkTrackingStore(updated);
  };

  const handleNoteBlur = (bidId: string) => {
    const note = workTracking[bidId]?.notes?.trim();
    if (note && onNotify) {
      onNotify(`Saved notes for bid #${bidId}`, 'success');
    }
  };

  const handleWithdrawClick = (e: React.MouseEvent, bid: BackendBidItem) => {
    e.stopPropagation();
    const platform = (bid.platform || 'Freelancer.com').toLowerCase();
    let url = 'https://www.freelancer.com/users/financial/withdrawal.php';
    let platName = 'Freelancer.com';

    if (platform.includes('upwork')) {
      url = 'https://www.upwork.com/nx/reports/overview/';
      platName = 'Upwork';
    } else if (platform.includes('remote') || platform.includes('direct')) {
      url = 'https://www.paypal.com/mep/dashboard';
      platName = 'Direct PayPal / Stripe';
    }

    if (onNotify) {
      onNotify(`Opening secure ${platName} payout portal for $${Number(bid.bid_amount || 0).toFixed(2)}`, 'info');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const filteredBids = bids.filter((bid) => {
    const matchesStatus = filterStatus === 'all' || (bid.status || 'pending').toLowerCase() === filterStatus.toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query ||
      (bid.job_title && bid.job_title.toLowerCase().includes(query)) ||
      (bid.company && bid.company.toLowerCase().includes(query)) ||
      (bid.client_name && bid.client_name.toLowerCase().includes(query)) ||
      (bid.package && bid.package.toLowerCase().includes(query)) ||
      (bid.platform && bid.platform.toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });

  const renderPlatformBadge = (platform?: string) => {
    const p = (platform || 'freelancer').toLowerCase();
    if (p.includes('freelancer')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border bg-sky-500/15 text-sky-300 border-sky-500/30 whitespace-nowrap">
          <i className="fas fa-globe text-[10px]"></i>
          Freelancer
        </span>
      );
    } else if (p.includes('upwork')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 whitespace-nowrap">
          <i className="fab fa-upwork text-[10px]"></i>
          Upwork
        </span>
      );
    } else if (p.includes('remoteok') || p.includes('remote')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border bg-rose-500/15 text-rose-300 border-rose-500/30 whitespace-nowrap">
          <i className="fas fa-bolt text-[10px]"></i>
          RemoteOK
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border bg-slate-700/40 text-slate-300 border-slate-600/40 whitespace-nowrap">
        <i className="fas fa-briefcase text-[10px]"></i>
        {platform || 'Other'}
      </span>
    );
  };

  const renderStatusBadge = (status?: string) => {
    const s = (status || 'pending').toLowerCase().trim();
    let badgeStyle = 'bg-slate-800/80 text-slate-300 border-slate-700';
    let dotColor = 'bg-slate-400';

    if (s === 'pending' || s === 'queued' || s === 'submitted') {
      badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      dotColor = 'bg-amber-400';
    } else if (s === 'viewed' || s === 'opened') {
      badgeStyle = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      dotColor = 'bg-blue-400';
    } else if (s === 'interviewing' || s === 'active' || s === 'shortlisted') {
      badgeStyle = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      dotColor = 'bg-emerald-400';
    } else if (s === 'won' || s === 'awarded' || s === 'accepted') {
      badgeStyle = 'bg-emerald-500/25 text-emerald-300 border-emerald-400 shadow-sm shadow-emerald-500/20';
      dotColor = 'bg-emerald-300 animate-pulse';
    } else if (s === 'lost' || s === 'rejected' || s === 'declined') {
      badgeStyle = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      dotColor = 'bg-rose-400';
    } else if (s === 'expired' || s === 'closed') {
      badgeStyle = 'bg-slate-600/20 text-slate-400 border-slate-600/30';
      dotColor = 'bg-slate-400';
    } else if (s === 'archived') {
      badgeStyle = 'bg-slate-800/60 text-slate-500 border-slate-800';
      dotColor = 'bg-slate-600';
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${badgeStyle}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
        {status || 'pending'}
      </span>
    );
  };

  const getWorkStatusColor = (status: string) => {
    switch (status) {
      case 'Paid':
        return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40';
      case 'Delivered':
        return 'text-sky-300 border-sky-500/40 bg-sky-950/40';
      case 'Completed':
        return 'text-indigo-300 border-indigo-500/40 bg-indigo-950/40';
      case 'In Progress':
        return 'text-amber-300 border-amber-500/40 bg-amber-950/40';
      default:
        return 'text-slate-300 border-slate-700 bg-[#0f172a]';
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div id="bids-table-section" className="bg-[#111726] rounded-2xl border border-[#1e293b] p-5 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1e293b]/80 mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-sm font-bold border border-emerald-500/25">
              <i className="fas fa-list-check"></i>
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Recent Auto-Dispatched Bids &amp; Work Orders
            </h3>
            <span className="bg-[#161e31] text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border border-[#1e293b]">
              {bids.length} Total
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Live auto-proposals submitted to Freelancer.com, Upwork, and remote client networks with instant work status tracking.
          </p>
        </div>

        {/* Actions & Refresh */}
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[11px] text-slate-500 font-mono hidden md:inline">
              Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            id="refresh-bids-btn"
            onClick={fetchBids}
            disabled={loading}
            className="bg-[#161e31] hover:bg-[#1e293b] text-slate-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#1e293b] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Refresh bids from backend"
          >
            <i className={`fas fa-sync-alt text-[11px] ${loading ? 'fa-spin text-emerald-400' : ''}`}></i>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['all', 'pending', 'viewed', 'interviewing', 'won', 'lost'].map((statusKey) => (
            <button
              key={statusKey}
              onClick={() => setFilterStatus(statusKey)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold capitalize transition-all whitespace-nowrap cursor-pointer ${
                filterStatus === statusKey
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-[#161e31] text-slate-400 hover:text-slate-200 hover:bg-[#1e293b] border border-[#1e293b]'
              }`}
            >
              {statusKey}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
          <input
            type="text"
            placeholder="Search by title, platform, client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#161e31] text-slate-200 placeholder-slate-500 text-xs rounded-xl pl-8 pr-3 py-1.5 border border-[#1e293b] focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <i className="fas fa-exclamation-circle text-rose-400"></i>
            <span>{error}</span>
          </div>
          <button
            onClick={fetchBids}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1 rounded-lg text-[11px] cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Bids Table with Platform, Work Status, Notes, and Withdraw Actions */}
      <div className="overflow-x-auto rounded-xl border border-[#1e293b]/70">
        <table id="bids-table" className="w-full text-left text-xs text-slate-300">
          <thead className="bg-[#0a0e1a]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-[#1e293b]">
            <tr>
              <th className="py-3 px-3.5 font-bold">Job Title</th>
              <th className="py-3 px-3.5 font-bold">Company</th>
              <th className="py-3 px-3.5 font-bold">Platform</th>
              <th className="py-3 px-3.5 font-bold">Package</th>
              <th className="py-3 px-3.5 font-bold">Amount</th>
              <th className="py-3 px-3.5 font-bold">Bid Status</th>
              <th className="py-3 px-3.5 font-bold">Work Status</th>
              <th className="py-3 px-3.5 font-bold">Notes</th>
              <th className="py-3 px-3.5 font-bold">Action</th>
              <th className="py-3 px-3.5 font-bold">Submitted Date</th>
            </tr>
          </thead>
          <tbody id="bids-table-body" className="divide-y divide-[#1e293b]/60">
            {loading && bids.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fas fa-circle-notch fa-spin text-emerald-400 text-xl"></i>
                    <span className="text-xs">Fetching latest bids from {BACKEND_BASE_URL}...</span>
                  </div>
                </td>
              </tr>
            ) : filteredBids.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-slate-500 text-xs">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <i className="fas fa-robot text-slate-600 text-2xl mb-1"></i>
                    <p className="font-semibold text-slate-400">No bids match current filter.</p>
                    <p className="text-[11px] text-slate-500">The auto-bidding daemon is scanning live marketplace feeds.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredBids.map((bid, index) => {
                const bidId = String(bid.id || `bid-${index}`);
                const title = bid.job_title || 'Freelance Proposal';
                const company = bid.company || bid.client_name || 'Verified Client';
                const pkg = formatPackageName(bid.package);
                const amount = Number(bid.bid_amount || 0);
                const isWon = ['won', 'awarded', 'accepted'].includes((bid.status || '').toLowerCase());
                
                const savedTrack = workTracking[bidId] || {};
                const currentWorkStatus = savedTrack.work_status || (isWon ? 'In Progress' : 'Not Started');
                const currentNotes = savedTrack.notes || '';
                const jobUrl = bid.job_url || (bid.id ? `https://freelancer.com/projects/${bid.id}` : '#');

                return (
                  <tr
                    key={bidId}
                    onClick={() => onSelectBid && onSelectBid(bid)}
                    className="hover:bg-[#161e31]/80 transition-colors group cursor-pointer"
                  >
                    {/* Job Title */}
                    <td className="py-3 px-3.5 font-medium text-white max-w-[220px]">
                      <div className="truncate font-semibold group-hover:text-emerald-300 transition-colors" title={title}>
                        {title}
                      </div>
                      {bid.job_url && (
                        <a
                          href={bid.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-indigo-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                        >
                          <span>Listing</span>
                          <i className="fas fa-external-link-alt text-[8px]"></i>
                        </a>
                      )}
                    </td>

                    {/* Company */}
                    <td className="py-3 px-3.5 text-slate-300 max-w-[140px]">
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <i className="far fa-building text-slate-500 text-[10px]"></i>
                        <span className="truncate">{company}</span>
                      </span>
                    </td>

                    {/* Platform Column */}
                    <td className="py-3 px-3.5" onClick={(e) => e.stopPropagation()}>
                      {renderPlatformBadge(bid.platform)}
                    </td>

                    {/* Package */}
                    <td className="py-3 px-3.5 text-indigo-300 font-medium font-mono text-[11.5px] whitespace-nowrap">
                      {pkg}
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-3.5 font-mono font-bold text-emerald-400 text-sm whitespace-nowrap">
                      ${isNaN(amount) ? '0.00' : amount.toFixed(2)}
                    </td>

                    {/* Bid Status */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {renderStatusBadge(bid.status)}
                    </td>

                    {/* Work Status Dropdown */}
                    <td className="py-3 px-3.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={currentWorkStatus}
                        onChange={(e) => handleWorkStatusChange(bidId, e.target.value)}
                        className={`text-xs font-semibold px-2 py-1 rounded-lg border outline-none cursor-pointer transition-all ${getWorkStatusColor(
                          currentWorkStatus
                        )}`}
                      >
                        <option value="Not Started" className="bg-[#0f172a] text-slate-300">Not Started</option>
                        <option value="In Progress" className="bg-[#0f172a] text-amber-300">In Progress</option>
                        <option value="Completed" className="bg-[#0f172a] text-indigo-300">Completed</option>
                        <option value="Delivered" className="bg-[#0f172a] text-sky-300">Delivered</option>
                        <option value="Paid" className="bg-[#0f172a] text-emerald-300">Paid</option>
                      </select>
                    </td>

                    {/* Notes Field */}
                    <td className="py-3 px-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          placeholder="Add notes..."
                          value={currentNotes}
                          onChange={(e) => handleNoteChange(bidId, e.target.value)}
                          onBlur={() => handleNoteBlur(bidId)}
                          className="w-32 hover:w-44 focus:w-48 bg-[#0f172a] border border-[#1e293b] focus:border-emerald-500 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 transition-all outline-none"
                        />
                      </div>
                    </td>

                    {/* Action Column (View Job + Withdraw Button for Won bids) */}
                    <td className="py-3 px-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-[#161e31] hover:bg-[#1e293b] text-slate-300 hover:text-white border border-[#1e293b] text-[11px] font-semibold transition-all inline-flex items-center gap-1"
                          title="Open job listing in new tab"
                        >
                          <i className="fas fa-arrow-up-right-from-square text-[10px]"></i>
                          <span className="hidden sm:inline">Job</span>
                        </a>

                        {/* Withdraw button for won bids */}
                        {isWon && (
                          <button
                            type="button"
                            onClick={(e) => handleWithdrawClick(e, bid)}
                            className="py-1 px-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 text-[11px] font-bold transition-all inline-flex items-center gap-1 cursor-pointer shadow-sm shadow-emerald-500/20"
                            title={`Withdraw $${amount.toFixed(2)} from ${bid.platform || 'Freelancer.com'}`}
                          >
                            <i className="fas fa-money-bill-wave text-[10px]"></i>
                            <span>Withdraw</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Submitted Date */}
                    <td className="py-3 px-3.5 text-slate-400 text-[11.5px] font-mono whitespace-nowrap">
                      {formatDateTime(bid.submitted_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

