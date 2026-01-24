/**
 * Company Validation Helper
 * Reusable utility functions for validating company data
 */

import { prisma } from "@/app/lib/prisma";

export interface CompanyValidationResult {
  valid: boolean;
  company?: {
    id: string;
    company_name: string;
    status?: string;
  };
  error?: string;
}

/**
 * Validate that a company exists and is active
 * @param companyId - The company ID to validate
 * @returns Validation result with company data if valid
 */
export async function validateCompany(companyId: string): Promise<CompanyValidationResult> {
  try {
    if (!companyId || typeof companyId !== 'string') {
      return {
        valid: false,
        error: 'Invalid company_id format'
      };
    }

    const company = await prisma.companies.findUnique({
      where: { id: companyId },
      select: { 
        id: true, 
        company_name: true,
        // Note: companies table doesn't have status field in schema
        // If status field exists in your DB, add it here
      }
    });

    if (!company) {
      return {
        valid: false,
        error: 'Company not found'
      };
    }

    // If company has status field, check it's active
    // For now, if company exists, it's considered valid
    // You can add status check here if needed:
    // if (company.status && company.status !== 'ACTIVE') {
    //   return { valid: false, error: 'Company is not active' };
    // }

    return {
      valid: true,
      company: {
        id: company.id,
        company_name: company.company_name
      }
    };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message || 'Failed to validate company'
    };
  }
}

/**
 * Validate company and throw error if invalid
 * Useful for API endpoints that need to fail fast
 * @param companyId - The company ID to validate
 * @throws Error if company is invalid
 */
export async function validateCompanyOrThrow(companyId: string): Promise<{
  id: string;
  company_name: string;
}> {
  const result = await validateCompany(companyId);
  
  if (!result.valid || !result.company) {
    throw new Error(result.error || 'Company validation failed');
  }
  
  return result.company;
}
