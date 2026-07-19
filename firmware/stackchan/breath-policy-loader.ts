import Modules from 'modules'
import Preference from 'preference'

export const BREATH_POLICY_HOST_API_VERSION = 1
export const BREATH_POLICY_API_VERSION = 1
export const BREATH_POLICY_SCHEMA_VERSION = 1

const POLICY_PREFERENCE_DOMAIN = 'breath'
const POLICY_DISABLED_PREFERENCE_KEY = 'policyDisabled'

export type PolicyMeta = Readonly<{
  apiVersion: number
  minHostApiVersion: number
  maxHostApiVersion: number
  schemaVersion: number
  modBuildId: string
}>

type BreathPolicy = {
  apiVersion: number
  nextBreathScale: (phase: number) => number
}

const policyEnv = globalThis as typeof globalThis & {
  breathPolicyNativeError?: string
  breathPolicyNativeBuildId?: string
  breathPolicyState?: string
  breathPolicyHostApiVersion?: number
  breathPolicyBuildId?: string | null
  breathPolicyLastError?: string | null
}

const builtinPolicy: BreathPolicy = Object.freeze({
  apiVersion: BREATH_POLICY_API_VERSION,
  nextBreathScale(phase) {
    const normalized = Math.max(0, Math.min(1, Number(phase) || 0))
    return 0.96 + 0.04 * Math.sin(normalized * Math.PI)
  },
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function field(value: Record<string, unknown>, name: string): unknown {
  return value[name]
}

function requirePositiveInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`invalid policy metadata: ${name}`)
  return value as number
}

export function validateBreathPolicyMeta(value: unknown): PolicyMeta {
  if (!isRecord(value)) throw new Error('invalid policy metadata')

  const apiVersion = requirePositiveInteger(field(value, 'apiVersion'), 'apiVersion')
  const minHostApiVersion = requirePositiveInteger(field(value, 'minHostApiVersion'), 'minHostApiVersion')
  const maxHostApiVersion = requirePositiveInteger(field(value, 'maxHostApiVersion'), 'maxHostApiVersion')
  const schemaVersion = requirePositiveInteger(field(value, 'schemaVersion'), 'schemaVersion')
  const modBuildId = field(value, 'modBuildId')

  if (minHostApiVersion > maxHostApiVersion) throw new Error('invalid policy metadata: host API range')
  if (apiVersion !== BREATH_POLICY_API_VERSION) throw new Error(`unsupported policy API ${apiVersion}`)
  if (schemaVersion !== BREATH_POLICY_SCHEMA_VERSION) throw new Error(`unsupported policy schema ${schemaVersion}`)
  if (minHostApiVersion > BREATH_POLICY_HOST_API_VERSION || maxHostApiVersion < BREATH_POLICY_HOST_API_VERSION)
    throw new Error(`unsupported host API ${BREATH_POLICY_HOST_API_VERSION}`)
  if (typeof modBuildId !== 'string' || modBuildId.trim().length === 0)
    throw new Error('invalid policy metadata: modBuildId')

  return Object.freeze({ apiVersion, minHostApiVersion, maxHostApiVersion, schemaVersion, modBuildId })
}

export function setBreathPolicyDisabled(disabled: boolean): void {
  Preference.set(POLICY_PREFERENCE_DOMAIN, POLICY_DISABLED_PREFERENCE_KEY, disabled ? '1' : '0')
}

function rejectPolicy(error: unknown) {
  policyEnv.breathPolicyState = 'rejected'
  policyEnv.breathPolicyBuildId = null
  policyEnv.breathPolicyLastError = String(error)
  trace(`[breath-policy] using builtin: ${error}\n`)
  return builtinPolicy
}

export function loadBreathPolicy(): BreathPolicy {
  policyEnv.breathPolicyHostApiVersion = BREATH_POLICY_HOST_API_VERSION
  policyEnv.breathPolicyState = 'builtin'
  policyEnv.breathPolicyBuildId = null
  policyEnv.breathPolicyLastError = null

  if (policyEnv.breathPolicyNativeError) {
    policyEnv.breathPolicyState = 'failed'
    policyEnv.breathPolicyBuildId = policyEnv.breathPolicyNativeBuildId ?? null
    policyEnv.breathPolicyLastError = policyEnv.breathPolicyNativeError
    trace(`[breath-policy] native failure; using builtin: ${policyEnv.breathPolicyNativeError}\n`)
    return builtinPolicy
  }

  try {
    const disabledPreference = Preference.get(POLICY_PREFERENCE_DOMAIN, POLICY_DISABLED_PREFERENCE_KEY)
    if (disabledPreference === '1' || disabledPreference === 1) {
      policyEnv.breathPolicyState = 'disabled'
      trace('[breath-policy] disabled; using builtin\n')
      return builtinPolicy
    }
  } catch (error) {
    return rejectPolicy(`disabled preference read failed: ${error}`)
  }

  if (!Modules.has('breath-policy/meta') || !Modules.has('breath-policy/mod')) {
    return builtinPolicy
  }

  try {
    const importedMeta = Modules.importNow('breath-policy/meta') as unknown
    const meta = validateBreathPolicyMeta(
      isRecord(importedMeta) && 'default' in importedMeta ? field(importedMeta, 'default') : importedMeta,
    )

    const module = Modules.importNow('breath-policy/mod') as {
      createPolicy?: (host: { apiVersion: number }) => BreathPolicy
    }
    if (typeof module.createPolicy !== 'function') throw new Error('createPolicy export not found')
    const policy = module.createPolicy(Object.freeze({ apiVersion: BREATH_POLICY_HOST_API_VERSION }))
    if (!policy || policy.apiVersion !== meta.apiVersion || typeof policy.nextBreathScale !== 'function')
      throw new Error('invalid policy implementation')

    const smoke = policy.nextBreathScale(0.5)
    if (!Number.isFinite(smoke)) throw new Error('policy smoke check failed')
    policyEnv.breathPolicyState = 'active'
    policyEnv.breathPolicyBuildId = meta.modBuildId
    trace(`[breath-policy] active build=${meta.modBuildId} api=${meta.apiVersion}\n`)
    return policy
  } catch (error) {
    return rejectPolicy(error)
  }
}
