import PropTypes from 'prop-types';

const POOL_LABELS = {
  news: 'News',
  market: 'Market',
  analysis: 'AI Analysis',
  watchlist: 'Watchlist',
  portfolio: 'Portfolio',
  economic: 'Economic',
};

export function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        <div
          className={
            isUser
              ? 'bg-bloomberg-orange text-black rounded-2xl rounded-tr-sm px-4 py-2 text-sm'
              : 'bg-bloomberg-card border border-bloomberg-border text-bloomberg-white rounded-2xl rounded-tl-sm px-4 py-2 text-sm'
          }
        >
          {message.outOfScope && (
            <p className="text-bloomberg-red text-xs mb-1 font-medium">⚠ Out of scope</p>
          )}
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        {!isUser && message.poolUsed?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {message.poolUsed.map((pool) => (
              <span
                key={pool}
                className="text-[10px] px-2 py-0.5 rounded-full bg-bloomberg-surface border border-bloomberg-border text-bloomberg-muted"
              >
                {POOL_LABELS[pool] || pool}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

ChatMessage.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.string,
    role: PropTypes.oneOf(['user', 'assistant']).isRequired,
    content: PropTypes.string.isRequired,
    outOfScope: PropTypes.bool,
    poolUsed: PropTypes.arrayOf(PropTypes.string),
    sources: PropTypes.array,
    timestamp: PropTypes.string,
  }).isRequired,
};
