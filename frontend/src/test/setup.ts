import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver — recharts' ResponsiveContainer needs one to mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error - test polyfill
global.ResizeObserver = ResizeObserverStub;

