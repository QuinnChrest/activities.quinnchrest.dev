// MapLibre locates its worker relative to its own module URL, which breaks once
// Vite pre-bundles or hashes it. Let Vite bundle the worker and hand MapLibre the URL.
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)
