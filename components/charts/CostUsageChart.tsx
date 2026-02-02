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

/** Different colour per code type: Unit, Box, Carton, Pallet */
const COLORS = ['#0052CC', '#FF6B35', '#10B981', '#8B5CF6'];

/** Fallback prices (₹) when add-on prices not loaded – match typical add_ons seed */
const FALLBACK_PRICES = { unit: 0.10, box: 0.30, carton: 1.00, pallet: 2.00 };

export type AddonPrices = { unit: number; box: number; carton: number; pallet: number };

export function CostUsageChart({
  data,
  prices: pricesProp,
}: {
  data: { unit: number; box: number; carton: number; pallet: number };
  prices?: AddonPrices | null;
}): ReactElement {
  const prices = pricesProp ?? FALLBACK_PRICES;

  const chartData: CostData[] = [
    { name: 'Unit', cost: (data.unit || 0) * (prices.unit ?? 0), color: COLORS[0] },
    { name: 'Box', cost: (data.box || 0) * (prices.box ?? 0), color: COLORS[1] },
    { name: 'Carton', cost: (data.carton || 0) * (prices.carton ?? 0), color: COLORS[2] },
    { name: 'Pallet', cost: (data.pallet || 0) * (prices.pallet ?? 0), color: COLORS[3] },
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
