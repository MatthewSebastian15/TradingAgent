import PropTypes from 'prop-types';

import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };

Skeleton.propTypes = {
  className: PropTypes.string,
};
