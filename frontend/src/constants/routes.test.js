import { describe, expect, it } from 'vitest';

import * as routes from './routes';

describe('route constants', () => {
  it('keeps the primary route and all paths absolute', () => {
    expect(routes.AI_AGENT_PATH).toBe('/ai-agent');
    for (const value of Object.values(routes)) {
      expect(value.startsWith('/')).toBe(true);
    }
  });
});
