import { describe, expect, it } from 'vitest';
import { parseRoute } from './route';

describe('parseRoute', () => {
  it.each([
    ['/', { name: 'home' }],
    ['', { name: 'home' }],
    ['/c/super-shy', { name: 'challenge', id: 'super-shy' }],
    ['/c/super-shy/', { name: 'challenge', id: 'super-shy' }],
    ['/admin', { name: 'admin' }],
    ['/admin/', { name: 'admin' }],
    ['/c/', { name: 'home' }],
    ['/unknown', { name: 'home' }],
  ])('%s', (path, route) => {
    expect(parseRoute(path)).toEqual(route);
  });
});
