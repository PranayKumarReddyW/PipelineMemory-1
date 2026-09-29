import { useState } from 'react';
import {
  X, CheckCircle2, Wrench, Clock, ShieldCheck,
  AlertTriangle, Loader2, Brain, ArrowRight
} from 'lucide-react';
import { api } from '../hooks/useApi';

export default function RemediationModal({ deployment, isOpen, onClose, onResolved }) {
  const [fixApplied, setFixApplied] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [timeToResolve, setTimeToResolve] = useState('15');
  const [preventativeAction, setPreventativeAction] = useState('');
  const [markGreen, setMarkGreen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !deployment) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fixApplied.trim()) {
      setError('Please provide the fix or remediation steps applied to pass the build green.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await api.post(`/deployments/${deployment.id}/resolve`, {
        fix_applied: fixApplied.trim(),
        root_cause: rootCause.trim() || undefined,
        time_to_resolve_min: Number(timeToResolve) || 15,
        preventative_actions: preventativeAction.trim() || undefined,
        mark_green: markGreen,
      });

      if (onResolved) onResolved(data.deployment);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record remediation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl glass-panel p-5 rounded-xl border border-slate-700 bg-[#0c1220] shadow-modal my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Record Remediation & Retain Memory</h2>
              <p className="text-xs text-slate-400">Index proven fixes into Hindsight AI Memory to pass future builds green</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Deployment Context Tag */}
        <div className="my-3.5 p-3 rounded-lg bg-[#080c14] border border-slate-800 text-xs space-y-1">
          <div className="flex items-center justify-between font-mono">
            <span className="font-semibold text-white">Deploy #{deployment.id} ({deployment.service})</span>
            <span className="text-slate-400">v{deployment.version} · {deployment.change_type}</span>
          </div>
          {deployment.notes && (
            <p className="text-slate-400 text-[11px] truncate">
              Original Note: {deployment.notes}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label text-emerald-400 flex items-center gap-1.5">
              <span>* Remediation Steps / Fix Applied to Turn Green</span>
            </label>
            <textarea
              required
              rows={3}
              value={fixApplied}
              onChange={(e) => setFixApplied(e.target.value)}
              placeholder="e.g. Injected 'SET lock_timeout = 2s;' and ran partition creation in 2 staged batches with CONCURRENT index creation..."
              className="form-input text-xs resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Identified Root Cause</label>
              <input
                type="text"
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                placeholder="e.g. Unindexed foreign key table lock"
                className="form-input text-xs"
              />
            </div>
            <div>
              <label className="form-label">Time to Resolve (min)</label>
              <input
                type="number"
                min="1"
                value={timeToResolve}
                onChange={(e) => setTimeToResolve(e.target.value)}
                className="form-input text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Preventative Guardrail / Rule Adopted</label>
            <input
              type="text"
              value={preventativeAction}
              onChange={(e) => setPreventativeAction(e.target.value)}
              placeholder="e.g. Added CI linter requiring lock_timeout on large migrations"
              className="form-input text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="markGreen"
              checked={markGreen}
              onChange={(e) => setMarkGreen(e.target.checked)}
              className="rounded bg-dark-950 border-white/[0.2] text-emerald-500 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="markGreen" className="text-xs text-gray-300 cursor-pointer">
              Mark this deployment status as <strong className="text-emerald-400">Resolved Green</strong>
            </label>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <Brain className="w-3.5 h-3.5 text-pipeline-400" />
              <span>Indexes into Hindsight bank immediately</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost text-xs px-3.5 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary text-xs py-2 px-4 shadow-emerald-500/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Feeding Memory...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Save & Learn Green Fix</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
