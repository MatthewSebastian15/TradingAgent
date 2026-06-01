import PropTypes from 'prop-types';

import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';

function formatDate(value) {
  if (!value) return 'N/A';
  const text = String(value);
  if (/^\d{8}T\d{6}/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  return text;
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function NewsCard({ item, index }) {
  const url = safeUrl(item.url);

  return (
    <article className="border border-bloomberg-border bg-black px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-bloomberg-orange tracking-wider mb-1">
            NEWS #{index + 1}
          </div>
          <h3 className="font-mono text-sm text-bloomberg-white font-semibold leading-relaxed">
            {item.title}
          </h3>
        </div>
        <span className="font-mono text-[10px] border border-bloomberg-border text-bloomberg-muted px-2 py-1 uppercase flex-shrink-0">
          {item.source || 'vendor'}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px] text-bloomberg-muted">
        <span>Publisher: {item.publisher || 'Unknown'}</span>
        <span>Published: {formatDate(item.published_at)}</span>
        <span>Event: {item.event_type || 'general'}</span>
      </div>

      {item.summary && (
        <p className="mt-3 font-mono text-xs text-bloomberg-muted leading-relaxed">
          {item.summary}
        </p>
      )}

      {item.relevance_reason && (
        <p className="mt-2 font-mono text-xs text-bloomberg-muted leading-relaxed">
          <span className="text-bloomberg-white">Why it matters:</span> {item.relevance_reason}
        </p>
      )}

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 font-mono text-xs text-bloomberg-orange hover:text-orange-300 tracking-wider"
        >
          OPEN ORIGINAL SOURCE
        </a>
      )}
    </article>
  );
}

NewsCard.propTypes = {
  item: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
};

export default function NewsTab({ result }) {
  const relatedNews = result?.related_news || {};
  const items = Array.isArray(relatedNews.items) ? relatedNews.items : [];

  if (!relatedNews.available || items.length === 0) {
    return (
      <div className="px-4 py-4 border-b border-bloomberg-border">
        <NoticeBox title="NEWS UNAVAILABLE" tone="amber">
          {relatedNews.warning || 'No usable related news was returned for this analysis.'}
        </NoticeBox>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border space-y-4">
      <section>
        <SectionHeader label="NEWS" />
        <div className="font-mono text-xs text-bloomberg-muted leading-relaxed">
          {relatedNews.summary || `Top related news for ${result.ticker || 'this ticker'}.`}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px] text-bloomberg-muted">
          <span className="border border-bloomberg-border px-2 py-1">
            SOURCE: {relatedNews.source || 'N/A'}
          </span>
          <span className="border border-bloomberg-border px-2 py-1">
            LOOKBACK: {relatedNews.lookback_days || 'N/A'} days
          </span>
          <span className="border border-bloomberg-border px-2 py-1">ITEMS: {items.length}</span>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.slice(0, 8).map((item, index) => (
          <NewsCard
            key={item.normalized_url || item.url || `${item.title}-${index}`}
            item={item}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

NewsTab.propTypes = {
  result: PropTypes.object.isRequired,
};
