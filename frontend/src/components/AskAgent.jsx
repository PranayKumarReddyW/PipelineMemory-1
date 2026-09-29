/**
 * Ask Agent — natural-language interface for querying pipeline memory.
 *
 * Powered by Hindsight reflect() and episodic semantic search.
 * Features an interactive "Memory vs Stateless AI" comparison mode
 * to clearly demonstrate why persistent agent memory is revolutionary.
 */

import { useState, useRef, useEffect } from 'react';
import {
  MessageCircle, Send, Loader2, Bot, User, Sparkles, Brain,
  ArrowRight, Copy, Check, Trash2, ShieldAlert, Award,
  HelpCircle, RefreshCw
} from 'lucide-react';
import { api } from '../hooks/useApi';
import MarkdownRenderer from './MarkdownRenderer';

const CATEGORIZED_QUESTIONS = [
  {
    category: 'Incident Post-Mortems',
    questions: [
      'Why did payments fail recently?',
      'Summarize all Friday deployments that failed',
      'Which config changes caused the most incidents?',
    ],
  },
  {
    category: 'Memory vs Stateless Analysis',
    questions: [
      'What patterns have you learned from past failures?',
      'Which service is most fragile and why?',
      'What is the blast radius of the payments service?',
    ],
  },
  {
    category: 'Pre-Flight Verification',
    questions: [
      'Give me an overview of the pipeline health',
      'What should I watch out for before deploying to auth?',
    ],
  },
];

export default function AskAgent() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const scrollRef = useRef(null);

  /* Auto-scroll */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const askQuestion = async (question) => {
    if (!question.trim()) return;

    const userMessage = { role: 'user', content: question, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const data = await api.post('/ask', { question, compare: compareMode });
      const agentMessage = {
        role: 'agent',
        content: data.answer,
        stateless_answer: data.stateless_answer,
        hindsight_powered: data.hindsight_powered,
        llm_powered: data.llm_powered,
        context_size: data.context_size,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, agentMessage]);
    } catch (err) {
      const errorMessage = {
        role: 'agent',
        content: `Error consulting pipeline memory: ${err.message}`,
        isError: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    askQuestion(input);
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Pipeline Intelligence Agent</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Query company release memory, post-mortems, and root causes using natural language
          </p>
        </div>

        {/* Side-by-Side Compare Mode Toggle */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setCompareMode(!compareMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 border cursor-pointer ${
              compareMode
                ? 'bg-blue-600/15 text-blue-300 border-blue-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Benchmark: Memory vs Stateless AI</span>
            <span className={`w-1.5 h-1.5 rounded-full ${compareMode ? 'bg-blue-400' : 'bg-slate-600'}`} />
          </button>

          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5"
              title="Clear chat history"
            >
              <Trash2 className="w-3.5 h-3.5 text-gray-400" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Chat Shell */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] flex flex-col min-h-[520px] h-[calc(100vh-210px)] max-h-[850px] overflow-hidden min-w-0">
        {/* Messages Stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center my-auto min-h-full justify-center text-center max-w-2xl mx-auto py-4 sm:py-6">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-pipeline-600 via-purple-600 to-amber-500 flex items-center justify-center mb-3 sm:mb-4 shadow-lg shadow-pipeline-500/30 flex-shrink-0">
                <Brain className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white mb-1">Persistent Pipeline Memory</h3>
              <p className="text-xs text-gray-400 mb-4 sm:mb-6 max-w-lg leading-relaxed px-2">
                Generic LLMs have zero memory of your deployments. PipelineMemory retains every release, build log, and rollback inside <strong className="text-pipeline-300">Hindsight</strong> to provide precise, company-specific answers.
              </p>

              {/* Categorized Suggested Questions */}
              <div className="w-full space-y-3 sm:space-y-4 text-left px-1">
                {CATEGORIZED_QUESTIONS.map((cat, cIdx) => (
                  <div key={cIdx}>
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                      {cat.category}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {cat.questions.map((q, qIdx) => (
                        <button
                          key={qIdx}
                          onClick={() => askQuestion(q)}
                          className="p-2.5 rounded-xl bg-dark-950/70 hover:bg-dark-900 border border-white/[0.06] hover:border-pipeline-500/40 text-left transition-all text-xs text-gray-300 hover:text-white flex items-center justify-between group cursor-pointer"
                        >
                          <span className="truncate mr-2 font-medium">{q}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-pipeline-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Render Messages */}
          {messages.map((msg, i) => (
            <MessageItem
              key={i}
              message={msg}
              index={i}
              isCopied={copiedIndex === i}
              onCopy={(text) => handleCopy(text, i)}
            />
          ))}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex items-start gap-3 animate-fade-in">
              <div className="w-8 h-8 rounded-xl bg-pipeline-600/20 border border-pipeline-500/30 flex items-center justify-center flex-shrink-0 text-pipeline-400">
                <Brain className="w-4 h-4 animate-pulse" />
              </div>
              <div className="glass-panel p-4 rounded-2xl border border-pipeline-500/30 max-w-xl">
                <div className="flex items-center gap-2.5 text-xs text-gray-300">
                  <Loader2 className="w-4 h-4 animate-spin text-pipeline-400" />
                  <span>
                    {compareMode
                      ? 'Synthesizing with Hindsight Memory bank & running Stateless baseline...'
                      : 'Searching Hindsight episodic memory...'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-white/[0.08] bg-dark-950/60 rounded-b-2xl">
          <form onSubmit={handleSubmit} className="flex gap-2.5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                compareMode
                  ? "Ask any DevOps question to test Memory vs Stateless AI..."
                  : "Ask about past outages, failure patterns, or deployment risks..."
              }
              disabled={loading}
              className="form-input flex-1 text-sm py-3"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="btn-primary px-5 py-3 shadow-lg shadow-pipeline-600/30"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Ask Agent</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function MessageItem({ message, index, isCopied, onCopy }) {
  const isAgent = message.role === 'agent';

  return (
    <div className={`flex items-start gap-3 animate-fade-in ${isAgent ? '' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-mono ${
        isAgent
          ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30'
          : 'bg-slate-800 text-slate-300 border border-slate-700'
      }`}>
        {isAgent ? <Brain className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-4xl ${isAgent ? '' : 'text-right'}`}>
        {isAgent && message.stateless_answer ? (
          /* Side-by-Side Comparison Container */
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* With Hindsight Memory (Left Card - Memory Active) */}
              <div className="glass-card p-4 rounded-xl border border-blue-500/30 bg-[#0c1322] text-left">
                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-blue-500/20">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider font-mono">
                      Hindsight AI Memory
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25">
                    Episodic Bank Active
                  </span>
                </div>

                <div className="text-xs leading-relaxed text-slate-200">
                  <MarkdownRenderer content={message.content} />
                </div>
              </div>

              {/* Without Memory / Stateless (Right Card - Amnesia) */}
              <div className="glass-card p-4 rounded-xl border border-slate-800 bg-[#080c14] text-left opacity-90">
                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                      Stateless AI (Without Memory)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    Baseline
                  </span>
                </div>

                <div className="text-xs leading-relaxed text-slate-400">
                  <MarkdownRenderer content={message.stateless_answer} />
                </div>
              </div>
            </div>

            {/* Copy / Actions Bar */}
            <div className="flex items-center justify-between pt-1 text-[11px] text-gray-400">
              <div>
                {message.context_size && (
                  <span className="font-mono text-gray-400 text-[11px]">
                    Retrieved context: {message.context_size.deployments} releases · {message.context_size.failures} failure incidents
                  </span>
                )}
              </div>

              <button
                onClick={() => onCopy(message.content)}
                className="btn-ghost text-[11px] py-1 px-2.5 flex items-center gap-1 text-gray-400 hover:text-white"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{isCopied ? 'Copied!' : 'Copy Answer'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Standard Bubble */
          <div className="space-y-1.5 inline-block text-left max-w-2xl">
            <div className={`p-4 rounded-2xl text-xs leading-relaxed ${
              isAgent
                ? message.isError
                  ? 'bg-red-500/10 border border-red-500/30 text-red-200'
                  : 'glass-panel border-white/[0.08] text-gray-200'
                : 'bg-pipeline-600 text-white font-medium shadow-md shadow-pipeline-600/20'
            }`}>
              {isAgent && !message.isError ? (
                <MarkdownRenderer content={message.content} />
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}
            </div>

            {isAgent && !message.isError && (
              <div className="flex items-center justify-end text-[10px] text-gray-500 px-1">
                <button
                  onClick={() => onCopy(message.content)}
                  className="hover:text-white flex items-center gap-1"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
