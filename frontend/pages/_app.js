import '../styles/globals.css';
import dynamic from 'next/dynamic';
import { SnackbarProvider } from '../lib/contexts/SnackbarContext';

/** Header uses useRouter; load client-only so static prerender does not fail. */
const Header = dynamic(() => import('../components/common/Header'), { ssr: false });

/**
 * Root application component. Wraps all pages with Header and SnackbarProvider.
 * @param {Object} props
 * @param {import('next').AppProps} props.Component - The page component to render
 * @param {Object} props.pageProps - Props passed to the page component
 * @see {@link docs/frontend/README.md} for frontend architecture
 */
function MyApp({ Component, pageProps }) {
  return (
    <SnackbarProvider>
      <div className="min-h-screen bg-base-200">
        <Header />
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Component {...pageProps} />
        </main>
      </div>
    </SnackbarProvider>
  );
}

export default MyApp;
