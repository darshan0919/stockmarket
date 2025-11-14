import '../styles/globals.css';
import Header from '../components/common/Header';

function MyApp({ Component, pageProps }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <Component {...pageProps} />
      </main>
    </div>
  );
}

export default MyApp;

