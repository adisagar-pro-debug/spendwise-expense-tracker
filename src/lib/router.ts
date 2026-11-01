import { useEffect, useState } from 'react'
import type { PageKey } from '../components/Sidebar'

const VALID_PAGES: Record<string, PageKey> = {
  overview: 'overview',
  transactions: 'transactions',
  statements: 'statements',
  settings: 'settings',
  preferences: 'settings',
}

export function pathToPageKey(pathname: string): PageKey {
  const clean = pathname.replace(/^\//, '').toLowerCase().split('/')[0]
  return VALID_PAGES[clean] || 'overview'
}

export function pageKeyToPath(page: PageKey): string {
  return `/${page}`
}

export function useRouter() {
  const [currentPage, setCurrentPage] = useState<PageKey>(() => {
    if (typeof window === 'undefined') return 'overview'
    return pathToPageKey(window.location.pathname)
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      const page = pathToPageKey(window.location.pathname)
      setCurrentPage(page)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (page: PageKey | string, replace = false) => {
    if (typeof window === 'undefined') return

    const pageKey = (VALID_PAGES[page.replace(/^\//, '').toLowerCase()] || page) as PageKey
    const targetPath = page.startsWith('/') ? page : pageKeyToPath(pageKey)

    if (window.location.pathname !== targetPath) {
      if (replace) {
        window.history.replaceState({ page: pageKey }, '', targetPath)
      } else {
        window.history.pushState({ page: pageKey }, '', targetPath)
      }
    }
    setCurrentPage(pageKey)
  }

  return {
    currentPage,
    navigate,
  }
}
