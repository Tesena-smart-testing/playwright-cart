import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import { useCallback, useEffect, useRef, useState } from 'react'
import ChartFilterBar, { type FilterValue } from '../components/charts/ChartFilterBar.js'
import ChartTile from '../components/charts/ChartTile.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useRunsMeta } from '../hooks/useRunsMeta.js'
import { useRunTimeline } from '../hooks/useRunTimeline.js'
import { updateMe } from '../lib/api.js'
import { type ChartId, DEFAULT_ORDER } from '../lib/charts.js'

export default function ChartsPage() {
  const { user } = useCurrentUser()
  const { data: meta } = useRunsMeta()
  const [filter, setFilter] = useState<FilterValue>({})
  const [order, setOrder] = useState<ChartId[]>(DEFAULT_ORDER)

  // Sync order from user preference once loaded
  useEffect(() => {
    if (user?.chartOrder && user.chartOrder.length === 6) {
      setOrder(user.chartOrder as ChartId[])
    }
  }, [user?.chartOrder])

  // Debounced persist
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistOrder = useCallback((newOrder: ChartId[]) => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      updateMe({ chartOrder: newOrder }).catch(() => {})
    }, 500)
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(active.id as ChartId)
    const newIndex = order.indexOf(over.id as ChartId)
    const newOrder = arrayMove(order, oldIndex, newIndex)
    setOrder(newOrder)
    persistOrder(newOrder)
  }

  // Single timeline fetch for the dashboard tiles (30 days daily)
  const { data: buckets = [], isLoading } = useRunTimeline({
    interval: 'day',
    days: 30,
    ...filter,
  })

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-bold">Charts</h1>
        <p className="mt-1 font-mono text-sm text-tn-muted">Trends and indicators over time</p>
      </div>

      {meta && (
        <div className="mb-6">
          <ChartFilterBar value={filter} onChange={setFilter} meta={meta} />
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {order.map((id) => (
              <ChartTile
                key={id}
                id={id}
                buckets={id === 'test-reliability' ? [] : buckets}
                isLoading={id !== 'test-reliability' && isLoading}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
