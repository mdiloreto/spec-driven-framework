import type { CommandEnvelope, CommandName } from './types.js'

export function createCommandEnvelope<T>(input: {
  command: CommandName
  adapter: string
  repo: string
  result: T
  ok?: boolean
}): CommandEnvelope<T> {
  return {
    contractVersion: '0.1',
    command: input.command,
    adapter: input.adapter,
    repo: input.repo,
    ok: input.ok ?? true,
    result: input.result
  }
}
