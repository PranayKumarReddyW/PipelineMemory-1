import { useState } from 'react';
import {
  X, Brain, Sparkles, CheckCircle2, AlertTriangle,
  GitPullRequest, Loader2, ShieldCheck, Flame, ArrowRight
} from 'lucide-react';
import { api } from '../hooks/useApi';

const SERVICES = ['payments', 'auth', 'orders', 'inventory', 'notifications'];
const CHANGE_TYPES = [
  { value: 'code', label: 'Code Feature / Patch' },
  { value: 'db_migration', label: 'Database Migration' },
  { value: 'config', label: 'Config / Secrets' },
  { value: 'dependency', label: 'Dependency Update' },
  { value: 'infra', label: 'Infrastructure Change' },
];

export default function RecordPastPrModal({ isOpen, onClose, onRecorded, initialService = 'payments' }) {
  const [title, setTitle] = useState('');
  const [service, setService] = useState(initialService);
  const [changeType, setChangeType] = useState('db_migration');
  const [status, setStatus] = useState('failed'); // 'failed' | 'success'
  const [rootCause, setRootCause] = useState('');
  const [fixApplied, setFixApplied] = useState('');
  const [author, setAuthor] = useState('Platform Team');
  const [environment, setEnvironment] = useState('production');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a PR title, number, or branch name.');
      return;
    }
    if (status === 'failed' && !rootCause.trim()) {
      setError('Please provide the root cause or hazard for the failed PR.');
      return;
    }
    if (!fixApplied.trim()) {
      setError('Please provide the fix applied or key lesson learned for Hindsight memory.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        title: title.trim(),
        service,
        change_type: changeType,
        status,
        root_cause: rootCause.trim() || undefined,
        fix_applied: fixApplied.trim(),
        author: author.trim() || 'Platform Team',
        environment,
      };

      const res = await api.post('/deployments/record-pr', payload);
      setSuccessData(res);
      if (onRecorded) {
        onRecorded(res.deployment);
      }
    } catch (err) {
      setError(err.message || 'Failed to record PR memory');
    } finally {
      setLoading(false);
    }
  }

  function handleResetAndClose() {
    setTitle('');
    setRootCause('');
    setFixApplied('');
    setSuccessData(null);
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0c1220] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Record Past PR & Train Memory</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  Hindsight Episodic AI
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Feed historical PR outcomes, incidents, and proven fixes so future CI/CD risk gates learn from them
              </p>
            </div>
          </div>

          <button
            onClick={handleResetAndClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {successData ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">PR Successfully Retained in Hindsight</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                This historical PR has been indexed into the vector memory bank. Future branch comparisons and Q&A on <strong className="text-purple-300">{successData.deployment?.service}</strong> will recall this experience.
              </p>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-left font-mono text-xs text-slate-300 space-y-1">
              <div className="text-[11px] text-purple-400 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                Retained Memory Vector
              </div>
              <p className="leading-relaxed text-slate-300">
                {successData.memory?.text}
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={handleResetAndClose}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold border border-slate-700 transition-all"
              >
                Close & Return
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Row 1: Title & Service */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-8">
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                  PR Title / Number / Branch <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <GitPullRequest className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. PR #42: Unindexed Table Lock Migration in Payments"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                  Target Service <span className="text-rose-400">*</span>
                </label>
                <select
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                >
                  {SERVICES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Change Type & Outcome Status */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6">
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                  Change Type
                </label>
                <select
                  value={changeType}
                  onChange={(e) => setChangeType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                >
                  {CHANGE_TYPES.map(ct => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-6">
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                  Historical Outcome Status <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus('failed')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                      status === 'failed'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 ring-1 ring-rose-500/30'
                        : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    Failed / Incident
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatus('success')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                      status === 'success'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500/30'
                        : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Passed / Clean
                  </button>
                </div>
              </div>
            </div>

            {/* Root Cause (If failed) */}
            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                {status === 'failed' ? 'Hazard / Outage Root Cause' : 'Context / What Was Changed'}
              </label>
              <textarea
                rows={2}
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                placeholder={status === 'failed'
                  ? 'e.g. Exclusive table lock via ALTER TABLE DROP COLUMN on 10M rows caused 14 min connection pool timeout.'
                  : 'e.g. Added non-blocking index and circuit breaker with 500ms fallback.'
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono leading-relaxed"
              />
            </div>

            {/* Fix Applied & Lesson Learned */}
            <div>
              <label className="block text-xs font-mono text-purple-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Proven Fix & Lesson Learned (Trained into Hindsight) <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={fixApplied}
                onChange={(e) => setFixApplied(e.target.value)}
                placeholder="e.g. Always use CREATE INDEX CONCURRENTLY, avoid synchronous blocking queries in Node.js event loop, and set statement_timeout = 2s."
                className="w-full bg-slate-900 border border-purple-500/40 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono leading-relaxed"
              />
            </div>

            {/* Optional Author & Env */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                  Author / Committer
                </label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                  Environment
                </label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-purple-500 font-mono"
                >
                  <option value="production">production</option>
                  <option value="staging">staging</option>
                </select>
              </div>
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-purple-500/20 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Indexing into Memory...</span>
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4 text-purple-200" />
                    <span>Train into Hindsight Memory</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
