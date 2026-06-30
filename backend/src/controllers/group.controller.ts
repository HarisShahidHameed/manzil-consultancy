import { Request, Response } from 'express';
import * as groupService from '../services/group.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { createGroupSchema, updateGroupSchema, groupMembersSchema } from '../validators/client.validators';

export const listGroups = async (req: Request, res: Response): Promise<void> => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const groups = await groupService.listGroups(search);
  sendSuccess(res, 'Groups retrieved', groups);
};

export const getGroup = async (req: Request, res: Response): Promise<void> => {
  const group = await groupService.getGroupById(req.params.id);
  if (!group) { sendError(res, 'Group not found', 404); return; }
  sendSuccess(res, 'Group retrieved', group);
};

export const createGroup = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = createGroupSchema.parse(req.body);
    const group = await groupService.createGroup(data);
    await createAuditLog({ userId: req.user?.sub, action: 'GROUP_CREATED', resource: 'groups', resourceId: group.id, details: { groupRef: group.groupRef }, req });
    sendSuccess(res, 'Group created', group, 201);
  } catch (error: any) {
    if (error?.name === 'ZodError') { sendError(res, 'Validation failed', 422, error.flatten().fieldErrors); return; }
    sendError(res, 'Failed to create group', 500);
  }
};

export const updateGroup = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = updateGroupSchema.parse(req.body);
    const group = await groupService.updateGroup(req.params.id, data);
    await createAuditLog({ userId: req.user?.sub, action: 'GROUP_UPDATED', resource: 'groups', resourceId: req.params.id, req });
    sendSuccess(res, 'Group updated', group);
  } catch (error: any) {
    if (error?.name === 'ZodError') { sendError(res, 'Validation failed', 422, error.flatten().fieldErrors); return; }
    if (error?.code === 'P2025') { sendError(res, 'Group not found', 404); return; }
    sendError(res, 'Failed to update group', 500);
  }
};

export const deleteGroup = async (req: Request, res: Response): Promise<void> => {
  try {
    await groupService.deleteGroup(req.params.id);
    await createAuditLog({ userId: req.user?.sub, action: 'GROUP_DELETED', resource: 'groups', resourceId: req.params.id, req });
    sendSuccess(res, 'Group deleted');
  } catch {
    sendError(res, 'Group not found', 404);
  }
};

export const addMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientIds } = groupMembersSchema.parse(req.body);
    const group = await groupService.addMembers(req.params.id, clientIds);
    await createAuditLog({ userId: req.user?.sub, action: 'GROUP_MEMBERS_ADDED', resource: 'groups', resourceId: req.params.id, details: { clientIds }, req });
    sendSuccess(res, 'Members added', group);
  } catch (error: any) {
    if (error?.name === 'ZodError') { sendError(res, 'Validation failed', 422, error.flatten().fieldErrors); return; }
    sendError(res, 'Failed to add members', 500);
  }
};

export const removeMember = async (req: Request, res: Response): Promise<void> => {
  const group = await groupService.removeMember(req.params.id, req.params.clientId);
  await createAuditLog({ userId: req.user?.sub, action: 'GROUP_MEMBER_REMOVED', resource: 'groups', resourceId: req.params.id, details: { clientId: req.params.clientId }, req });
  sendSuccess(res, 'Member removed', group);
};
