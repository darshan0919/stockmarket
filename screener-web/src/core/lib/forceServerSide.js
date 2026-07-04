/**
 * Opt pages into server-side rendering so `useRouter` and client hooks work at request time.
 * @returns {Promise<{ props: Record<string, never> }>}
 */
export async function getServerSideProps() {
  return { props: {} };
}
