/**
 * Global Snackbar/Toast notification context for the application.
 * Provides a centralized way to show success, error, info, and warning notifications.
 *
 * @module lib/contexts/SnackbarContext
 * @see {@link docs/frontend/README.md} for frontend architecture
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import Snackbar from '../../components/common/Snackbar';

/** @type {import('react').Context<SnackbarContextValue | null>} */
const SnackbarContext = createContext(null);

/**
 * @typedef {Object} SnackbarContextValue
 * @property {function(string, string, number): void} showSnackbar - Show a snackbar notification
 */

/**
 * Provider component that wraps the app and provides snackbar functionality.
 * Renders the Snackbar component and manages its visibility state.
 *
 * @param {Object} props
 * @param {import('react').ReactNode} props.children - Child components to wrap
 * @returns {import('react').ReactElement}
 */
export function SnackbarProvider({ children }) {
  const [state, setState] = useState({
    show: false,
    message: '',
    type: 'info',
  });
  const timeoutRef = useRef(null);

  const showSnackbar = useCallback((message, type = 'info', duration = 3000) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setState({ show: true, message, type });

    timeoutRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, show: false }));
      timeoutRef.current = null;
    }, duration);
  }, []);

  const handleClose = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setState((prev) => ({ ...prev, show: false }));
  }, []);

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      <Snackbar message={state.message} type={state.type} show={state.show} onClose={handleClose} />
    </SnackbarContext.Provider>
  );
}

/**
 * Hook to access the snackbar context.
 * Must be used within a SnackbarProvider.
 *
 * @returns {SnackbarContextValue}
 * @throws {Error} When used outside SnackbarProvider
 *
 * @example
 * const { showSnackbar } = useSnackbar();
 * showSnackbar('Saved successfully!', 'success');
 * showSnackbar('Something went wrong', 'error', 5000);
 */
export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
}
