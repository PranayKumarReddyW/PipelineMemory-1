/**
 * Learned Patterns — autonomous pattern discovery & memory extraction.
 *
 * Discovers statistical failure correlations across deployment history.
 * Supports both rich Knowledge Card Grid and dense Data Table views with filtering.
 */

import { useEffect, useState, useMemo } from 'react';
import {
  BrainCircuit, RefreshCcw, Loader2, Zap, TrendingUp,
  Search, ShieldAlert, LayoutGrid, List, CheckCircle2,
  AlertTriangle, Filter, Sparkles, Brain
} from 'lucide-react';
import { api } from '../hooks/useApi';

export default function LearnedPatterns() {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [searchQuery, setSearchQuery] = useState('');
  const [multiplierFilter, setMultiplierFilter] = useState('all'); // 'all' | 'critical' | 'high' | 'moderate'

  const fetchPatterns = () => {
    setLoading(true);
    api.get('/patterns')
      .then(data => setPatterns(data.patterns || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPatterns();
  }, []);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const data = await api.post('/patterns/recompute', {});
      setPatterns(data.patterns || []);
    } catch (err) {
      console.error(err);
    } finally {
      setRecomputing(false);
    }
  };

  /* Filtering */
  const filteredPatterns = useMemo(() => {
    return patterns.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        p.pattern_description.toLowerCase().includes(q) ||
        (p.service && p.service.toLowerCase().includes(q)) ||
        (p.root_cause && p.root_cause.toLowerCase().includes(q)) ||
        (p.prevention_playbook && p.prevention_playbook.toLowerCase().includes(q)) ||
        (p.change_type && p.change_type.toLowerCase().includes(q));

      let matchesMultiplier = true;
      if (multiplierFilter === 'critical') matchesMultiplier = p.risk_multiplier >= 2.0;
      else if (multiplierFilter === 'high') matchesMultiplier = p.risk_multiplier >= 1.5 && p.risk_multiplier < 2.0;
      else if (multiplierFilter === 'moderate') matchesMultiplier = p.risk_multiplier < 1.5;

      return matchesSearch && matchesMultiplier;
    });
  }, [patterns, searchQuery, multiplierFilter]);

  const multiplierBadge = (m) => {
    if (m >= 2.0) return 'text-rose-400 bg-rose-500/10 border-rose-500/25';
    if (m >= 1.5) return 'text-orange-400 bg-orange-500/10 border-orange-500/25';
    if (m >= 1.2) return 'text-amber-400 bg-amber-500/10 border-amber-500/25';
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-56" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Autonomous Failure Patterns</h1>
            <span className="live-pill text-[10px]">{patterns.length} Patterns Active</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Statistical failure models extracted by the agent from company deployment logs with root cause diagnoses and playbooks
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
          >
            {recomputing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span>{recomputing ? 'Mining Patterns...' : 'Recompute Memory Patterns'}</span>
          </button>
        </div>
      </div>

      {/* Filter and View Controls Bar */}
      <div className="glass-panel p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search pattern rules, root causes, playbooks, or services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input text-xs pl-8 py-1.5 w-full"
          />
        </div>

        {/* Filter Pills + View Switcher */}
        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {/* Multiplier Filter */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0a0f1d] border border-slate-800">
            {[
              { id: 'all', label: 'All' },
              { id: 'critical', label: 'Critical ≥2.0×' },
              { id: 'high', label: 'High ≥1.5×' },
              { id: 'moderate', label: 'Moderate' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setMultiplierFilter(f.id)}
                className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${multiplierFilter === f.id
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      {filteredPatterns.length === 0 ? (
        <div className="glass-panel p-16 flex flex-col items-center justify-center text-center rounded-xl border border-slate-800">
          <BrainCircuit className="w-10 h-10 text-slate-600 mb-2.5" />
          <h3 className="text-sm font-semibold text-white">No matching patterns</h3>
          <p className="text-xs text-slate-400 mt-0.5">Try clearing your search query or filters.</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* Cards Grid View */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredPatterns.map((p) => (
            <div
              key={p.id}
              className="glass-card p-5 rounded-xl border border-slate-800/90 hover:border-slate-700/80 transition-all flex flex-col justify-between space-y-3.5 bg-slate-900/40"
            >
              <div>
                {/* Card Top: Severity + Multiplier + Confidence + Service */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${p.severity === 'critical'
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}>
                      <ShieldAlert className="w-3 h-3" />
                      {p.severity?.toUpperCase() || 'HIGH'}
                    </span>

                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border font-mono ${multiplierBadge(p.risk_multiplier)}`}>
                      <TrendingUp className="w-3 h-3" />
                      ×{p.risk_multiplier} Multiplier
                    </span>

                    {p.confidence_pct && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold">
                        {p.confidence_pct}% Confidence
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {p.service && (
                      <span className="text-[10px] font-mono font-bold text-white px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/25">
                        {p.service}
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 font-semibold">
                      {p.change_type || 'all'}
                    </span>
                  </div>
                </div>

                {/* Pattern Title */}
                <div className="mt-3">
                  <div className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <h3 className="text-sm font-bold text-white leading-snug">
                      {p.pattern_description}
                    </h3>
                  </div>
                </div>

                {/* Root Cause Diagnosis */}
                {p.root_cause && (
                  <div className="mt-3 p-3 rounded-lg text-xs bg-slate-950/70 border border-slate-800/80 text-slate-300">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-semibold mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      Root Cause & Operational Hazard:
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300 font-sans">
                      {p.root_cause}
                    </p>
                  </div>
                )}

                {/* Prevention Playbook */}
                {p.prevention_playbook && (
                  <div className="mt-2.5 p-3 rounded-lg text-xs bg-emerald-500/[0.08] border border-emerald-500/25 text-emerald-200">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 font-semibold mb-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Preventative Guardrail & Playbook:
                    </div>
                    <p className="text-xs leading-relaxed text-emerald-100 font-sans">
                      {p.prevention_playbook}
                    </p>
                  </div>
                )}

                {/* Blast Radius */}
                {p.blast_radius && (
                  <div className="mt-2.5 text-[11px] font-mono text-slate-400 flex items-center gap-1.5 px-1">
                    <span className="text-slate-500 font-semibold">Blast Radius:</span>
                    <span className="text-slate-300">{p.blast_radius}</span>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span>{p.evidence_count} historical incidents verified</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  Pattern #{p.id}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Dense Data Table View */
        <div className="glass-panel overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-900/60 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 font-mono text-[11px]">
                <th className="py-2.5 px-3.5">#</th>
                <th className="py-2.5 px-3.5">Pattern Rule & Root Cause</th>
                <th className="py-2.5 px-3.5">Target Service</th>
                <th className="py-2.5 px-3.5">Change Type</th>
                <th className="py-2.5 px-3.5 text-center">Multiplier</th>
                <th className="py-2.5 px-3.5 text-center">Confidence</th>
                <th className="py-2.5 px-3.5 text-center">Incidents</th>
                <th className="py-2.5 px-3.5">Preventative Playbook</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredPatterns.map((p, i) => (
                <tr key={p.id} className="hover:bg-slate-800/20 transition-colors group">
                  <td className="py-3 px-3.5 text-slate-500 font-mono">{i + 1}</td>
                  <td className="py-3 px-3.5 font-medium text-slate-200 max-w-sm">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                        <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span>{p.pattern_description}</span>
                      </div>
                      {p.root_cause && (
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {p.root_cause}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3.5 font-mono text-slate-300 font-semibold">
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px]">
                      {p.service || 'global'}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 font-mono text-slate-400 text-xs">
                    {p.change_type || 'all'}
                  </td>
                  <td className="py-3 px-3.5 text-center font-mono">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${multiplierBadge(p.risk_multiplier)}`}>
                      ×{p.risk_multiplier}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-center font-mono text-purple-300 font-semibold text-xs">
                    {p.confidence_pct ? `${p.confidence_pct}%` : '85%'}
                  </td>
                  <td className="py-3 px-3.5 text-center font-mono text-slate-300">
                    {p.evidence_count}
                  </td>
                  <td className="py-3 px-3.5 max-w-xs text-xs">
                    <p className="text-[11px] text-emerald-300 leading-snug line-clamp-2 font-mono">
                      {p.prevention_playbook || 'Enforce pre-flight staging verification'}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
