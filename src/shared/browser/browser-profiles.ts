// Why: `persist:nexus-profile-*` partition 前缀是 profile 数据（cookies/storage）的磁盘命名契约，
// 必须跨版本保持稳定；用户磁盘 Partitions/ 目录会出现该前缀的目录名（仅非默认 profile 场景产生）。
import { NEXUS_BROWSER_PARTITION } from './constants'
import type { ExecutionHostId } from './execution-host'

export const NEXUS_PROFILE_INDEX_SCHEMA_VERSION = 1
export const DEFAULT_LOCAL_APP_PROFILE_ID = 'local-default'
export const DEFAULT_LOCAL_APP_PROFILE_NAME = 'Personal'
const LEGACY_NEXUS_BROWSER_SESSION_PARTITION_PREFIX = 'persist:nexus-browser-session-'

export type BrowserProfileAvatar = {
  kind: 'initials'
  initials: string
  color: 'neutral'
}

export type BrowserProfileKind = 'local' | 'cloud-linked'

export type BrowserProfileCloudSummary = {
  cloudProfileId: string
  userId: string
  email: string
  displayName?: string
  activeOrgId?: string
  activeOrgName?: string
  linkedAt: number
}

export type BrowserCloudOrgSummary = {
  orgId: string
  name: string
  role?: string
}

export type BrowserCloudCapabilityFlags = Record<string, boolean>

export type BrowserCloudCapabilities = {
  flags: BrowserCloudCapabilityFlags
  refreshedAt: number
}

export type BrowserCloudSessionPersistence = 'none' | 'encrypted' | 'memory-only' | 'dev-plaintext'

export type BrowserProfileAuthState = 'local' | 'unconfigured' | 'connected' | 'reconnect-required'

export type BrowserProfileAuthStatus = {
  activeProfileId: string
  configured: boolean
  state: BrowserProfileAuthState
  persistence: BrowserCloudSessionPersistence
  cloud?: BrowserProfileCloudSummary
  organizations?: BrowserCloudOrgSummary[]
  capabilities?: BrowserCloudCapabilities
  credentialError?: string
  setupMessage?: string
}

export type BrowserProfileSummary = {
  id: string
  name: string
  avatar: BrowserProfileAvatar
  kind: BrowserProfileKind
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  cloud?: BrowserProfileCloudSummary
}

export type BrowserProfileIndex = {
  schemaVersion: number
  activeProfileId: string
  profiles: BrowserProfileSummary[]
}

export type BrowserProfileListState = {
  activeProfileId: string
  profiles: BrowserProfileSummary[]
}

export type BrowserProfileListResult = BrowserProfileListState & {
  // Why: gates the full multi-profile switcher UI; default builds show a
  // single-profile account menu instead.
  multiProfileUi: boolean
}

export type CreateLocalBrowserProfileArgs = {
  name?: string
}

export type CreateLocalBrowserProfileResult = BrowserProfileListState & {
  profile: BrowserProfileSummary
}

export type CreateCloudLinkedBrowserProfileArgs = {
  orgId?: string
  name?: string
}

export type SwitchBrowserProfileArgs = {
  profileId: string
}

export type SwitchBrowserProfileResult = {
  status: 'already-active' | 'relaunching'
}

export type TransferBrowserProfileProjectMode = 'move' | 'copy'

export type TransferBrowserProfileProjectArgs = {
  sourceProfileId: string
  targetProfileId: string
  repoId: string
  mode: TransferBrowserProfileProjectMode
}

export type FindBrowserProfileProjectsByPathArgs = {
  path: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
  excludeProfileId?: string | null
}

export type BrowserProfileProjectPresence = {
  profileId: string
  profileName: string
  profileKind: BrowserProfileKind
  repoId: string
  repoName: string
}

export type FindBrowserProfileProjectsByPathResult = {
  projects: BrowserProfileProjectPresence[]
}

export type TransferBrowserProfileProjectResult =
  | {
      status: 'transferred'
      mode: TransferBrowserProfileProjectMode
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      targetRepoId: string
      targetProjectId: string | null
      willRelaunch?: boolean
    }
  | {
      status: 'duplicate-target'
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      duplicateRepoId: string
    }

export type ConnectCurrentBrowserProfileResult =
  | {
      status: 'connected'
      auth: BrowserProfileAuthStatus
      activeProfileId: string
      profiles: BrowserProfileSummary[]
    }
  | {
      status: 'unconfigured'
      auth: BrowserProfileAuthStatus
    }
  | {
      status: 'cancelled'
      auth: BrowserProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: BrowserProfileAuthStatus
      error: string
    }

export type CreateCloudLinkedBrowserProfileResult =
  | {
      status: 'created'
      auth: BrowserProfileAuthStatus
      activeProfileId: string
      profiles: BrowserProfileSummary[]
      profile: BrowserProfileSummary
    }
  | {
      status: 'unconfigured' | 'reconnect-required'
      auth: BrowserProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: BrowserProfileAuthStatus
      error: string
    }

export type SignOutCurrentBrowserProfileResult = {
  status: 'signed-out'
  auth: BrowserProfileAuthStatus
  activeProfileId: string
  profiles: BrowserProfileSummary[]
}

export type SelectBrowserProfileOrgArgs = {
  orgId: string
}

export type SelectBrowserProfileOrgResult =
  | {
      status: 'selected'
      auth: BrowserProfileAuthStatus
      activeProfileId: string
      profiles: BrowserProfileSummary[]
    }
  | {
      status: 'unconfigured' | 'reconnect-required'
      auth: BrowserProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: BrowserProfileAuthStatus
      error: string
    }

export type RefreshCurrentBrowserProfileAuthResult =
  | {
      status: 'refreshed'
      auth: BrowserProfileAuthStatus
      activeProfileId: string
      profiles: BrowserProfileSummary[]
    }
  | {
      status: 'local' | 'unconfigured' | 'reconnect-required'
      auth: BrowserProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: BrowserProfileAuthStatus
      error: string
    }

// Why: organization roles are a fixed server-side enum; the desktop UI mirrors
// exactly these three so role selects can't drift from what the API accepts.
export type BrowserOrgRole = 'owner' | 'admin' | 'member'

export type BrowserOrgMember = {
  // Why: null for teammates provisioned server-side who never signed into Nexus;
  // mutation actions are disabled for them since the API keys on a real userId.
  userId: string | null
  email: string
  displayName?: string
  role: BrowserOrgRole
}

export type BrowserOrgPendingInvite = {
  email: string
  role: BrowserOrgRole
  createdAt: number
}

export type BrowserOrgMembersRoster = {
  members: BrowserOrgMember[]
  pendingInvites: BrowserOrgPendingInvite[]
  viewerRole: BrowserOrgRole
  canManageMembers: boolean
}

export type BrowserProfileOrgMembersListArgs = {
  orgId: string
}

export type BrowserProfileOrgMemberInviteArgs = {
  orgId: string
  email: string
  role: BrowserOrgRole
}

export type BrowserProfileOrgInviteRevokeArgs = {
  orgId: string
  email: string
}

export type BrowserProfileOrgMemberChangeRoleArgs = {
  orgId: string
  userId: string
  role: BrowserOrgRole
}

export type BrowserProfileOrgMemberRemoveArgs = {
  orgId: string
  userId: string
}

export type BrowserProfileOrgMembersListResult =
  | { status: 'ok'; roster: BrowserOrgMembersRoster }
  | { status: 'unconfigured' | 'reconnect-required' }
  | { status: 'failed'; error: string }

export type BrowserOrgInviteConflictReason = 'already_member' | 'already_invited'
export type BrowserOrgMutationInvalidReason = 'cannot_change_own_role' | 'cannot_remove_self'

export type BrowserProfileOrgMemberMutationResult =
  | { status: 'ok' }
  | { status: 'unconfigured' | 'reconnect-required' | 'forbidden' | 'not-found' }
  | { status: 'conflict'; reason: BrowserOrgInviteConflictReason }
  | { status: 'invalid'; reason: BrowserOrgMutationInvalidReason }
  | { status: 'failed'; error: string }

export function createDefaultLocalBrowserProfile(now: number): BrowserProfileSummary {
  return {
    id: DEFAULT_LOCAL_APP_PROFILE_ID,
    name: DEFAULT_LOCAL_APP_PROFILE_NAME,
    avatar: { kind: 'initials', initials: 'P', color: 'neutral' },
    kind: 'local',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now
  }
}

function profilePartitionHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getBrowserPartitionSegment(profileId: string): string {
  const safe = profileId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48) || 'profile'
  return `${safe}-${profilePartitionHash(profileId)}`
}

export function getBrowserDefaultPartition(profileId: string): string {
  if (profileId === DEFAULT_LOCAL_APP_PROFILE_ID) {
    return NEXUS_BROWSER_PARTITION
  }
  return `persist:nexus-profile-${getBrowserPartitionSegment(profileId)}-browser-default`
}

export function getBrowserSessionPartition(
  profileId: string,
  browserSessionProfileId: string
): string {
  if (profileId === DEFAULT_LOCAL_APP_PROFILE_ID) {
    return `${LEGACY_NEXUS_BROWSER_SESSION_PARTITION_PREFIX}${browserSessionProfileId}`
  }
  return `persist:nexus-profile-${getBrowserPartitionSegment(
    profileId
  )}-browser-session-${browserSessionProfileId}`
}
