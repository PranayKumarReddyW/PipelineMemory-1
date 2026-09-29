import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Premium Markdown Renderer with GitHub Flavored Markdown (GFM) support.
 * Renders headings, tables, code blocks, lists, and callouts with dark glassmorphism styling.
 */
export default function MarkdownRenderer({ content, className = '' }) {
  if (!content) return null;

  return (
    <div className={`markdown-content space-y-3 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-base sm:text-lg font-bold text-white mt-4 mb-2 pb-1.5 border-b border-white/[0.08] flex items-center gap-2" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-sm sm:text-base font-bold text-white mt-3.5 mb-2 flex items-center gap-2" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-xs sm:text-sm font-semibold text-pipeline-300 mt-3 mb-1.5 uppercase tracking-wide" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-xs font-semibold text-gray-200 mt-2.5 mb-1 tracking-wider" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="text-xs sm:text-[13px] leading-relaxed text-gray-200 mb-2.5 last:mb-0" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-white" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="text-gray-300 italic" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="space-y-1.5 my-2.5 pl-4 list-disc marker:text-pipeline-400 text-xs sm:text-[13px] text-gray-200" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="space-y-1.5 my-2.5 pl-4 list-decimal marker:text-pipeline-400 text-xs sm:text-[13px] text-gray-200" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed pl-1" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-2 border-pipeline-500 pl-3.5 py-1 my-3 bg-pipeline-950/30 rounded-r-xl text-xs text-gray-300 italic" {...props} />
          ),
          hr: ({ node, ...props }) => (
            <hr className="my-3 border-white/[0.08]" {...props} />
          ),
          code: ({ node, inline, className, children, ...props }) => {
            if (inline) {
              return (
                <code className="text-pipeline-300 bg-pipeline-950/70 border border-pipeline-500/25 px-1.5 py-0.5 rounded text-[11px] font-mono" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <div className="my-2.5 rounded-xl overflow-hidden border border-white/[0.08] bg-dark-950/90 p-3 font-mono text-[11px] text-pipeline-200 overflow-x-auto shadow-inner">
                <code {...props}>{children}</code>
              </div>
            );
          },
          table: ({ node, ...props }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-white/[0.1] shadow-lg">
              <table className="w-full text-xs text-left divide-y divide-white/[0.08]" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-white/[0.06] text-white font-semibold" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-white/[0.04] bg-dark-950/50" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-white/[0.02] transition-colors" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="py-2.5 px-3.5 text-xs font-semibold uppercase tracking-wider text-gray-300" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="py-2.5 px-3.5 text-xs text-gray-200 align-top" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
