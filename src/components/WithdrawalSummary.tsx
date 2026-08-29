import React from 'react';
import { BackendBidItem, BackendStats } from '../services/api';

interface WithdrawalSummaryProps {
  bids: BackendBidItem[];
  stats?: BackendStats | null;
  onWithdrawPlatform?: (platform: string, amount: number) => void;
}

export const WithdrawalSummary: React.FC<WithdrawalSummaryProps> = ({
  bids,
  stats,
  onWithdrawPlatform,
}) => {
  // Aggregate earnings and won bids by platform
  const platformStats = React.useMemo(() => {
    const summary: Record<
      string,
      {
        name: string;
        platformKey: string;
        wonCount: number;
        earned: number;
        currency: string;
        payoutUrl: string;
        icon: string;
        badgeColor: string;
        btnBorder: string;
        btnText: string;
        payoutMethod: string;
        feeRate: string;
      }
    > = {
      freelancer: {
        name: 'Freelancer.com',
        platformKey: 'freelancer',
        wonCount: 0,
        earned: 0,
        currency: 'USD',
        payoutUrl: 'https://www.freelancer.com/dashboard/financial/',
        icon: 'fas fa-globe text-sky-400',
        badgeColor: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
        btnBorder: 'border-sky-500/40 hover:border-sky-400 text-sky-300 hover:bg-sky-500/10',
        payoutMethod: 'PayPal / Wire / Express Payout',
        feeRate: '0% on verified milestones',
      },
      upwork: {
        name: 'Upwork',
        platformKey: 'upwork',
        wonCount: 0,
        earned: 0,
        currency: 'USD',
        payoutUrl: 'https://www.upwork.com/nx/navigator/payments/withdraw',
        icon: 'fab fa-upwork text-emerald-400',
        badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        btnBorder: 'border-emerald-500/40 hover:border-emerald-400 text-emerald-300 hover:bg-emerald-500/10',
        payoutMethod: 'Direct to Local Bank / PayPal',
        feeRate: 'Weekly scheduled disbursements',
      },
      remoteok: {
        name: 'RemoteOK & Direct Contracts',
        platformKey: 'remoteok',
        wonCount: 0,
        earned: 0,
        currency: 'USD',
        payoutUrl: 'https://www.paypal.com/mep/dashboard',
        icon: 'fas fa-bolt text-rose-400',
        badgeColor: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        btnBorder: 'border-rose-500/40 hover:border-rose-400 text-rose-300 hover:bg-rose-500/10',
        payoutMethod: 'Stripe / PayPal Payouts',
        feeRate: 'Instant Settlement',
      },
    };

    bids.forEach((bid) => {
      const p = (bid.platform || 'freelancer').toLowerCase();
      const isWon = ['won', 'awarded', 'accepted', 'completed'].includes((bid.status || '').toLowerCase());
      const amount = Number(bid.bid_amount || 0);

      let key = 'freelancer';
      if (p.includes('upwork')) key = 'upwork';
      else if (p.includes('remote') || p.includes('direct')) key = 'remoteok';

      if (isWon) {
        summary[key].wonCount += 1;
        summary[key].earned += amount;
      }
    });

    // Fallback: if total earned is reported in backend stats, allocate to primary platform
    const totalWonAggregated = Object.values(summary).reduce((acc, p) => acc + p.wonCount, 0);
    const totalEarnedAggregated = Object.values(summary).reduce((acc, p) => acc + p.earned, 0);

    if (totalEarnedAggregated === 0 && (stats?.earned || 0) > 0) {
      summary.freelancer.earned = stats?.earned || 0;
      summary.freelancer.wonCount = stats?.won || 1;
    } else if ((stats?.won || 0) > totalWonAggregated && summary.freelancer.wonCount === 0) {
      summary.freelancer.wonCount = stats?.won || 1;
    }

    return Object.values(summary);
  }, [bids, stats]);

  const totalEarningsAll = platformStats.reduce((acc, p) => acc + p.earned, 0);
  const totalWonContractsAll = platformStats.reduce((acc, p) => acc + p.wonCount, 0);

  const handleWithdrawClick = (platformName: string, payoutUrl: string, amount: number) => {
    if (onWithdrawPlatform) {
      onWithdrawPlatform(platformName, amount);
    }
    window.open(payoutUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div id="withdrawal-summary-section" className="bg-[#111726] rounded-2xl border border-[#1e293b] p-5 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1e293b]/80 mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-sm font-bold border border-emerald-500/25">
              <i className="fas fa-money-bill-transfer"></i>
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Withdrawal Summary &amp; Platform Earnings Hub
            </h3>
            <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border border-emerald-500/20">
              Live Payout Portals
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time gross revenue breakdown, awarded contract counts, and instant withdrawal routing across freelance networks.
          </p>
        </div>

        {/* Global summary badge */}
        <div className="flex items-center gap-3 bg-[#161e31] px-3.5 py-2 rounded-xl border border-[#1e293b]">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Settled</div>
            <div className="text-sm font-mono font-extrabold text-emerald-400">
              ${totalEarningsAll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="h-6 w-px bg-slate-700"></div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Won Jobs</div>
            <div className="text-sm font-mono font-extrabold text-indigo-300">
              {totalWonContractsAll} Awards
            </div>
          </div>
        </div>
      </div>

      {/* Platform Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {platformStats.map((plat) => (
          <div
            key={plat.platformKey}
            className="bg-[#161e31] rounded-xl border border-[#1e293b] p-4 flex flex-col justify-between hover:border-slate-600 transition-all hover:-translate-y-0.5 shadow-md"
          >
            <div>
              {/* Platform Title & Won Badge */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 font-bold text-sm text-white">
                  <i className={plat.icon}></i>
                  <span>{plat.name}</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${plat.badgeColor}`}>
                  {plat.wonCount} Won {plat.wonCount === 1 ? 'Bid' : 'Bids'}
                </span>
              </div>

              {/* Earnings Amount */}
              <div className="mb-3">
                <div className="text-[11px] font-semibold text-slate-400">Accumulated Earnings</div>
                <div className="text-2xl font-extrabold font-mono text-emerald-400 tracking-tight mt-0.5">
                  ${plat.earned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  <span className="text-xs font-normal text-slate-500 font-sans">{plat.currency}</span>
                </div>
              </div>

              {/* Additional Meta info */}
              <div className="space-y-1.5 py-2.5 my-2 border-y border-slate-800/80 text-[11px] text-slate-400">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <i className="fas fa-credit-card text-[10px]"></i> Method:
                  </span>
                  <span className="text-slate-300 font-medium">{plat.payoutMethod}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <i className="fas fa-shield-check text-[10px]"></i> Schedule:
                  </span>
                  <span className="text-slate-300 font-medium">{plat.feeRate}</span>
                </div>
              </div>
            </div>

            {/* Direct Payout Action Button */}
            <div className="mt-3">
              <a
                href={plat.payoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onWithdrawPlatform && onWithdrawPlatform(plat.name, plat.earned)}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer bg-[#0f172a] no-underline ${plat.btnBorder}`}
                title={`Withdraw on ${plat.name}`}
              >
                <i className="fas fa-arrow-up-right-from-square text-[11px]"></i>
                <span>Withdraw on {plat.name}</span>
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Safety & Compliance notice */}
      <div className="mt-4 pt-3 border-t border-[#1e293b]/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11.5px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <i className="fas fa-shield-halved text-emerald-400 text-xs"></i>
          <span>Direct withdrawal portals require authenticated multi-factor login on the respective official partner platforms.</span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          Escrow Protection: Active
        </div>
      </div>
    </div>
  );
};
