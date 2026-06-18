import PropTypes from 'prop-types';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { badgeVariants } from './badgeVariants';

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

Badge.propTypes = {
  className: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'secondary', 'destructive', 'outline']),
};

export { Badge };
