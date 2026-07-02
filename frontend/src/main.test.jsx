import { describe, expect, it, vi } from 'vitest';

const renderSpy = vi.fn();
const createRoot = vi.fn(() => ({ render: renderSpy }));

vi.mock('react-dom/client', () => ({ default: { createRoot }, createRoot }));
vi.mock('./App.jsx', () => ({ default: () => null }));
vi.mock('./index.css', () => ({}));

describe('main entry', () => {
  it('mounts the app on #root in dark mode', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    await import('./main.jsx');

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(createRoot).toHaveBeenCalledWith(root);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
