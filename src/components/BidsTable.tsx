import React, { useState, useEffect, useCallback } from 'react';
import { BackendBidItem, BACKEND_BASE_URL } from '../services/api';
import { formatPackageName } from './PackageChart';

interface BidsTableProps {
  onSelectBid?: (bid: BackendBidItem) => void;
  externalRefreshTrigger?: number;
}

export const BidsTable: React.FC<BidsTableProps> = ({ onSelectBid, externalRefreshTrigger }) => {
  const [bids, setBids] = useState<BackendBidItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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
      const rawList = Array.isArray(data) ? data : (data.bids || []);
      setBids(rawList);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.warn('[BidsTable] Backend fetch failed, trying local fallback:', err);
      try {
        const localRes = await fetch(`/api/freelancer/bids?limit=50`);
        if (localRes.ok) {
          const localData = await localRes.json();
          const list = Array.isArray(localData) ? localData : (localData.bids || []);
          if (list.length > 0) {
            setBids(list);
            setLastUpdated(new Date());
            setLoading(false);
            return;
          }
        }
      } catch {}
      setError(err?.message || 'Failed to load bids. Backend may be starting up.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const filteredBids = bids.filter((bid) => {
    const matchesStatus = filterStatus === 'all' || (bid.status || 'pending').toLowerCase() === filterStatus.toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query ||
      (bid.job_title && bid.job_title.toLowerCase().includes(query)) ||
      (bid.company && bid.company.toLowerCase().includes(query)) ||
      (bid.client_name && bid.client_name.toLowerCase().includes(query)) ||
      (bid.package && bid.package.toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });

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
              Recent Auto-Dispatched Bids
            </h3>
            <span className="bg-[#161e31] text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border border-[#1e293b]">
              {bids.length} Total
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Live auto-proposals submitted to Freelancer.com and remote work portals.
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

        <div className="relative min-w-[200px]">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
          <input
            type="text"
            placeholder="Search by title, client..."
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

      {/* Bids Table */}
      <div className="overflow-x-auto rounded-xl border border-[#1e293b]/70">
        <table id="bids-table" className="w-full text-left text-xs text-slate-300">
          <thead className="bg-[#0a0e1a]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-[#1e293b]">
            <tr>
              <th className="py-3 px-4 font-bold">Job Title</th>
              <th className="py-3 px-4 font-bold">Company</th>
              <th className="py-3 px-4 font-bold">Package</th>
              <th className="py-3 px-4 font-bold">Amount</th>
              <th className="py-3 px-4 font-bold">Status</th>
              <th className="py-3 px-4 font-bold">Submitted At</th>
            </tr>
          </thead>
          <tbody id="bids-table-body" className="divide-y divide-[#1e293b]/60">
            {loading && bids.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fas fa-circle-notch fa-spin text-emerald-400 text-xl"></i>
                    <span className="text-xs">Fetching latest bids from {BACKEND_BASE_URL}...</span>
                  </div>
                </td>
              </tr>
            ) : filteredBids.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-500 text-xs">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <i className="fas fa-robot text-slate-600 text-2xl mb-1"></i>
                    <p className="font-semibold text-slate-400">No bids match current filter.</p>
                    <p className="text-[11px] text-slate-500">The auto-bidding daemon is scanning live marketplace feeds.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredBids.map((bid, index) => {
                const title = bid.job_title || 'Freelance Proposal';
                const company = bid.company || bid.client_name || '—';
                const pkg = formatPackageName(bid.package);
                const amount = Number(bid.bid_amount || 0);

                return (
                  <tr
                    key={bid.id || `bid-${index}`}
                    onClick={() => onSelectBid && onSelectBid(bid)}
                    className="hover:bg-[#161e31]/80 transition-colors group cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-medium text-white max-w-[280px]">
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
                          <span>View Project</span>
                          <i className="fas fa-external-link-alt text-[8px]"></i>
                        </a>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <i className="far fa-building text-slate-500 text-[10px]"></i>
                        {company}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-indigo-300 font-medium font-mono text-[11.5px]">
                      {pkg}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-sm">
                      ${isNaN(amount) ? '0.00' : amount.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      {renderStatusBadge(bid.status)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11.5px] font-mono">
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
