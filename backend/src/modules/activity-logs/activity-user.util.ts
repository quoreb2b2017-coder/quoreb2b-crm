import { Types } from 'mongoose';

export interface ActivityActor {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  employeeId?: string;
  roles?: string[];
}

export function displayName(actor: ActivityActor | null | undefined): string {
  if (!actor) return 'Unknown';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim();
  return name || actor.email || actor.employeeId || 'Unknown';
}

export function displayNameFromMeta(meta: Record<string, unknown>): string | undefined {
  const actorName = meta.actorName as string | undefined;
  if (actorName && actorName !== 'Unknown') return actorName;
  const userName = meta.userName as string | undefined;
  if (userName && userName !== 'Unknown') return userName;
  const email = meta.email as string | undefined;
  if (email) return email;
  const employeeId = meta.employeeId as string | undefined;
  if (employeeId) return employeeId;
  return undefined;
}

export type SanitizedUserSnapshot = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  employeeId?: string;
  roles?: string[];
};

export function primaryRole(actor: ActivityActor | null | undefined): string {
  if (!actor?.roles?.length) return 'unknown';
  return actor.roles[0];
}

export function actorFields(actor: ActivityActor | null | undefined) {
  if (!actor?.id || !Types.ObjectId.isValid(actor.id)) {
    return {
      userName: 'Unknown',
      userEmail: undefined as string | undefined,
      userRole: 'unknown',
      employeeId: undefined as string | undefined,
    };
  }
  return {
    userId: new Types.ObjectId(actor.id),
    userName: displayName(actor),
    userEmail: actor.email,
    userRole: primaryRole(actor),
    employeeId: actor.employeeId,
  };
}

export function actorFromJwt(user: {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  employeeId?: string;
  roles?: string[];
}): ActivityActor {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    employeeId: user.employeeId,
    roles: user.roles,
  };
}

export function actorFromUserDoc(user: {
  _id: Types.ObjectId | string;
  email?: string;
  firstName?: string;
  lastName?: string;
  employeeId?: string;
  roles?: string[];
}): ActivityActor {
  return {
    id: user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    employeeId: user.employeeId,
    roles: user.roles,
  };
}
