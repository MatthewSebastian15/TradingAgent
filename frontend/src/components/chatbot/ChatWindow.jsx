import { Send, Square } from 'lucide-react';
import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';

import { ChatMessage } from './ChatMessage';

export function ChatWindow({ messages, isLoading, error, onSend, onStop }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    onSend(text);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-bloomberg-muted text-sm">
            Ask about your news, market, AI analysis, watchlist, portfolio, or the economy.
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="flex justify-start mb-3">
            <div className="bg-bloomberg-card border border-bloomberg-border rounded-2xl rounded-tl-sm px-4 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-bloomberg-muted animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[80%] bg-bloomberg-red/10 border border-bloomberg-red rounded-2xl rounded-tl-sm px-4 py-2 text-sm">
              <p className="text-bloomberg-red font-semibold mb-0.5">Error</p>
              <p className="text-bloomberg-red whitespace-pre-wrap break-words">{error}</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-bloomberg-border bg-bloomberg-surface px-4 py-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about news, market, analysis, watchlist, portfolio, or economy..."
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-bloomberg-card border border-bloomberg-border rounded-lg px-3 py-2 text-sm text-bloomberg-white placeholder-bloomberg-muted focus:outline-none focus:border-bloomberg-orange disabled:opacity-50"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop"
              aria-label="Stop response"
              className="px-3 py-2 rounded-lg bg-bloomberg-card border border-bloomberg-red text-bloomberg-red hover:bg-bloomberg-red/10"
            >
              <Square size={16} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="px-3 py-2 rounded-lg bg-bloomberg-orange text-black disabled:opacity-40 hover:opacity-90"
            >
              <Send size={16} aria-hidden="true" />
            </button>
          )}
        </form>
        <p className="text-[10px] text-bloomberg-muted mt-1">
          Enter to send · Shift+Enter for newline · Answers come only from stored data.
        </p>
      </div>
    </div>
  );
}

ChatWindow.propTypes = {
  messages: PropTypes.array.isRequired,
  isLoading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  onSend: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
};
