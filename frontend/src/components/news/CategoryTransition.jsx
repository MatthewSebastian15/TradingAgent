import PropTypes from 'prop-types';
import { useEffect } from 'react';

export default function CategoryTransition({ categoryKey, children }) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [categoryKey]);

  return <div className="animate-fade-up">{children}</div>;
}

CategoryTransition.propTypes = {
  categoryKey: PropTypes.string.isRequired,
  children: PropTypes.node,
};
