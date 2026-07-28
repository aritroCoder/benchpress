/** Multi-drag drop: collapse the selected ids into one contiguous block at the
 *  dragged item's landing position. `planOrder` fixes the block's internal order
 *  (the selection is a Set — the plan is the authority on relative order). */
export function collapseBlock(
  order: readonly string[],
  draggedId: string,
  selected: ReadonlySet<string>,
  planOrder: readonly string[],
): string[] {
  const i = order.indexOf(draggedId)
  if (i === -1 || !selected.has(draggedId)) return [...order]
  const block = planOrder.filter((id) => selected.has(id) && order.includes(id))
  const rest = order.filter((id) => !selected.has(id))
  const insertAt = order.slice(0, i).filter((id) => !selected.has(id)).length
  return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
}
