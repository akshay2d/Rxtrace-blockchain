// components/custom/DataMatrixComponent.tsx
import { DataMatrixSVG } from "react-datamatrix-svg";

interface Props {
  value: string;
  size?: number;
}

export default function DataMatrixComponent({ value, size = 256 }: Props) {
  return <DataMatrixSVG value={value} size={size} />;
}