import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

interface MessageRendererProps {
  content: string;
  role: 'user' | 'assistant';
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({
  content,
  role,
}) => {
  const isDark = document.documentElement.classList.contains('dark');

  if (role === 'user') {
    return (
      <div className="text-sm leading-relaxed whitespace-pre-wrap break-words max-w-none">
        {content}
      </div>
    );
  }

  return (
    <div className="markdown-wrapper w-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const inline = !language;
            
            if (!inline && language) {
              return (
                <div className="relative my-4 w-full overflow-hidden rounded-lg">
                  <SyntaxHighlighter
                    style={isDark ? oneDark : oneLight}
                    language={language}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      lineHeight: '1.5',
                      padding: '1rem',
                      overflow: 'auto',
                      maxWidth: '100%',
                    } as any}
                    wrapLongLines={true}
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }
            
            return (
              <code className="inline-code bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <div className="w-full">{children}</div>;
          },
          p({ children, ...props }) {
            return (
              <p className="mb-4 last:mb-0 text-sm leading-relaxed text-gray-800 dark:text-gray-200" {...props}>
                {children}
              </p>
            );
          },
          h1({ children, ...props }) {
            return (
              <h1 className="text-xl font-bold mb-4 mt-6 first:mt-0 text-gray-900 dark:text-gray-100" {...props}>
                {children}
              </h1>
            );
          },
          h2({ children, ...props }) {
            return (
              <h2 className="text-lg font-semibold mb-3 mt-5 first:mt-0 text-gray-900 dark:text-gray-100" {...props}>
                {children}
              </h2>
            );
          },
          h3({ children, ...props }) {
            return (
              <h3 className="text-base font-semibold mb-2 mt-4 first:mt-0 text-gray-900 dark:text-gray-100" {...props}>
                {children}
              </h3>
            );
          },
          ul({ children, ...props }) {
            return (
              <ul className="list-disc pl-6 mb-4 space-y-1 text-sm text-gray-800 dark:text-gray-200" {...props}>
                {children}
              </ul>
            );
          },
          ol({ children, ...props }) {
            return (
              <ol className="list-decimal pl-6 mb-4 space-y-1 text-sm text-gray-800 dark:text-gray-200" {...props}>
                {children}
              </ol>
            );
          },
          li({ children, ...props }) {
            return (
              <li className="leading-relaxed" {...props}>
                {children}
              </li>
            );
          },
          blockquote({ children, ...props }) {
            return (
              <blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-4 bg-blue-50 dark:bg-blue-900/20 italic text-gray-700 dark:text-gray-300" {...props}>
                {children}
              </blockquote>
            );
          },
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline break-words"
                {...props}
              >
                {children}
                <span className="ml-1 text-xs">🔗</span>
              </a>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto my-4 w-full">
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden text-sm" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          th({ children, ...props }) {
            return (
              <th className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-3 py-2 text-left font-semibold text-gray-900 dark:text-gray-100" {...props}>
                {children}
              </th>
            );
          },
          td({ children, ...props }) {
            return (
              <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-800 dark:text-gray-200" {...props}>
                {children}
              </td>
            );
          },
          hr({ ...props }) {
            return (
              <hr className="my-6 border-0 h-px bg-gray-300 dark:bg-gray-600" {...props} />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
