export type KnownSpecType = 'brief' | 'feature' | 'architecture' | 'implementation' | 'validation' | 'decision'
export type SpecType = KnownSpecType | 'unknown'
export type GraphNodeKind = 'spec'
export type ExtractionKind = 'explicit' | 'derived' | 'inferred'
export type CommandName = 'discover' | 'graph' | 'impact' | 'validate' | 'slice' | 'readiness'

export interface AdapterDefinition {
  name: string
  description: string
  specRoots: string[]
  typePatterns: Array<{
    match: string
    type: SpecType
  }>
  dependencyAliases: Record<string, string>
  relations: {
    featureDependsOnArchitecture?: string[]
    featureDependsOnBrief?: string[]
    decisionFeedsArchitecture?: string[]
  }
}

export interface SpecRecord {
  path: string
  nodeKind: GraphNodeKind
  type: SpecType
  title: string
  metadata: Record<string, string>
  permalink: string | null
  links: string[]
  explicitDependencies: string[]
}

export interface DiscoverResult {
  specs: SpecRecord[]
}

export type ReadinessStage = 'missing_spec' | 'needs_context' | 'needs_validation' | 'implementation_ready'
export type ReadinessSeverity = 'blocker' | 'warning'
export type ReadinessArtifactKind = 'brief' | 'architecture' | 'validation'

export type EdgeKind =
  | 'links_to'
  | 'depends_on_explicit'
  | 'depends_on_architecture'
  | 'depends_on_brief'
  | 'feeds_architecture'

export interface EdgeEvidence {
  extraction: ExtractionKind
  sourcePath: string
  sourceLine?: number
  detail: string
}

export interface GraphEdge {
  from: string
  to: string
  kind: EdgeKind
  evidence: EdgeEvidence[]
}

export interface Graph {
  nodes: SpecRecord[]
  edges: GraphEdge[]
}

export interface ImpactResult {
  changed: string[]
  requiredContext: string[]
  affectedDownstream: string[]
}

export interface ValidationIssue {
  severity: 'error'
  code: string
  path: string
  message: string
  target?: string
  dependency?: string
  relatedPath?: string
}

export interface ValidationResult {
  ok: boolean
  issueCount: number
  issues: ValidationIssue[]
}

export interface TemplateHint {
  path: string
  reason: string
}

export interface ReadinessArtifactRequirement {
  kind: ReadinessArtifactKind
  target: string
  satisfied: boolean
}

export interface ReadinessCheck {
  code: string
  severity: ReadinessSeverity
  message: string
  relatedPaths: string[]
}

export interface ReadinessReport {
  target: string
  type: SpecType | 'missing'
  ready: boolean
  stage: ReadinessStage
  scope: string[]
  requiredContext: string[]
  artifactRequirements: ReadinessArtifactRequirement[]
  blockers: ReadinessCheck[]
  warnings: ReadinessCheck[]
}

export interface ReadinessResult {
  targets: string[]
  reportCount: number
  readyCount: number
  reports: ReadinessReport[]
}

export interface SliceBundle {
  adapter: string
  changed: string[]
  missingChanged: string[]
  changedSpecs: SpecRecord[]
  requiredContext: string[]
  requiredContextSpecs: SpecRecord[]
  affectedDownstream: string[]
  affectedDownstreamSpecs: SpecRecord[]
  validation: ValidationResult
  handoff: {
    workflow: 'spec-review-and-slice'
    checkpoints: string[]
    templateHints: TemplateHint[]
  }
}

export interface CommandEnvelope<T> {
  contractVersion: '0.1'
  command: CommandName
  adapter: string
  repo: string
  ok: boolean
  result: T
}
