import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import ChatMessage from './components/ChatMessage'

type Role = 'user' | 'assistant'

type Message = {
  id: string
  role: Role
  content: string
  skipContext?: boolean
}

type SsePayload = {
  event: 'chunk' | 'done' | 'error'
  content?: string
}

const THEME_STORAGE_KEY = 'chat-theme'

const initialMessages: Message[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      'Hello! I am your monochrome AI companion. Ask me anything - math, code, or general questions.',
    skipContext: true,
  },
]

const prefersDarkTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const apiRoute =
    import.meta.env.VITE_BACKEND_URL?.trim() ||
    (typeof window !== 'undefined'
      ? `${window.location.origin.replace(/\/$/, '')}/api/chat`
      : '/api/chat')

  console.log('Loaded VITE_BACKEND_URL:', import.meta.env.VITE_BACKEND_URL, 'Resolved API route:', apiRoute)

  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(prefersDarkTheme)

  const streamAbortController = useRef<AbortController | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const processEvent = (chunk: string, appendChunk: (value: string) => void): boolean => {
    const dataLine = chunk
      .split('\n')
      .find((line) => line.startsWith('data:'))

    if (!dataLine) return false

    try {
      const payload = JSON.parse(dataLine.replace(/^data:\s*/, '')) as SsePayload
      if (payload.event === 'chunk' && typeof payload.content === 'string') {
        appendChunk(payload.content)
      } else if (payload.event === 'error') {
        throw new Error(payload.content || 'The assistant ran into an issue.')
      } else if (payload.event === 'done') {
        return true
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unexpected response payload.')
    }

    return false
  }

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (!inputValue.trim() || isStreaming) return

    const trimmed = inputValue.trim()
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    }
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
    }

    setMessages((current) => [...current, userMessage, assistantMessage])
    setInputValue('')
    setErrorMessage(null)
    setIsStreaming(true)

    const appendChunk = (value: string) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: `${message.content}${value}` }
            : message,
        ),
      )
    }

    const payload = {
      messages: [...messages, userMessage]
        .filter((message) => !message.skipContext)
        .map(({ role, content }) => ({ role, content })),
    }

    const abortController = new AbortController()
    streamAbortController.current = abortController

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    
    try {
      const response = await fetch(apiRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error('Unable to connect to the assistant.')
      }

      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let doneSignal = false

      while (!doneSignal) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

        const segments = buffer.split('\n\n')
        buffer = segments.pop() ?? ''

        for (const segment of segments) {
          if (processEvent(segment, appendChunk)) {
            doneSignal = true
          }
        }

        if (done) {
          if (buffer.trim().length > 0 && processEvent(buffer, appendChunk)) {
            doneSignal = true
          }
          buffer = ''
          break
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setErrorMessage('Generation cancelled.')
      } else {
        setErrorMessage((error as Error).message)
      }
    } finally {
      reader?.releaseLock()
      streamAbortController.current = null
      setIsStreaming(false)
    }
  }

  const handleStop = () => {
    streamAbortController.current?.abort()
    streamAbortController.current = null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-black transition-colors dark:bg-black dark:text-white">
      <header className="border-b border-black/10 bg-white/90 px-4 py-4 text-sm dark:border-white/10 dark:bg-black/80">
        <div className="mx-auto flex h-10 w-full max-w-3xl items-center justify-between">
          <div>
            <p className="text-base font-semibold tracking-tight">Leo's AI Chatbot</p>
            <p className="text-xs text-black/60 dark:text-white/60">Monochrome intelligence.</p>
          </div>
          <button
            type="button"
            onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
            className="inline-flex items-center gap-2 rounded-full border border-black/30 px-3 py-1 text-xs font-medium text-black transition hover:border-black dark:border-white/40 dark:text-white dark:hover:border-white"
          >
            <span
              className={`flex h-5 w-9 items-center rounded-full border border-black/20 px-1 transition dark:border-white/40 ${
                theme === 'dark' ? 'bg-black/70 justify-end' : 'bg-black/5 justify-start'
              }`}
            >
              <span className="h-3.5 w-3.5 rounded-full bg-black dark:bg-white" />
            </span>
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-gradient-to-b from-white via-white to-white dark:from-black dark:via-black dark:to-black">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-44 pt-4">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message.content}
              isUser={message.role === 'user'}
            />
          ))}
          <div ref={chatEndRef} />
        </div>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent pb-4 pt-6 dark:from-black dark:via-black/90">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl px-4">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-black/10 bg-white/95 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition dark:border-white/15 dark:bg-black/80 dark:shadow-[0_10px_40px_rgba(255,255,255,0.05)]"
          >
            <textarea
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder="Send a message..."
              className="w-full resize-none border-0 bg-transparent text-sm text-black outline-none placeholder:text-black/40 dark:text-white dark:placeholder:text-white/40"
              disabled={isStreaming}
            />
            {errorMessage && (
              <p className="mt-2 text-xs text-black/60 dark:text-white/70" role="alert">
                {errorMessage}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handleStop}
                disabled={!isStreaming}
                className="text-black/50 transition hover:text-black disabled:opacity-50 dark:text-white/50 dark:hover:text-white"
              >
                Stop
              </button>
              <button
                type="submit"
                disabled={!inputValue.trim() || isStreaming}
                className="inline-flex items-center gap-2 rounded-full border border-black/80 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-black hover:text-white disabled:opacity-40 dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-black"
              >
                {isStreaming ? 'Thinking...' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default App
