"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Billing Reports</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">Billing module under refactor.</CardContent>
      </Card>
    </div>
  );
}
