'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import GenerateLabel from '@/lib/generateLabel';
import { Package, Box, Layers } from 'lucide-react';

type ContainerType = 'BOX' | 'CARTON' | 'PALLET';

export default function ContainerLabelSection() {
  const [containerType, setContainerType] = useState<ContainerType>('BOX');
  const [quantity, setQuantity] = useState<number>(1);
  const [ssccPrefix, setSsccPrefix] = useState<string>('890');
  const [generatedSSCCs, setGeneratedSSCCs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function generateSSCCLabels() {
    setLoading(true);
    try {
      // Generate SSCC codes
      const ssccs: string[] = [];
      for (let i = 0; i < quantity; i++) {
        // Format: Extension(1) + CompanyPrefix(7-12) + SerialRef(5-11) + CheckDigit(1) = 18 digits
        const ext = Math.floor(Math.random() * 10);
        const timestamp = Date.now().toString().slice(-11);
        const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
        const number17 = `${ext}${ssccPrefix.padEnd(7, '0').slice(0, 7)}${timestamp}${random}`.slice(0, 17);
        
        // Calculate GS1 check digit
        const checkDigit = calculateGS1CheckDigit(number17);
        const sscc = number17 + checkDigit;
        ssccs.push(sscc);
      }

      setGeneratedSSCCs(ssccs);
    } catch (error: any) {
      alert('Error generating SSCC labels: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  function calculateGS1CheckDigit(number17: string): string {
    const digits = number17.split('').map(d => parseInt(d, 10));
    let sum = 0;
    for (let i = digits.length - 1, pos = 0; i >= 0; i--, pos++) {
      const weight = pos % 2 === 0 ? 3 : 1;
      sum += digits[i] * weight;
    }
    const mod = sum % 10;
    return String(mod === 0 ? 0 : 10 - mod);
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="w-6 h-6 text-orange-500" />
          Container Labels (SSCC - AI 00)
        </CardTitle>
        <p className="text-sm text-gray-500">
          Generate labels for shipping containers (Box/Carton/Pallet) with Serial Shipping Container Codes
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <Label>Container Type</Label>
            <Select value={containerType} onValueChange={(v) => setContainerType(v as ContainerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOX">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Box
                  </div>
                </SelectItem>
                <SelectItem value="CARTON">
                  <div className="flex items-center gap-2">
                    <Box className="w-4 h-4" />
                    Carton
                  </div>
                </SelectItem>
                <SelectItem value="PALLET">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Pallet
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>SSCC Company Prefix</Label>
            <Input
              value={ssccPrefix}
              onChange={(e) => setSsccPrefix(e.target.value)}
              placeholder="890"
              maxLength={12}
            />
          </div>

          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              min={1}
              max={1000}
            />
          </div>
        </div>

        <Button 
          onClick={generateSSCCLabels} 
          disabled={loading || !ssccPrefix}
          className="bg-orange-500 hover:bg-orange-600"
        >
          {loading ? 'Generating...' : `Generate ${quantity} ${containerType} Label${quantity > 1 ? 's' : ''}`}
        </Button>

        {generatedSSCCs.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold mb-4 text-[#0052CC]">
              Generated {containerType} Labels ({generatedSSCCs.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {generatedSSCCs.map((sscc, index) => (
                <Card key={index} className="p-4">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-2">
                      {containerType} #{index + 1}
                    </div>
                    <GenerateLabel 
                      sscc={sscc}
                      codeType="DATAMATRIX"
                      size={150}
                      showText={true}
                      filename={`${containerType}_${sscc}.png`}
                    />
                    <div className="text-xs font-mono mt-2 break-all">
                      {sscc}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      AI(00): {sscc}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
