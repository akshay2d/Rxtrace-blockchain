'use client';

import { Progress } from '@/components/ui/progress';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type UsageMeterProps = {
  label: string;
  used: number;
  limit: number | null;
  limitType: 'HARD' | 'SOFT' | 'NONE';
  exceeded?: boolean;
};

export function UsageMeter({ label, used, limit, limitType, exceeded }: UsageMeterProps) {
  if (limitType === 'NONE' || limit === null) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">{label}</span>
          <span className="font-semibold text-gray-900">{used.toLocaleString('en-IN')}</span>
        </div>
        <div className="text-xs text-gray-500">Unlimited</div>
      </div>
    );
  }

  const percentage = Math.min(100, Math.round((used / limit) * 100));
  const isOverLimit = exceeded || used > limit;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className={`font-semibold ${isOverLimit ? 'text-red-600' : 'text-gray-900'}`}>
          {used.toLocaleString('en-IN')} / {limit.toLocaleString('en-IN')}
        </span>
      </div>
      <Progress 
        value={percentage} 
        className={isOverLimit ? 'bg-red-200' : percentage > 80 ? 'bg-yellow-200' : ''}
      />
      {isOverLimit && limitType === 'SOFT' && (
        <Alert variant="default" className="bg-yellow-50 border-yellow-200">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 text-xs">
            Soft limit exceeded. You can continue using this feature, but consider upgrading your plan.
          </AlertDescription>
        </Alert>
      )}
      {isOverLimit && limitType === 'HARD' && (
        <Alert variant="destructive" className="text-xs">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Hard limit reached. Please upgrade your plan to continue.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
