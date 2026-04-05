export function computeImpact(graph, changed) {
  const upstream = new Map()
  const reverseConsumers = new Map()
  const forwardProducers = new Map()

  for (const edge of graph.edges) {
    if (!upstream.has(edge.from)) upstream.set(edge.from, [])
    upstream.get(edge.from).push(edge.to)

    if (['links_to', 'depends_on_explicit', 'depends_on_architecture', 'depends_on_brief'].includes(edge.kind)) {
      if (!reverseConsumers.has(edge.to)) reverseConsumers.set(edge.to, [])
      reverseConsumers.get(edge.to).push(edge.from)
    }

    if (['feeds_architecture'].includes(edge.kind)) {
      if (!forwardProducers.has(edge.from)) forwardProducers.set(edge.from, [])
      forwardProducers.get(edge.from).push(edge.to)
    }
  }

  function bfs(startPaths, adjacency) {
    const visited = new Set(startPaths)
    const queue = [...startPaths]
    while (queue.length > 0) {
      const current = queue.shift()
      for (const next of adjacency.get(current) || []) {
        if (visited.has(next)) continue
        visited.add(next)
        queue.push(next)
      }
    }
    return [...visited]
  }

  const requiredContext = bfs(changed, upstream).filter(item => !changed.includes(item))
  const affectedDownstream = [...new Set([
    ...bfs(changed, reverseConsumers),
    ...bfs(changed, forwardProducers)
  ])].filter(item => !changed.includes(item))

  return {
    changed,
    requiredContext,
    affectedDownstream
  }
}
