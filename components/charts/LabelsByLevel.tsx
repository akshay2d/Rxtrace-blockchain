// @ts-nocheck
'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import type { ReactElement } from 'react';

type LevelData = {
  name: string;
  value: number;
  color: string;
};

const COLORS = ['#0052CC', '#FF6B35', '#10B981', '#8B5CF6'];

export function LabelsByLevel({ data }: { data: { unit: number; box: number; carton: number; pallet: number } }): ReactElement {
  const chartData: LevelData[] = [
    { name: 'Unit', value: data.unit || 0, color: COLORS[0] },
    { name: 'Box', value: data.box || 0, color: COLORS[1] },
    { name: 'Carton', value: data.carton || 0, color: COLORS[2] },
    { name: 'Pallet', value: data.pallet || 0, color: COLORS[3] },
  ].filter(item => item.value > 0);

  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>No label data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={{ stroke: '#9CA3AF', strokeWidth: 1 }}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip 
          formatter={(value) => [Number(value ?? 0).toLocaleString('en-IN'), 'Labels']}
          contentStyle={{ 
            backgroundColor: '#fff', 
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            fontSize: '12px'
          }}
        />
        <Legend 
          wrapperStyle={{ fontSize: '12px' }}
          formatter={(value) => {
            const item = chartData.find(d => d.name === value);
            return `${value}: ${item?.value.toLocaleString('en-IN') || 0}`;
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
