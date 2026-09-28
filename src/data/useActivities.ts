import { useEffect, useState } from 'react'
import type { ActivitiesFile } from './types'

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: ActivitiesFile }

let cache: Promise<ActivitiesFile> | undefined

function load() {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/activities.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load activities (${r.status})`)
    return r.json() as Promise<ActivitiesFile>
  })
  return cache
}

/** Loads public/data/activities.json once and shares it across pages. */
export function useActivities(): State {
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    load().then(
      (data) => alive && setState({ status: 'ready', data }),
      (err: Error) => {
        cache = undefined
        if (alive) setState({ status: 'error', error: err.message })
      },
    )
    return () => {
      alive = false
    }
  }, [])
  return state
}
