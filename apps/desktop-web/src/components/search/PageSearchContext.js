import { createContext, useContext, useState } from 'react';

export const PageSearchContext = createContext({ query: '', setQuery: () => {} });
export const usePageSearch = () => useContext(PageSearchContext);

export function useSearchPage(query) {
  const [lastQuery, setLastQuery] = useState(query);
  const [page, setPage] = useState(1);
  if (lastQuery !== query) {
    setLastQuery(query);
    setPage(1);
  }
  return [page, setPage];
}
