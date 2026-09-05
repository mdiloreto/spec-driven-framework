import type { KnownSpecType } from './types.js'

export const SPEC_TYPES: Record<KnownSpecType, { description: string }> = {
  brief: {
    description: 'Product or business intent.'
  },
  feature: {
    description: 'User-facing capability or workflow slice.'
  },
  architecture: {
    description: 'Technical design and contracts.'
  },
  implementation: {
    description: 'Reviewable implementation slices.'
  },
  validation: {
    description: 'Verification plans and test-facing specs.'
  },
  decision: {
    description: 'Architectural or conceptual decisions.'
  }
}
