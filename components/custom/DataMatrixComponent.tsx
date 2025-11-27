// components/custom/DataMatrixComponent.tsx
import React from 'react';

// @ts-ignore — react-datamatrix-svg has broken "exports" in package.json (known issue)
import DataMatrixSVG from 'react-datamatrix-svg';

interface Props {
  value: string;
  size?: number;
}

const DataMatrixComponent: React.FC<Props> = ({ value, size = 200 }) => {
  return (
    // @ts-ignore — package has no proper types
    <DataMatrixSVG
      value={value}
      size={size}
      background="#ffffff"
      color="#000000"
    />
  );
};

export default DataMatrixComponent;