/**
 * Timeline — chronological audit log of deployments and infrastructure changes.
 *
 * Full-text search, multi-type filtering, author badges, and root cause diagnosis.
 */

import { useEffect, useState, useMemo } from 'react';
import {
  Rocket, XOctagon, RotateCcw, Server,
  Filter, ChevronDown, Search,
  Clock, GitCommit, AlertTriangle, Layers, Wrench, CheckCircle2, Brain, Flame
} from 'lucide-react';
import { api } from '../hooks/useApi';
import RemediationModal from './RemediationModal';
import RecordPastPrModal from './RecordPastPrModal';

const STATUS_CONFIG = {
  success:     { color: 'emerald', icon: Rocket,     label: 'Deployed' },
  failed:      { color: 'red',     icon: XOctagon,   label: 'Rollout Failed' },
  rolled_back: { color: 'amber',   icon: RotateCcw,  label: 'Rolled Back' },
};

export default function Timeline() {
  const [deployments, setDeployments] = useState([]);
  const [infraChanges, setInfraChanges] = useState([]);
  const [isPrModalOpen, setIsPrModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('all'); // 'all' | 'deploy' | 'infra' | 'failure'
  const [serviceFilter, setServiceFilter] = useState('');
  const [remediatingDep, setRemediatingDep] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/deployments?limit=100'),
      api.get('/infra-changes?limit=50'),
    ])
      .then(([depData, infraData]) => {
        setDeployments(depData.deployments || []);
        setInfraChanges(infraData.changes || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleResolved = (updatedDep) => {
    setDeployments(prev => prev.map(d => d.id === updatedDep.id ? { ...d, ...updatedDep, status: 'success' } : d));
  };

  /* Merge and sort events */
  const events = useMemo(() => {
    return [
      ...deployments.map(d => ({ ...d, eventType: 'deployment', sortTime: d.timestamp })),
      ...infraChanges.map(ic => ({ ...ic, eventType: 'infra', sortTime: ic.timestamp })),
    ].sort((a, b) => new Date(b.sortTime) - new Date(a.sortTime));
  }, [deployments, infraChanges]);

  /* Filtering */
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      // Type filter
      if (eventTypeFilter === 'deploy' && e.eventType !== 'deployment') return false;
      if (eventTypeFilter === 'infra' && e.eventType !== 'infra') return false;
      if (eventTypeFilter === 'failure' && (e.eventType !== 'deployment' || (e.status !== 'failed' && e.status !== 'rolled_back'))) return false;

      // Service filter
      if (serviceFilter) {
        if (e.eventType === 'deployment' && e.service !== serviceFilter) return false;
        if (e.eventType === 'infra' && e.linked_service !== serviceFilter) return false;
      }

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const textToMatch = [
          e.service,
          e.author,
          e.notes,
          e.change_description,
          e.resource,
          e.version,
        ].filter(Boolean).join(' ').toLowerCase();

        if (!textToMatch.includes(q)) return false;
      }

      return true;
    });
  }, [events, eventTypeFilter, serviceFilter, searchQuery]);

  const allServices = useMemo(() => {
    return [...new Set(deployments.map(d => d.service))].sort();
  }, [deployments]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Event Timeline</h1>
            <span className="live-pill text-[10px]">{filteredEvents.length} Events Logged</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Chronological audit of code deployments, build failures, and cloud infrastructure changes
          </p>
        </div>

        {/* Actions & Filters */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsPrModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-purple-500/20 transition-all cursor-pointer"
          >
            <Brain className="w-3.5 h-3.5 text-purple-200" />
            <span>+ Record Past PR</span>
          </button>

          <div className="relative">
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="form-select text-xs pr-8 py-2 w-36"
            >
              <option value="">All Services</option>
              {allServices.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel p-4 rounded-2xl border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search commits, authors, versions, or outage notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input text-xs pl-8 py-1.5 w-full"
          />
        </div>

        {/* Event Type Filter Pills */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0a0f1d] border border-slate-800">
          {[
            { id: 'all', label: 'All Events' },
            { id: 'deploy', label: 'Deployments' },
            { id: 'failure', label: 'Failures & Rollbacks' },
            { id: 'infra', label: 'Infra Changes' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setEventTypeFilter(f.id)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                eventTypeFilter === f.id
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Stream */}
      {filteredEvents.length === 0 ? (
        <div className="glass-panel p-16 text-center rounded-xl border border-slate-800">
          <Filter className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-300 font-medium text-sm">No events match the active criteria</p>
          <p className="text-xs text-slate-500 mt-1">Try resetting the filters or clearing the search query.</p>
        </div>
      ) : (
        <div className="relative pl-6 sm:pl-8">
          {/* Vertical clean hairline connecting line */}
          <div className="absolute left-3 sm:left-4 top-2 bottom-2 w-px bg-slate-800" />

          <div className="space-y-3.5">
            {filteredEvents.map((event, i) => (
              <TimelineCard
                key={`${event.eventType}-${event.id}-${i}`}
                event={event}
                onRemediate={(dep) => setRemediatingDep(dep)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Remediation Modal for recording fixes and passing green */}
      <RemediationModal
        deployment={remediatingDep}
        isOpen={!!remediatingDep}
        onClose={() => setRemediatingDep(null)}
        onResolved={handleResolved}
      />

      {/* Record Past PR Modal for feeding historical outcomes into Hindsight */}
      <RecordPastPrModal
        isOpen={isPrModalOpen}
        onClose={() => setIsPrModalOpen(false)}
        onRecorded={(newDep) => {
          setDeployments(prev => [newDep, ...prev]);
        }}
      />
    </div>
  );
}

function TimelineCard({ event, onRemediate }) {
  const [showDiff, setShowDiff] = useState(false);

  if (event.eventType === 'infra') {
    return (
      <div className="relative pl-5 animate-fade-in group">
        {/* Node Dot */}
        <div className="absolute -left-5 sm:-left-6 top-4 w-2.5 h-2.5 rounded-full bg-blue-400 border-2 border-[#090d16] z-10" />

        <div className="glass-card p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider font-mono">Infra Change</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-300 font-mono border border-blue-500/20">
                {event.resource}
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {new Date(event.timestamp).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          </div>

          <p className="text-xs text-slate-200 font-medium">{event.change_description}</p>
          <div className="mt-2 text-[11px] text-slate-400 font-mono flex items-center gap-2">
            <span>Linked Service: {event.linked_service || 'global'}</span>
          </div>
        </div>
      </div>
    );
  }

  const config = STATUS_CONFIG[event.status] || STATUS_CONFIG.success;
  const Icon = config.icon;
  const isFailure = event.status === 'failed' || event.status === 'rolled_back';

  return (
    <div className="relative pl-5 animate-fade-in group">
      {/* Node Dot */}
      <div className={`absolute -left-5 sm:-left-6 top-4 w-2.5 h-2.5 rounded-full border-2 border-[#090d16] z-10 ${
        event.status === 'failed'
          ? 'bg-rose-400 ring-2 ring-rose-500/20'
          : event.status === 'rolled_back'
          ? 'bg-amber-400 ring-2 ring-amber-500/20'
          : 'bg-emerald-400 ring-2 ring-emerald-500/20'
      }`} />

      <div className={`glass-card p-4 rounded-xl border transition-all ${
        isFailure
          ? 'border-rose-500/30 bg-rose-950/[0.12] hover:border-rose-500/50'
          : 'border-slate-800/80 hover:border-slate-700 bg-slate-900/40'
      }`}>
        {/* Top Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge badge-${event.status}`}>
              <Icon className="w-3 h-3" />
              <span>{config.label}</span>
            </span>

            <span className="font-bold text-white font-mono text-sm tracking-tight">{event.service}</span>
            <span className="text-xs font-mono text-slate-300 bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700/60 font-semibold">
              {event.version}
            </span>

            {/* Environment Badge */}
            <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-semibold border ${
              event.environment === 'production'
                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
            }`}>
              {event.environment || 'production'}
            </span>

            {/* Incident Severity if present */}
            {event.incident_severity && (
              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${
                event.incident_severity === 'critical'
                  ? 'bg-rose-600/20 text-rose-300 border-rose-500/50 animate-pulse'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}>
                {event.incident_severity} SEVERITY
              </span>
            )}

            {/* Failure Stage */}
            {event.failure_stage && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                stage: {event.failure_stage}
              </span>
            )}
          </div>

          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-slate-500" />
            {new Date(event.timestamp).toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })}
          </span>
        </div>

        {/* Change Metadata Stats */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono my-2 pb-2 border-b border-slate-800/60">
          <span className="bg-slate-800/80 px-2 py-0.5 rounded text-slate-200 border border-slate-700/60 font-semibold">
            {event.change_type}
          </span>
          <span className="text-slate-300">{event.lines_changed} lines · {event.files_changed} files</span>
          {event.duration_sec && <span>Duration: {event.duration_sec}s</span>}
          {event.time_to_resolve_min && (
            <span className="text-amber-400 font-semibold">MTTR: {event.time_to_resolve_min}m</span>
          )}
          <span>by <strong className="text-slate-200">@{event.author}</strong></span>
        </div>

        {/* PR / Commit Summary Notes */}
        {event.notes && (
          <p className="text-xs text-slate-200 font-medium my-1.5 leading-relaxed">
            {event.notes}
          </p>
        )}

        {/* Incident Summary */}
        {event.incident_summary && (
          <div className="mt-2.5 p-2.5 rounded-lg text-xs bg-rose-500/10 text-rose-200 border border-rose-500/30 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-[11px] text-rose-300 font-mono uppercase tracking-wider">
                Production Outage Summary:
              </span>
              <span className="leading-relaxed text-xs">{event.incident_summary}</span>
            </div>
          </div>
        )}

        {/* Failure Error Snippet */}
        {event.failure_error && (
          <div className="mt-2 p-2.5 rounded-lg bg-black/60 border border-rose-500/20 font-mono text-[11px] text-rose-300/90 leading-relaxed overflow-x-auto">
            <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-0.5">
              Runtime Error Trace:
            </div>
            {event.failure_error}
          </div>
        )}

        {/* Root Cause Diagnosis */}
        {event.root_cause && (
          <div className="mt-2 p-2.5 rounded-lg text-xs bg-amber-500/10 text-amber-200 border border-amber-500/25 flex items-start gap-2">
            <Flame className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-[11px] text-amber-300 font-mono uppercase tracking-wider">
                Root Cause Diagnosis:
              </span>
              <span className="leading-relaxed text-xs text-amber-100">{event.root_cause}</span>
            </div>
          </div>
        )}

        {/* Resolved Fix Playbook Callout */}
        {event.fix_applied && (
          <div className="mt-2 p-2.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-200 border border-emerald-500/25 flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-[11px] text-emerald-300 font-mono uppercase tracking-wider">
                Applied Green Fix Playbook (Hindsight Retained):
              </span>
              <span className="leading-relaxed text-xs text-emerald-100">{event.fix_applied}</span>
            </div>
          </div>
        )}

        {/* Expandable Code Diff Viewer */}
        {event.diff && (
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => setShowDiff(!showDiff)}
              className="text-[11px] font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1.5 cursor-pointer"
            >
              <GitCommit className="w-3 h-3" />
              <span>{showDiff ? 'Hide Patch Diff ▲' : 'View Patch Diff ▼'}</span>
            </button>

            {showDiff && (
              <pre className="mt-2 p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 leading-relaxed whitespace-pre">
                {event.diff}
              </pre>
            )}
          </div>
        )}

        {/* Actions bar at bottom */}
        <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <span className="text-[10px] text-slate-500 font-mono">Deployment #{event.id}</span>
          <div className="flex items-center gap-2">
            {isFailure && !event.fix_applied && (
              <button
                onClick={() => onRemediate(event)}
                className="btn-outline text-[11px] py-1 px-2.5 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Record resolution steps and feed them into Hindsight AI Memory to pass future builds green"
              >
                <Wrench className="w-3 h-3 text-emerald-400" />
                <span>Record Fix / Pass Green</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
