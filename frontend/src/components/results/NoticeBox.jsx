import PropTypes from 'prop-types';

export default function NoticeBox({ title, children, tone = 'amber' }) {
  const classes =
    tone === 'red'
      ? 'border-bloomberg-red bg-bloomberg-red-dim text-bloomberg-red'
      : 'border-bloomberg-amber bg-bloomberg-amber-dim text-bloomberg-amber';
  return (
    <div className={`border px-3 py-2 ${classes}`}>
      <div className="font-mono text-xs font-semibold tracking-wider uppercase">{title}</div>
      {children && <div className="mt-1 font-mono text-xs leading-relaxed">{children}</div>}
    </div>
  );
}

NoticeBox.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  tone: PropTypes.oneOf(['amber', 'red']),
};
