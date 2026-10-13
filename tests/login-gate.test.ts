import {afterEach, expect, it, vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import App from '../src/App';

afterEach(()=>vi.unstubAllGlobals());
it('renders a sign-in screen without mounting business pages before authentication', () => {
  vi.stubGlobal('window',{location:{href:'https://solar.example.test/'},history:{replaceState:vi.fn()}});
  vi.stubGlobal('localStorage',{getItem:()=>null});
  const client=new QueryClient();
  const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(App)));
  expect(html).toContain('Welcome back.');expect(html).toContain('login-email');expect(html).toContain('login-password');
  expect(html).not.toContain('New installation');expect(html).not.toContain('Explore the demo');
  expect(html).not.toContain('Main navigation');expect(client.getQueryCache().getAll()).toHaveLength(0);
});
