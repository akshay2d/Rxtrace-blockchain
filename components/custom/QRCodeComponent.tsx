// components/custom/QRCodeComponent.tsx
import QRCode from "qrcode.react";

interface Props {
  value: string;
  size?: number;
}

export default function QRCodeComponent({ value, size = 256 }: Props) {
  return (
    <QRCode
      value={value}
      size={size}
      level="H"
      includeMargin={false}
      renderAs="svg"
      fgColor="#000000"
      bgColor="#ffffff"
    />
  );
}