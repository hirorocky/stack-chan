import breathMod from 'breath/mod'
import { onLaunch } from 'default-mods/on-launch'
import type { Robot } from 'robot'

export interface StackchanMod {
  onLaunch?: () => Promise<boolean> | boolean
  onRobotCreated?: (robot: Robot, option?: unknown) => Promise<void> | void
}

const { onRobotCreated } = breathMod

export { onRobotCreated }
export default {
  onLaunch,
  onRobotCreated,
}
