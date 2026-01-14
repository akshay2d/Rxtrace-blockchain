// @ts-nocheck
'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { ReactElement } from 'react';

type CostData = {
  name: string;
  cost: number;
  color: string;
};

const COLORS = ['#0052CC', '#FF6B35', '#10B981', '#8B5CF6'];

export function CostUsageChart({ data }: { data: { unit: number; box: number; carton: number; pallet: number } }): ReactElement {
  // Cost per label type (in paisa, from billingConfig)
  const COST_PER_LABEL = {
    unit: 0.10,
    box: 0.25,
    carton: 0.50,
    pallet: 1.00,
  };

  const chartData: CostData[] = [
    { name: 'Unit', cost: (data.unit || 0) * COST_PER_LABEL.unit, color: COLORS[0] },
    { name: 'Box', cost: (data.box || 0) * COST_PER_LABEL.box, color: COLORS[1] },
    { name: 'Carton', cost: (data.carton || 0) * COST_PER_LABEL.carton, color: COLORS[2] },
    { name: 'Pallet', cost: (data.pallet || 0) * COST_PER_LABEL.pallet, color: COLORS[3] },
  ];

  const totalCost = chartData.reduce((sum, item) => sum + item.cost, 0);

  if (totalCost === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>No cost data available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="text-center mb-2">
        <span className="text-sm text-gray-500">Total Cost: </span>
        <span className="text-lg font-semibold text-blue-700">
          ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `₹${value}`}
            />
            <Tooltip 
              formatter={(value) => [`₹${Number(value ?? 0).toFixed(2)}`, 'Cost']}
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '12px'
              }}
            />
            <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
