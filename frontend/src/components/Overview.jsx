/**
 * Overview — executive intelligence dashboard.
 *
 * Real-time deployment telemetry, interactive chart timeframes,
 * service health matrix, and searchable deployment activity feed.
 */

import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import {
  CheckCircle2, XCircle, Clock, AlertTriangle,
  TrendingUp, Activity, Search, ArrowUpRight,
  ShieldAlert, Sparkles, Filter, ExternalLink, RefreshCw, Wrench
} from 'lucide-react';
import { api } from '../hooks/useApi';
import RemediationModal from './RemediationModal';

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [remediatingDep, setRemediatingDep] = useState(null);
  const navigate = useNavigate();

  const loadStats = () => {
    setLoading(true);
    api.get('/stats')
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
  }, []);

  /* Filter deployment days based on timeRange */
  const filteredDays = useMemo(() => {
    if (!stats?.deploys_per_day) return [];
    if (timeRange === 7) return stats.deploys_per_day.slice(-7);
    if (timeRange === 14) return stats.deploys_per_day.slice(-14);
    return stats.deploys_per_day;
  }, [stats, timeRange]);

  /* Filter recent deployments based on search and status */
  const filteredDeploys = useMemo(() => {
    if (!stats?.recent_deploys) return [];
    return stats.recent_deploys.filter(d => {
      const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        d.service.toLowerCase().includes(q) ||
        d.author.toLowerCase().includes(q) ||
        d.change_type.toLowerCase().includes(q) ||
        (d.notes && d.notes.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [stats, searchQuery, statusFilter]);

  if (loading) return <LoadingSkeleton />;
  if (!stats) return <EmptyState onRetry={loadStats} />;

  return (
    <div className="space-y-5 w-full max-w-full min-w-0">

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 min-w-0">
        <KpiCard
          icon={CheckCircle2}
          iconColor="text-emerald-400"
          label="Deployment Success Rate"
          value={`${stats.success_rate}%`}
          sub={`${stats.success_count} passed · ${stats.failed_count} failed`}
          trend="+4.2% vs last month"
          trendPositive={true}
        />
        <KpiCard
          icon={Clock}
          iconColor="text-blue-400"
          label="Mean Time to Recover"
          value={`${stats.mttr}m`}
          sub="Semantic playbook retrieval"
          trend="-28% MTTR reduction"
          trendPositive={true}
        />
        <KpiCard
          icon={XCircle}
          iconColor="text-rose-400"
          label="Failures This Week"
          value={stats.failures_this_week}
          sub={`${stats.total_incidents} incidents recorded`}
          trend={null}
          trendPositive={null}
        />
        <KpiCard
          icon={AlertTriangle}
          iconColor="text-amber-400"
          label="Highest Risk Surface"
          value={stats.riskiest_service?.service || 'N/A'}
          sub={`${stats.riskiest_service?.failure_rate}% failure rate`}
          trend="Blast Radius: 3 downstream"
          trendPositive={false}
          action={() => navigate('/graph')}
        />
      </div>

      {/* Charts & Service Breakdown Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 min-w-0">
        {/* Deployment Activity Chart */}
        <div className="lg:col-span-2 glass-panel p-5 sm:p-6 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-white">Deployment Velocity & Outcomes</h2>
              <p className="text-xs text-gray-400 mt-0.5">Tracking successes vs rollbacks across continuous integration</p>
            </div>

            {/* Timeframe pill selector */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-dark-950/80 border border-white/[0.08]">
              {[7, 14, 30].map(days => (
                <button
                  key={days}
                  onClick={() => setTimeRange(days)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${timeRange === days
                      ? 'bg-pipeline-600 text-white shadow-sm shadow-pipeline-500/30'
                      : 'text-gray-400 hover:text-white'
                    }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>

          {filteredDays.length > 0 ? (
            <div className="h-64 sm:h-72 w-full min-w-0 overflow-hidden">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={filteredDays} barGap={3}>
                  <defs>
                    <linearGradient id="barSuccess" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="barFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    allowDecimals={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="successes" name="Success" stackId="a" fill="url(#barSuccess)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="failures" name="Failed" stackId="a" fill="url(#barFailed)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
              No deployments recorded in this window
            </div>
          )}

          {/* Chart footer legend */}
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/[0.06] text-xs text-gray-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-sm" />
                Successful Deploys
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500 shadow-sm" />
                Failed / Blocked
              </span>
            </div>
          </div>
        </div>

        {/* Service Fragility & Health Breakdown */}
        <div className="glass-panel p-5 sm:p-6 flex flex-col justify-between min-w-0 overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white">Service Health Matrix</h2>
                <p className="text-xs text-gray-400 mt-0.5">Reliability index per microservice</p>
              </div>
              <button
                onClick={() => navigate('/graph')}
                className="text-xs text-pipeline-400 hover:text-pipeline-300 font-medium flex items-center gap-1"
              >
                <span>Topology</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-3.5">
              {stats.deploys_per_service.map((svc) => {
                const rate = svc.total > 0 ? Math.round((svc.successes / svc.total) * 100) : 0;
                const isRisky = rate < 70;
                return (
                  <div
                    key={svc.service}
                    onClick={() => navigate('/graph')}
                    className="p-2.5 rounded-xl bg-dark-950/50 hover:bg-dark-950/80 border border-white/[0.04] hover:border-pipeline-500/30 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-gray-200 group-hover:text-pipeline-300 transition-colors font-mono">
                        {svc.service}
                      </span>
                      <span className={`text-[11px] font-mono font-bold ${rate >= 80 ? 'text-emerald-400' : rate >= 60 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                        {rate}% pass ({svc.total} deploys)
                      </span>
                    </div>

                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${rate}%`,
                          background: rate >= 80
                            ? 'linear-gradient(90deg, #10b981, #34d399)'
                            : rate >= 60
                              ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                              : 'linear-gradient(90deg, #ef4444, #f87171)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.06] mt-4">
            <button
              onClick={() => navigate('/patterns')}
              className="w-full btn-outline text-xs py-2 flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-pipeline-400" />
              <span>View Discovered Failure Patterns</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Deployments Table */}
      <div className="glass-panel p-5 sm:p-6 space-y-4 min-w-0 max-w-full overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Continuous Deployment Activity</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Showing {filteredDeploys.length} of {stats.recent_deploys.length} historical release records
            </p>
          </div>

          {/* Search & Status Filter */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Search service, author, note..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input text-xs pl-8 py-1.5 w-44 sm:w-56"
              />
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-dark-950/80 border border-white/[0.08]">
              {['all', 'success', 'failed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium capitalize transition-colors ${statusFilter === st
                      ? 'bg-pipeline-600 text-white'
                      : 'text-gray-400 hover:text-white'
                    }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-white/[0.06] w-full max-w-full">
          <table className="w-full text-xs text-left min-w-[700px]">
            <thead>
              <tr className="bg-white/[0.03] text-gray-400 font-semibold uppercase tracking-wider border-b border-white/[0.08]">
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-4">Version</th>
                <th className="py-3 px-4">Author</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Changes</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Notes / Root Cause</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredDeploys.map((d) => (
                <tr key={d.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="py-3 px-4 font-semibold text-white font-mono flex items-center gap-2">
                    <span className={`status-dot status-dot-${d.status}`} />
                    <span>{d.service}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-gray-300">v{d.version}</td>
                  <td className="py-3 px-4 text-gray-300 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-pipeline-600/30 text-pipeline-300 flex items-center justify-center text-[10px] uppercase font-bold">
                        {d.author.slice(0, 2)}
                      </span>
                      <span>{d.author}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/[0.05] text-gray-300 border border-white/[0.06]">
                      {d.change_type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-400 font-mono">
                    {d.lines_changed} lines · {d.files_changed} files
                  </td>
                  <td className="py-3 px-4">
                    <span className={`badge badge-${d.status}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-300 max-w-xs truncate" title={d.notes || 'Normal deployment'}>
                    {d.notes || <span className="text-gray-600">Standard release</span>}
                  </td>
                  <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                    {new Date(d.timestamp).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {(d.status === 'failed' || d.status === 'rolled_back') && (
                        <button
                          onClick={() => setRemediatingDep(d)}
                          className="btn-outline text-[11px] py-0.5 px-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 flex items-center gap-1 transition-all"
                          title="Record fix steps and feed them into Hindsight AI memory to pass future builds green"
                        >
                          <Wrench className="w-3 h-3 text-emerald-400" />
                          <span>Pass Green</span>
                        </button>
                      )}
                      <button
                        onClick={() => navigate('/compare', { state: { service: d.service } })}
                        className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost text-[11px] py-1 px-2 text-pipeline-400 hover:text-white flex items-center gap-1"
                        title="Inspect risk profile for this change"
                      >
                        <span>Analyze</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remediation Modal */}
      <RemediationModal
        deployment={remediatingDep}
        isOpen={!!remediatingDep}
        onClose={() => setRemediatingDep(null)}
        onResolved={() => {
          loadStats();
          setRemediatingDep(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function KpiCard({ icon: Icon, iconColor, label, value, sub, trend, trendPositive, action }) {
  return (
    <div
      onClick={action}
      className={`glass-card p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors ${action ? 'cursor-pointer hover:bg-slate-800/20' : ''
        }`}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-semibold text-slate-400 font-mono tracking-wider uppercase">{label}</span>
        <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        </div>
      </div>
      <p className="text-2xl font-bold font-mono text-white tracking-tight">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      {trend && (
        <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
          <span className={`${trendPositive === true ? 'text-emerald-400 font-medium' : trendPositive === false ? 'text-rose-400 font-medium' : 'text-slate-400'
            }`}>
            {trend}
          </span>
          <span className="text-slate-400">Baseline</span>
        </div>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const successes = payload.find(p => p.dataKey === 'successes')?.value || 0;
  const failures = payload.find(p => p.dataKey === 'failures')?.value || 0;
  const total = successes + failures;

  return (
    <div className="glass-panel p-3 border border-white/[0.12] rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[150px]">
      <div className="font-semibold text-white border-b border-white/[0.08] pb-1">
        {new Date(label).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>
      <div className="flex items-center justify-between text-gray-300">
        <span className="flex items-center gap-1 text-emerald-400 font-medium">● Successes:</span>
        <span className="font-mono font-bold text-white">{successes}</span>
      </div>
      <div className="flex items-center justify-between text-gray-300">
        <span className="flex items-center gap-1 text-red-400 font-medium">● Failures:</span>
        <span className="font-mono font-bold text-white">{failures}</span>
      </div>
      <div className="flex items-center justify-between text-gray-400 pt-1 border-t border-white/[0.06] font-mono text-[10px]">
        <span>Total Deploys:</span>
        <span>{total}</span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-card p-5">
            <div className="skeleton h-4 w-24 mb-3" />
            <div className="skeleton h-8 w-20 mb-2" />
            <div className="skeleton h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 glass-panel p-6">
          <div className="skeleton h-72 w-full" />
        </div>
        <div className="glass-panel p-6">
          <div className="skeleton h-72 w-full" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onRetry }) {
  return (
    <div className="glass-panel p-16 flex flex-col items-center justify-center text-center rounded-2xl">
      <Activity className="w-12 h-12 text-gray-600 mb-4" />
      <h2 className="text-lg font-bold text-white">No deployment records found</h2>
      <p className="text-sm text-gray-400 mt-1 max-w-sm mb-4">
        Run the seed command in the backend or click below to populate the telemetry database.
      </p>
      <button onClick={onRetry} className="btn-primary text-xs flex items-center gap-2">
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Reload Dashboard</span>
      </button>
    </div>
  );
}
