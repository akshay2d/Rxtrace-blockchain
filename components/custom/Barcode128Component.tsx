// components/custom/Barcode128Component.tsx
import Barcode from "react-barcode";

interface Props {
  value: string;
  width?: number;
  height?: number;
}

export default function Barcode128Component({ value, width = 2, height = 80 }: Props) {
  return (
    <Barcode
      value={value}
      format="CODE128"
      width={width}
      height={height}
      displayValue={false}
      margin={0}
      background="#ffffff"
      lineColor="#000000"
    />
  );
}