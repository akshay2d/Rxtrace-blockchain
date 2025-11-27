// components/custom/QRCodeComponent.tsx
import { QRCodeSVG } from "qrcode.react";

interface Props {
  value: string;
  size?: number;
}

export default function QRCodeComponent({ value, size = 256 }: Props) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="H"
      includeMargin={false}
      fgColor="#000000"
      bgColor="#ffffff"
    />
  );
}