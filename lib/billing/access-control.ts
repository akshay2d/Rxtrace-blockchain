// Role-Based Access Control for Billing Operations
// Phase 3: Access Control and Grace Period
// Task 3.3: Implement role-based access control

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';
import { BillingErrors, BillingErrorCode } from '@/lib/billing/errors';

// Role definitions
export enum BillingRole {
    OWNER = 'owner',
    ADMIN = 'admin',
    MEMBER = 'member',
    BILLING_MANAGER = 'billing_manager',
}

// Permission definitions
export enum BillingPermission {
    VIEW_SUBSCRIPTION = 'view_subscription',
    UPGRADE_PLAN = 'upgrade_plan',
    DOWNGRADE_PLAN = 'downgrade_plan',
    CANCEL_SUBSCRIPTION = 'cancel_subscription',
    PAUSE_SUBSCRIPTION = 'pause_subscription',
    RESUME_SUBSCRIPTION = 'resume_subscription',
    MANAGE_ADDONS = 'manage_addons',
    VIEW_INVOICES = 'view_invoices',
    DOWNLOAD_INVOICES = 'download_invoices',
    MANAGE_PAYMENT_METHODS = 'manage_payment_methods',
    VIEW_BILLING_HISTORY = 'view_billing_history',
    MANAGE_DISCOUNTS = 'manage_discounts',
}

// Role-Permission mapping
export const ROLE_PERMISSIONS: Record<BillingRole, BillingPermission[]> = {
    [BillingRole.OWNER]: Object.values(BillingPermission),
    [BillingRole.BILLING_MANAGER]: [
        BillingPermission.VIEW_SUBSCRIPTION,
        BillingPermission.UPGRADE_PLAN,
        BillingPermission.DOWNGRADE_PLAN,
        BillingPermission.PAUSE_SUBSCRIPTION,
        BillingPermission.RESUME_SUBSCRIPTION,
        BillingPermission.MANAGE_ADDONS,
        BillingPermission.VIEW_INVOICES,
        BillingPermission.DOWNLOAD_INVOICES,
        BillingPermission.VIEW_BILLING_HISTORY,
    ],
    [BillingRole.ADMIN]: [
        BillingPermission.VIEW_SUBSCRIPTION,
        BillingPermission.VIEW_INVOICES,
        BillingPermission.DOWNLOAD_INVOICES,
        BillingPermission.VIEW_BILLING_HISTORY,
    ],
    [BillingRole.MEMBER]: [
        BillingPermission.VIEW_SUBSCRIPTION,
        BillingPermission.VIEW_INVOICES,
    ],
};

// User role info from database
export interface UserRoleInfo {
    userId: string;
    companyId: string;
    role: BillingRole;
    isOwner: boolean;
}

// Check if user has permission
export function hasPermission(
    role: BillingRole,
    permission: BillingPermission
): boolean {
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission);
}

// Check multiple permissions (all required)
export function hasAllPermissions(
    role: BillingRole,
    permissions: BillingPermission[]
): boolean {
    return permissions.every(p => hasPermission(role, p));
}

// Check any permission (at least one required)
export function hasAnyPermission(
    role: BillingRole,
    permissions: BillingPermission[]
): boolean {
    return permissions.some(p => hasPermission(role, p));
}

// Get user role from database
export async function getUserBillingRole(
    userId: string,
    companyId: string
): Promise<UserRoleInfo | null> {
    const admin = getSupabaseAdmin();

    // First check if user is company owner
    const { data: company, error: companyError } = await admin
        .from('companies')
        .select('user_id')
        .eq('id', companyId)
        .maybeSingle();

    if (companyError || !company) {
        return null;
    }

    const isOwner = company.user_id === userId;

    if (isOwner) {
        return {
            userId,
            companyId,
            role: BillingRole.OWNER,
            isOwner: true,
        };
    }

    // Check user role in company_users or staff_company_relations table
    const { data: userRole, error: roleError } = await admin
        .from('company_users')
        .select('role')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .maybeSingle();

    if (roleError || !userRole) {
        // Default to member if no role found
        return {
            userId,
            companyId,
            role: BillingRole.MEMBER,
            isOwner: false,
        };
    }

    // Map database role to BillingRole
    const role = mapDatabaseRoleToBillingRole(userRole.role) || BillingRole.MEMBER;

    return {
        userId,
        companyId,
        role,
        isOwner: false,
    };
}

// Map database role string to BillingRole enum
function mapDatabaseRoleToBillingRole(dbRole: string): BillingRole | null {
    const roleMap: Record<string, BillingRole> = {
        'owner': BillingRole.OWNER,
        'admin': BillingRole.ADMIN,
        'member': BillingRole.MEMBER,
        'billing_manager': BillingRole.BILLING_MANAGER,
        'staff': BillingRole.MEMBER,
        'viewer': BillingRole.MEMBER,
    };
    return roleMap[dbRole.toLowerCase()] || null;
}

// Authorization middleware for billing operations
export async function authorizeBillingOperation(
    userId: string,
    companyId: string,
    requiredPermission: BillingPermission
): Promise<{
    authorized: boolean;
    role?: BillingRole;
    error?: string;
}> {
    const roleInfo = await getUserBillingRole(userId, companyId);

    if (!roleInfo) {
        return {
            authorized: false,
            error: 'Unable to determine user role',
        };
    }

    if (!hasPermission(roleInfo.role, requiredPermission)) {
        return {
            authorized: false,
            role: roleInfo.role,
            error: getPermissionDeniedMessage(requiredPermission, roleInfo.role),
        };
    }

    return {
        authorized: true,
        role: roleInfo.role,
    };
}

// Get user-friendly permission denied message
function getPermissionDeniedMessage(
    permission: BillingPermission,
    role: BillingRole
): string {
    const actionMessages: Record<string, string> = {
        [BillingPermission.UPGRADE_PLAN]: 'Upgrading plans requires owner privileges',
        [BillingPermission.DOWNGRADE_PLAN]: 'Downgrading plans requires owner privileges',
        [BillingPermission.CANCEL_SUBSCRIPTION]: 'Only company owner can cancel subscription',
        [BillingPermission.PAUSE_SUUSCRIPTION]: 'Pausing subscription requires owner privileges',
        [BillingPermission.RESUME_SUBSCRIPTION]: 'Resuming subscription requires owner privileges',
        [BillingPermission.MANAGE_ADDONS]: 'Managing add-ons requires owner or billing manager privileges',
        [BillingPermission.DOWNLOAD_INVOICES]: 'Downloading invoices requires billing manager privileges or higher',
        [BillingPermission.MANAGE_DISCOUNTS]: 'Managing discounts requires owner privileges',
    };

    return actionMessages[permission] || `This action requires higher privileges. Your current role: ${role}`;
}

// Require billing ownership check
export async function requireBillingOwnership(
    userId: string,
    companyId: string
): Promise<{
    isOwner: boolean;
    role?: BillingRole;
    error?: string;
}> {
    const roleInfo = await getUserBillingRole(userId, companyId);

    if (!roleInfo) {
        return {
            isOwner: false,
            error: 'Unable to determine user role',
        };
    }

    if (!roleInfo.isOwner && roleInfo.role !== BillingRole.OWNER) {
        return {
            isOwner: false,
            role: roleInfo.role,
            error: 'Only company owner can perform this action',
        };
    }

    return {
        isOwner: true,
        role: roleInfo.role,
    };
}

// Middleware helper for API routes
export async function withBillingAuthorization(
    userId: string,
    companyId: string,
    requiredPermission: BillingPermission,
    operation: string
): Promise<{
    allowed: boolean;
    response?: { status: number; body: any };
}> {
    const authResult = await authorizeBillingOperation(userId, companyId, requiredPermission);

    if (!authResult.authorized) {
        // Log unauthorized access attempt
        await writeAuditLog({
            companyId,
            actor: userId,
            action: `billing_unauthorized_${operation}`,
            status: 'failed',
            integrationSystem: 'billing',
            metadata: {
                permission: requiredPermission,
                role: authResult.role,
                reason: authResult.error,
            },
        }).catch(() => undefined);

        return {
            allowed: false,
            response: {
                status: 403,
                body: {
                    success: false,
                    error: authResult.error,
                    code: BillingErrorCode.FORBIDDEN,
                },
            },
        };
    }

    return { allowed: true };
}

// Decorator-style authorization check for route handlers
export function requireBillingPermission(permission: BillingPermission) {
    return async function (
        userId: string,
        companyId: string
    ): Promise<{
        authorized: boolean;
        role?: BillingRole;
        error?: string;
    }> {
        return authorizeBillingOperation(userId, companyId, permission);
    };
}

// Get all permissions for a role
export function getPermissionsForRole(role: BillingRole): BillingPermission[] {
    return ROLE_PERMISSIONS[role] || [];
}

// Get role display name
export function getRoleDisplayName(role: BillingRole): string {
    const displayNames: Record<BillingRole, string> = {
        [BillingRole.OWNER]: 'Owner',
        [BillingRole.ADMIN]: 'Admin',
        [BillingRole.MEMBER]: 'Member',
        [BillingRole.BILLING_MANAGER]: 'Billing Manager',
    };
    return displayNames[role] || role;
}

// Audit logging for billing access
export async function logBillingAccess(
    companyId: string,
    userId: string,
    action: string,
    permission: BillingPermission,
    success: boolean,
    details?: Record<string, any>
): Promise<void> {
    await writeAuditLog({
        companyId,
        actor: userId,
        action: `billing_${action}`,
        status: success ? 'success' : 'failed',
        integrationSystem: 'billing',
        metadata: {
            permission,
            ...details,
        },
    }).catch(() => undefined);
}
