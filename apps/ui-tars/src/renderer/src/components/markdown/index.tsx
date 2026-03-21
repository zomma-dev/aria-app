import ReactMarkdown from 'react-markdown';
import { memo } from 'react';

export const Markdown = memo(({ children }: { children: string }) => {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="font-semibold text-sm mb-1.5 mt-3 first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="font-semibold text-sm mb-1.5 mt-3 first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="font-semibold text-sm mb-1.5 mt-2 first:mt-0">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="font-semibold text-sm mb-1 mt-2 first:mt-0">
            {children}
          </h4>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 text-sm">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 text-sm">{children}</ol>
        ),
        li: ({ children }) => <li className="ml-1">{children}</li>,
        p: ({ children }) => (
          <p className="mb-1.5 text-sm leading-relaxed">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border pl-3 py-1 mb-2 text-sm text-muted-foreground italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-0 border-t border-border my-4" />,
        a: ({ children, href, title }) => (
          <a
            href={href}
            title={title}
            className="underline transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        del: ({ children }) => <del className="line-through">{children}</del>,
        code: ({ children, className }) => {
          if (!className) {
            return (
              <code className="bg-muted text-foreground px-1 py-0.5 rounded text-xs font-mono">
                {children}
              </code>
            );
          }
          return <code className={className}>{children}</code>;
        },
        pre: ({ children }) => (
          <pre className="bg-muted border border-border rounded-md p-2.5 mb-2 overflow-x-auto whitespace-pre-wrap">
            <code className="text-xs font-mono">{children}</code>
          </pre>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
});
