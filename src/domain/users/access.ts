export const MANAGEABLE_ROLES = ["admin", "manager", "sales", "viewer", "support"] as const;
export const OWNER_ONLY_ROLES = ["owner"] as const;
export const MEMBER_STATUSES = ["active", "invited", "blocked"] as const;

export type RoleKey = (typeof MANAGEABLE_ROLES)[number] | (typeof OWNER_ONLY_ROLES)[number];
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === "owner") return [...MANAGEABLE_ROLES, ...OWNER_ONLY_ROLES].includes(targetRole as RoleKey);
  if (actorRole === "admin") return MANAGEABLE_ROLES.includes(targetRole as (typeof MANAGEABLE_ROLES)[number]);
  return false;
}

export function canManageMember(actor: { userId: string; role: string }, target: { userId: string; role: string }) {
  if (actor.userId === target.userId) return false;
  if (actor.role === "owner") return true;
  if (actor.role === "admin") return target.role !== "owner";
  return false;
}

export function isMemberStatus(value: string): value is MemberStatus {
  return MEMBER_STATUSES.includes(value as MemberStatus);
}
