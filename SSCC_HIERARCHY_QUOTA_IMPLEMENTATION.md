# SSCC Hierarchy & Quota Implementation Plan

## Overview
This document outlines the implementation of hierarchical SSCC generation and quota management with yearly plan rollover.

## Part A: Hierarchical SSCC Level Selection

### UI Implementation (COMPLETED)
- ✅ Added checkboxes for Box, Carton, Pallet
- ✅ Auto-selection logic: Carton → Box, Pallet → Box + Carton
- ✅ Auto-unselection: Unselect Box → unselect Carton & Pallet
- ✅ Validation: At least one level must be selected

### Backend Implementation (IN PROGRESS)
- ⏳ Create `/api/sscc/generate` unified endpoint
- ⏳ Enforce hierarchy validation
- ⏳ Generate SSCCs for all selected levels
- ⏳ Return consolidated response

## Part B: SSCC Generation & Data Model

### SSCC Structure
- AI (00) - Serial Shipping Container Code
- 18 digits total
- Format: `(00)XXXXXXXXXXXXXXX` where X is 17-digit SSCC

### Database Schema
Each SSCC record stores:
- `sscc_code`: 17-digit SSCC
- `sscc_with_ai`: `(00)XXXXXXXXXXXXXXX`
- `sscc_level`: 'box' | 'carton' | 'pallet'
- `parent_sscc`: For aggregation (carton → pallet, box → carton)

## Part C: Quota Model

### Current State
- Separate quotas: `box_labels_quota`, `carton_labels_quota`, `pallet_labels_quota`
- No rollover for yearly plans
- Monthly reset for all plans

### Required Changes

#### 1. Consolidate SSCC Quota
- Single `sscc_quota_balance` field
- All levels (Box, Carton, Pallet) consume same quota
- Each SSCC generated = 1 quota consumed

#### 2. Add Quota Balance Tracking
Add to `companies` table:
- `unit_quota_balance` INTEGER DEFAULT 0
- `sscc_quota_balance` INTEGER DEFAULT 0
- `last_quota_rollover_at` TIMESTAMPTZ
- `add_on_unit_balance` INTEGER DEFAULT 0
- `add_on_sscc_balance` INTEGER DEFAULT 0

#### 3. Rollover Logic (Yearly Plans)
Before ANY generation:
1. Check if plan is yearly (`subscription_plan` contains 'annual' or 'yearly')
2. Calculate months elapsed since `last_quota_rollover_at`
3. For each elapsed month:
   - `unit_quota_balance += unit_quota_per_month`
   - `sscc_quota_balance += sscc_quota_per_month`
4. Update `last_quota_rollover_at` to current month start

#### 4. Quota Enforcement
- Check: `requested_count <= (quota_balance + add_on_balance)`
- Deduct from `quota_balance` first, then `add_on_balance`
- Refund on failure

## Implementation Steps

1. ✅ Update SSCC UI with hierarchical checkboxes
2. ⏳ Create unified SSCC generation API
3. ⏳ Add quota balance columns to companies table
4. ⏳ Implement rollover logic helper
5. ⏳ Update quota enforcement in generation APIs
6. ⏳ Update billing_usage to use consolidated SSCC quota

## Files to Modify

### Frontend
- ✅ `app/dashboard/code-generation/sscc/page.tsx` - UI with checkboxes

### Backend
- ⏳ `app/api/sscc/generate/route.ts` - NEW unified endpoint
- ⏳ `lib/billing/quota.ts` - NEW quota rollover helper
- ⏳ `app/api/issues/route.ts` - Update unit quota enforcement
- ⏳ `lib/billing/usage.ts` - Update to support consolidated SSCC quota

### Database
- ⏳ Migration: Add quota balance columns to companies
- ⏳ Migration: Migrate existing quota to balance fields
