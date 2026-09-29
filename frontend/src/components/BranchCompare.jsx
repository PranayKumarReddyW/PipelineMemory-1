/**
 * BranchCompare — Git Branch & PR Risk Gate Intelligence
 *
 * Compares Git branches (local microservices or GitHub remotes),
 * extracts unified code diffs, detects static AST hazards, queries
 * Hindsight episodic memory for historical incident similarity, and
 * delivers automated CI/CD gating verdicts.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  GitBranch, GitPullRequest, ArrowRight, ShieldAlert,
  Zap, AlertTriangle, CheckCircle2, XOctagon, Copy, Check,
  FileCode, Layers, RefreshCw, Loader2, Sparkles, Brain,
  ExternalLink, Code2, Server, FolderGit2, Flame, Wrench,
  ThumbsUp, ThumbsDown, Send, MessageSquare
} from 'lucide-react';
import { api } from '../hooks/useApi';
import RiskGauge from './RiskGauge';
import MarkdownRenderer from './MarkdownRenderer';
import RecordPastPrModal from './RecordPastPrModal';

export default function BranchCompare() {
  const navigate = useNavigate();
  const location = useLocation();

  const [branches, setBranches] = useState([]);
  const [baseBranch, setBaseBranch] = useState('main');
  const [headBranch, setHeadBranch] = useState('feature/db-migration-lock');
  const [isRecordPrOpen, setIsRecordPrOpen] = useState(false);

  // Execution states
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState(null);

  // Results
  const [compareData, setCompareData] = useState(null);
  const [assessmentData, setAssessmentData] = useState(null);
  const [copiedPr, setCopiedPr] = useState(false);

  // Human-in-the-Loop Feedback states
  const [feedbackSatisfaction, setFeedbackSatisfaction] = useState(null); // 'satisfied' | 'not_satisfied' | null
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState(null);

  // Load branches on mount
  useEffect(() => {
    fetchBranches();
  }, []);

  async function fetchBranches() {
    setLoadingBranches(true);
    setError(null);
    try {
      const data = await api.get('/git/branches');
      setBranches(data.branches || []);

      if (data.branches && data.branches.length > 0) {
        if (!data.branches.includes(baseBranch)) {
          setBaseBranch(data.branches.includes('main') ? 'main' : data.branches[0]);
        }

        let targetHead = null;
        if (location.state?.service) {
          const svc = location.state.service.toLowerCase();
          targetHead = data.branches.find(b => b.toLowerCase().includes(svc));
        }

        const selectedHead = targetHead || data.branches.find(b => b.startsWith('feature/') || b.startsWith('fix/')) || data.branches[1] || data.branches[0];
        setHeadBranch(selectedHead);

        if (location.state?.service && selectedHead) {
          handleAssess(selectedHead, 'main');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingBranches(false);
    }
  }

  // Handle Full Risk Assessment (unified git diff + risk calculation + Hindsight search)
  async function handleAssess(head = headBranch, base = baseBranch) {
    if (!head) {
      setError('Please select a target branch to assess.');
      return;
    }

    setAssessing(true);
    setError(null);
    setFeedbackSatisfaction(null);
    setFeedbackText('');
    setFeedbackSubmitted(false);
    setFeedbackResult(null);

    try {
      const payload = {
        base,
        head,
      };
      const res = await api.post('/git/assess', payload);
      setCompareData(res.compare);
      setAssessmentData(res.assessment);
    } catch (err) {
      setError(err.message);
    } finally {
      setAssessing(false);
    }
  }

  const effectiveHead = headBranch;

  async function handleSubmitFeedback(overrideSatisfaction = null) {
    const satisfaction = overrideSatisfaction || feedbackSatisfaction;
    if (!satisfaction) return;

    if (satisfaction === 'not_satisfied' && !feedbackText.trim()) {
      setError('Please provide your reason or domain correction so the agent can learn.');
      return;
    }

    setSubmittingFeedback(true);
    setError(null);
    try {
      const res = await api.post('/git/feedback', {
        service: compareData?.service || 'payments',
        head: effectiveHead,
        base: baseBranch,
        risk_score: assessmentData.risk_score,
        risk_level: assessmentData.risk_level,
        satisfaction,
        feedback_text: feedbackText.trim(),
        author: 'DevOps Engineer',
      });
      setFeedbackSubmitted(true);
      setFeedbackResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingFeedback(false);
    }
  }

  function handleCopyPrComment() {
    if (!assessmentData) return;
    const text = `### 🛡️ PipelineMemory Pre-Flight Risk Assessment
**Evaluated Target:** \`${effectiveHead}\` -> \`${baseBranch}\`
**Risk Index:** ${assessmentData.risk_score}/100 (${assessmentData.risk_level} Risk)
**Gate Verdict:** ${assessmentData.risk_score >= 50 ? '⛔ BLOCKED (Requires Architectural Approval)' : '✅ APPROVED (Passed Auto-Gate)'}

#### ⚠️ Top Risk Drivers:
${(assessmentData.factors || []).map(f => `- **${f.name}**: ${f.detail || 'Evaluated dimension'} (Score: ${Math.round(f.score || 0)}/100, Weight: ${Math.round((f.weight || 0) * 100)}%)`).join('\n')}

${assessmentData.diff_analysis?.findings?.length > 0 ? `#### 🚨 Code Diff Hazards Flagged:\n${assessmentData.diff_analysis.findings.map(f => `- [${(f.severity || 'warning').toUpperCase()}] ${f.description || f.rule} (${f.file || 'patch'}:${f.line || 1})`).join('\n')}\n` : ''}
#### 🧠 Hindsight Episodic Memory Citations:
${(assessmentData.similar_incidents || []).slice(0, 2).map(inc => `- Deploy #${inc.deployment_id} (${inc.service}): ${inc.incident_summary}`).join('\n')}

#### 💡 Recommendations:
${(assessmentData.recommendations || []).map(r => `- ${r}`).join('\n')}`;

    navigator.clipboard.writeText(text);
    setCopiedPr(true);
    setTimeout(() => setCopiedPr(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Top Header ────────────────────────────────────────── */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <FolderGit2 className="w-3.5 h-3.5" />
            Git Intelligence Gate
          </span>
          <span className="text-xs text-slate-500 font-mono">AST Diff Inspection + Episodic Memory</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-blue-400" />
          Pre-Flight Risk Gate
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Autonomous release risk intelligence: compare Git branches across microservices, inspect unified diffs, flag AST syntax hazards, and evaluate risk before merging.
        </p>
      </div>

      {/* ── Branch Selector & Quick Presets Card ────────────── */}
      <div className="bg-[#0b0f19] border border-slate-800/80 rounded-xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/60 mb-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/25 font-mono">
              <Server className="w-3.5 h-3.5" />
              Microservices Git Inspector
            </span>
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">Compare release branches across services/</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsRecordPrOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer"
            >
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              <span>+ Record Past PR</span>
            </button>

            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              <span>Local Repo: <strong className="text-slate-200">PipelineMemory</strong></span>
            </div>
          </div>
        </div>

        {/* Branch Selectors: Base vs Compare */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Base Branch */}
          <div className="md:col-span-4">
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
              Base Branch (Target)
            </label>
            <div className="relative">
              <GitBranch className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
              <select
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              >
                {branches.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Compare Direction Arrow */}
          <div className="md:col-span-1 flex justify-center pb-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400">
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Head / Compare Branch */}
          <div className="md:col-span-4">
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
              Compare Branch (Feature / Fix)
            </label>
            <div className="relative">
              <GitPullRequest className="w-4 h-4 text-blue-400 absolute left-3 top-3 pointer-events-none" />
              <select
                value={headBranch}
                onChange={(e) => setHeadBranch(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 font-medium"
              >
                {branches.filter(b => b !== baseBranch).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Single Primary Action Button */}
          <div className="md:col-span-3">
            <button
              onClick={() => handleAssess()}
              disabled={assessing || loadingBranches}
              className="w-full py-2 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {assessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Evaluating Gate...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>Assess Risk Gate</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Error Banner ───────────────────────────────────────── */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
          <div className="text-sm">
            <p className="font-semibold text-rose-200">Comparison Failed</p>
            <p className="mt-0.5 font-mono text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* ── Loading Overlay ─────────────────────────────────────── */}
      {assessing && (
        <div className="p-8 rounded-xl bg-[#0b0f19] border border-blue-500/30 flex flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <div>
            <p className="text-sm font-semibold text-white">
              Evaluating Pre-Flight Risk Gate...
            </p>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Scanning AST diff hazards & checking Hindsight episodic memory...
            </p>
          </div>
        </div>
      )}

      {/* ── Risk Assessment Card (When evaluated) ────────────────── */}
      {assessmentData && !assessing && (
        <div className={`p-6 rounded-xl border shadow-2xl transition-all ${
          assessmentData.risk_score >= 50
            ? 'bg-gradient-to-b from-[#180e14] to-[#0d0910] border-rose-500/40 ring-1 ring-rose-500/20'
            : 'bg-gradient-to-b from-[#0a1815] to-[#08100f] border-emerald-500/40 ring-1 ring-emerald-500/20'
        }`}>
          {/* Verdict Banner Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
            <div className="flex items-center gap-3.5">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                assessmentData.risk_score >= 50
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}>
                {assessmentData.risk_score >= 50 ? (
                  <XOctagon className="w-7 h-7" />
                ) : (
                  <CheckCircle2 className="w-7 h-7" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold font-mono uppercase px-2.5 py-0.5 rounded-full ${
                    assessmentData.risk_score >= 50
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}>
                    {assessmentData.risk_score >= 50 ? 'CI/CD Gate Verdict: BLOCKED ⛔' : 'CI/CD Gate Verdict: APPROVED ✅'}
                  </span>
                  {assessmentData.hindsight_powered && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                      <Brain className="w-3 h-3" />
                      Hindsight Memory Verified
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white mt-1">
                  {assessmentData.risk_score >= 50
                    ? `High Risk (${assessmentData.risk_score}/100) — Pull Request Blocked`
                    : `Low Risk (${assessmentData.risk_score}/100) — Safe to Merge`}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-xs text-slate-400 font-mono block">Evaluated Branch</span>
                <span className="text-sm font-mono font-bold text-blue-300">{effectiveHead}</span>
              </div>
              <RiskGauge score={assessmentData.risk_score} level={assessmentData.risk_level} size={84} />
            </div>
          </div>

          {/* AST Hazards Banner (if any) */}
          {assessmentData.diff_analysis?.findings?.length > 0 && (
            <div className="mt-5 p-4 rounded-lg bg-rose-950/30 border border-rose-500/30">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-4 h-4 text-rose-400" />
                <span className="text-xs font-bold text-rose-200 uppercase font-mono tracking-wider">
                  Static Code Hazards Flagged ({assessmentData.diff_analysis.findings.length})
                </span>
              </div>
              <div className="space-y-2">
                {assessmentData.diff_analysis.findings.map((f, i) => (
                  <div key={i} className="text-xs bg-slate-900/80 p-2.5 rounded border border-rose-900/40 font-mono flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                      <span className="text-rose-400 font-bold mr-2">[{f.severity?.toUpperCase()}]</span>
                      <span className="text-slate-200">{f.description || f.rule}</span>
                      {f.file && <span className="text-slate-500 ml-2">in {f.file}:{f.line || 1}</span>}
                    </div>
                    {f.remediation && (
                      <span className="text-emerald-400 text-[11px] bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/40">
                        Fix: {f.remediation}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clean & Simple Primary Risk Drivers (YAGNI) */}
          {(() => {
            const activeFactors = (assessmentData.factors || []).filter(f => (f.score || 0) > 0);
            if (activeFactors.length === 0) return null;

            return (
              <div className="mt-4 p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                  <span>Primary Risk Drivers</span>
                  <span className="text-[10px] text-slate-500 font-normal">{activeFactors.length} factors contributing</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {activeFactors.map((fac, i) => {
                    const score = Math.round(fac.score || 0);
                    const isHigh = score >= 50;
                    const isMed = score >= 25 && score < 50;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-md bg-[#090d16] border border-slate-800/80 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="font-mono text-slate-200 block truncate text-[11px]">
                            {fac.name}
                          </span>
                          {fac.detail && (
                            <span className="text-[10px] text-slate-500 block truncate" title={fac.detail}>
                              {fac.detail}
                            </span>
                          )}
                        </div>
                        <span
                          className={`font-mono text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${
                            isHigh
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                              : isMed
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                              : 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
                          }`}
                        >
                          {score}/100
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* AI Explanation & Corrective Diff Patch */}
          {assessmentData.explanation && (
            <div className="mt-5 p-4 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  PipelineMemory Reasoning & Remediation Advice
                </span>
                <button
                  type="button"
                  onClick={handleCopyPrComment}
                  className="px-2.5 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-mono flex items-center gap-1.5 transition-colors"
                >
                  {copiedPr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPr ? 'PR Review Comment Copied!' : 'Copy PR Review Comment'}
                </button>
              </div>
              <div className="text-xs leading-relaxed text-slate-300 prose prose-invert max-w-none">
                <MarkdownRenderer content={assessmentData.explanation} />
              </div>
            </div>
          )}

          {/* Human-in-the-Loop Feedback & Continuous Memory Ingestion */}
          <div className="mt-5 p-4 rounded-xl bg-[#090e18] border border-blue-500/25 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Brain className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white font-mono">Feedback on Agent Verdict & Suggestions</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25">
                      Syncs to Hindsight Cloud
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Are you satisfied with the agent's risk verdict and recommendations?
                  </p>
                </div>
              </div>

              {!feedbackSubmitted && (
                <div className="flex items-center gap-2 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackSatisfaction('satisfied');
                      setFeedbackSubmitted(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 border cursor-pointer ${
                      feedbackSatisfaction === 'satisfied'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Satisfied</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackSatisfaction('not_satisfied');
                      setFeedbackSubmitted(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 border cursor-pointer ${
                      feedbackSatisfaction === 'not_satisfied'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm shadow-rose-500/10'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5 text-rose-400" />
                    <span>Not Satisfied / Need Override</span>
                  </button>
                </div>
              )}
            </div>

            {/* If Already Submitted */}
            {feedbackSubmitted ? (
              <div className="mt-3 p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 flex items-start justify-between gap-3 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-emerald-200 font-mono">
                      Feedback Retained in Hindsight Cloud Memory Bank
                    </span>
                    <p className="text-[11px] text-emerald-300/80 mt-0.5">
                      {feedbackSatisfaction === 'satisfied'
                        ? 'Confirmed verdict: The agent reinforced this reasoning model for subsequent risk gates.'
                        : 'Override captured: The agent stored your domain correction as an episodic observation to guide future CI/CD reviews.'}
                    </p>
                    {feedbackText && (
                      <p className="text-[11px] font-mono text-slate-300 bg-black/40 p-2 rounded mt-2 border border-emerald-500/20">
                        "{feedbackText}"
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFeedbackSubmitted(false);
                  }}
                  className="text-[10px] text-slate-400 hover:text-white underline font-mono flex-shrink-0"
                >
                  Edit Feedback
                </button>
              </div>
            ) : feedbackSatisfaction ? (
              /* Input Form for Feedback */
              <div className="mt-3 space-y-3 animate-fade-in">
                <div>
                  <label className="block text-[11px] font-mono font-medium text-slate-300 mb-1">
                    {feedbackSatisfaction === 'not_satisfied'
                      ? 'Why are you not satisfied? Provide your domain correction or override rationale:'
                      : 'Optional notes / confirmation rationale for Hindsight memory:'}
                  </label>
                  <textarea
                    rows={3}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder={
                      feedbackSatisfaction === 'not_satisfied'
                        ? "e.g., 'This migration is executed during a scheduled Sunday downtime window with 0 traffic, so table lock risk is acceptable.' or 'JWT secrets are injected via AWS Secrets Manager at container start, not hardcoded.'"
                        : "e.g., 'Accurate assessment. The PostgreSQL table lock matches incident #61 post-mortem playbook.'"
                    }
                    className="w-full text-xs font-mono bg-black/50 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-500"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span>This data directly trains the agent's long-term episodic bank via client.retain()</span>
                  </div>

                  <button
                    type="button"
                    disabled={submittingFeedback || (feedbackSatisfaction === 'not_satisfied' && !feedbackText.trim())}
                    onClick={() => handleSubmitFeedback()}
                    className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-2 disabled:opacity-40"
                  >
                    {submittingFeedback ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Feed to Hindsight Memory</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2.5 text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                <span>Select "Satisfied" to reinforce this evaluation or "Not Satisfied" to teach the agent your domain context.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Compare Metadata & Diff Viewer ───────────────────────── */}
      {compareData && (
        <div className="bg-[#0b0f19] border border-slate-800/80 rounded-xl overflow-hidden shadow-xl">
          {/* Metadata Bar */}
          <div className="p-4 bg-slate-900/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-[11px] font-mono text-slate-500 uppercase block">Comparing</span>
                <div className="text-sm font-mono font-semibold text-white flex items-center gap-2">
                  <span className="text-slate-400">{compareData.base}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-blue-400 font-bold">{compareData.head}</span>
                </div>
              </div>

              <div className="h-7 w-px bg-slate-800 hidden md:block" />

              <div>
                <span className="text-[11px] font-mono text-slate-500 uppercase block">Microservice</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {compareData.service}
                </span>
              </div>

              <div>
                <span className="text-[11px] font-mono text-slate-500 uppercase block">Change Type</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  {compareData.change_type}
                </span>
              </div>

              <div className="h-7 w-px bg-slate-800 hidden md:block" />

              <div>
                <span className="text-[11px] font-mono text-slate-500 uppercase block">Diff Stats</span>
                <div className="text-xs font-mono flex items-center gap-2 mt-0.5">
                  <span className="text-slate-300">{compareData.stats?.files_changed || 0} files</span>
                  <span className="text-emerald-400 font-semibold">+{compareData.stats?.additions || 0}</span>
                  <span className="text-rose-400 font-semibold">-{compareData.stats?.deletions || 0}</span>
                </div>
              </div>
            </div>

          </div>

          {/* Commits Included */}
          {compareData.commits?.length > 0 && (
            <div className="px-4 py-3 bg-slate-950/40 border-b border-slate-800/60">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">
                Commits in this branch comparison ({compareData.commits.length})
              </div>
              <div className="space-y-1.5">
                {compareData.commits.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs font-mono bg-slate-900/60 px-3 py-1.5 rounded border border-slate-800/40">
                    <div className="flex items-center gap-2 text-slate-200">
                      <span className="text-blue-400 font-bold">{c.hash}</span>
                      <span className="truncate">{c.message}</span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      by {c.author}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unified Diff Content */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-blue-400" />
                Unified Git Diff Viewer
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {compareData.diff ? `${compareData.diff.split('\n').length} lines` : 'Empty patch'}
              </span>
            </div>

            <div className="font-mono text-xs bg-[#070a12] border border-slate-800/90 rounded-lg p-3 overflow-x-auto max-h-[480px] leading-relaxed">
              {compareData.diff ? (
                compareData.diff.split('\n').map((line, idx) => {
                  let lineClass = 'text-slate-400';
                  let bgClass = '';
                  if (line.startsWith('+++') || line.startsWith('---')) {
                    lineClass = 'text-purple-400 font-bold';
                  } else if (line.startsWith('@@')) {
                    lineClass = 'text-cyan-400 bg-cyan-950/20';
                    bgClass = 'bg-cyan-950/20';
                  } else if (line.startsWith('+')) {
                    lineClass = 'text-emerald-300 font-medium';
                    bgClass = 'bg-emerald-950/30';
                  } else if (line.startsWith('-')) {
                    lineClass = 'text-rose-300 font-medium';
                    bgClass = 'bg-rose-950/30';
                  } else if (line.startsWith('diff --git')) {
                    lineClass = 'text-blue-300 font-bold';
                    bgClass = 'bg-blue-950/30';
                  }

                  return (
                    <div key={idx} className={`${lineClass} ${bgClass} px-1.5 py-0.5 rounded whitespace-pre`}>
                      {line || ' '}
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic py-4 text-center">
                  No code differences detected between {compareData.base} and {compareData.head}.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record Past PR Modal */}
      <RecordPastPrModal
        isOpen={isRecordPrOpen}
        onClose={() => setIsRecordPrOpen(false)}
        initialService={compareData?.service || 'payments'}
      />
    </div>
  );
}
