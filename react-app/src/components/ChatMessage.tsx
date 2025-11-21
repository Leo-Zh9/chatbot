import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

import './chat.css'

export type ChatMessageProps = {
  message: string
  isUser: boolean
}

const markdownComponents = {
  code({
    inline,
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
    const match = /language-(\w+)/.exec(className ?? '')
    if (!inline && match) {
      return (
        <SyntaxHighlighter
          {...props}
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{
            borderRadius: '0.75rem',
            margin: 0,
            fontSize: '0.85rem',
          }}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      )
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
}

const normalizeMath = (value: string): string => {
  const withUnixLineEndings = value.replace(/\r\n/g, '\n')

  const convertedDelimiters = withUnixLineEndings
    .replace(/\\\[/g, '$$\n')
    .replace(/\\\]/g, '\n$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')

  return convertedDelimiters.replace(/^\s*\$\s*$/gm, '$$')
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isUser }) => {
  const normalizedMessage = normalizeMath(message)

  return (
    <div className={`chat-message ${isUser ? 'chat-message--user' : 'chat-message--assistant'}`}>
      <div className="chat-avatar" aria-hidden>
        {isUser ? 'You' : 'AI'}
      </div>
      <div className="chat-bubble">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
          className="chat-content prose prose-sm dark:prose-invert"
        >
          {normalizedMessage}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export default ChatMessage

