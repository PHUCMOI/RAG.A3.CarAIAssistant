import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
