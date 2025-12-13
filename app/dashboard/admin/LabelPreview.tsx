"use client";
import React, { useState } from "react";

export default function LabelPreview({ companyId }: { companyId?: string }) {
  const [ai, setAi] = useState('{"01":"01234567890128","10":"BATCH01","17":"250101"}');
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function preview() {
    setLoading(true);
    setImgUrl(null);
    try {
      const aiValues = JSON.parse(ai);
      const res = await fetch("/api/labels/png", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aiValues, companyName: "RxTrace", title: "Label", level: "box", format: "qrcode" }),
      });
      const blob = await res.blob();
      setImgUrl(URL.createObjectURL(blob));
    } catch (e) {
      alert(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h3 className="text-lg mb-3">Label Preview</h3>
      <textarea className="w-full p-2 border mb-3" rows={4} value={ai} onChange={(e)=>setAi(e.target.value)} />
      <div className="flex gap-2 mb-3">
        <button className="px-3 py-2 border" onClick={preview} disabled={loading}>Preview PNG</button>
        <a className="px-3 py-2 border" href="#" onClick={(e)=>{ e.preventDefault(); /* implement download by requesting ZPL then saving file */}}>Download ZPL</a>
      </div>
      {imgUrl ? <img src={imgUrl} alt="label" /> : null}
    </div>
  );
}
