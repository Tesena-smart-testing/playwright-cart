import { EventEmitter } from 'node:events'

export type RunEvent =
  | { type: 'run:created'; runId: string }
  | { type: 'run:updated'; runId: string }

class RunEventEmitter extends EventEmitter {}

export const runEmitter = new RunEventEmitter().setMaxListeners(0)
