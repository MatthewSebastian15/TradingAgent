import PropTypes from 'prop-types';

export default function SectionHeader({ label }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">
        {label}
      </span>
      <div className="flex-1 h-px bg-bloomberg-border" />
    </div>
  );
}

SectionHeader.propTypes = {
  label: PropTypes.string.isRequired,
};
