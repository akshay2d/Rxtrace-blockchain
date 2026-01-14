"use client";

import { useCallback, useEffect, useState } from "react";

type Job = {
  id: string;
  request_id: string | null;
  sku_id: string | null;
  packing_rule_id: string | null;
  total_strips: number | null;
  expected_boxes: number | null;
  expected_cartons: number | null;
  expected_pallets: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export default function JobsPage() {
  const [companyId, setCompanyId] = useState("00000000-0000-0000-0000-000000000001");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/generate/jobs?company_id=${companyId}&limit=100`);
      const body = await res.json();
      if (!res.ok) {
        setError(JSON.stringify(body));
      } else {
        setJobs(body.jobs || []);
        setTotal(body.total ?? null);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function viewJob(jobId: string) {
    setSelectedJob(null);
    setError(null);
    try {
      const res = await fetch(`/api/generate/job/${jobId}`);
      const body = await res.json();
      if (!res.ok) setError(JSON.stringify(body));
      else setSelectedJob(body);
    } catch (e: any) {
      setError(String(e));
    }
  }

  function downloadCSVForJob() {
    if (!selectedJob) return;
    // build CSV rows: pallet list first
    const pallets = selectedJob.pallets || [];
    const header = ["pallet_id", "sscc", "sscc_with_ai", "created_at"];
    const rows = pallets.map((p: any) => [p.id, p.sscc, p.sscc_with_ai, p.created_at]);
    // if there are no pallets, create an empty CSV with job info
    const csv = [header, ...rows].map((r: any[]) => r.map(String).map((v: string) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `generation_job_${selectedJob.job.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Generation Jobs</h2>

      <div style={{ marginBottom: 12 }}>
        <label>Company ID</label>
        <input value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ width: 480, marginLeft: 8 }} />
        <button onClick={fetchJobs} style={{ marginLeft: 8 }}>Refresh</button>
      </div>

      {loading ? <div>Loading…</div> : null}
      {error ? <pre style={{ color: "crimson" }}>{error}</pre> : null}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8 }}>Request ID</th>
            <th style={{ textAlign: "left", padding: 8 }}>SKU</th>
            <th style={{ textAlign: "right", padding: 8 }}>Strips</th>
            <th style={{ textAlign: "right", padding: 8 }}>Boxes</th>
            <th style={{ textAlign: "right", padding: 8 }}>Cartons</th>
            <th style={{ textAlign: "right", padding: 8 }}>Pallets</th>
            <th style={{ textAlign: "left", padding: 8 }}>Status</th>
            <th style={{ textAlign: "left", padding: 8 }}>Created</th>
            <th style={{ textAlign: "left", padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{j.request_id ?? j.id}</td>
              <td style={{ padding: 8 }}>{j.sku_id}</td>
              <td style={{ padding: 8, textAlign: "right" }}>{j.total_strips}</td>
              <td style={{ padding: 8, textAlign: "right" }}>{j.expected_boxes}</td>
              <td style={{ padding: 8, textAlign: "right" }}>{j.expected_cartons}</td>
              <td style={{ padding: 8, textAlign: "right" }}>{j.expected_pallets}</td>
              <td style={{ padding: 8 }}>{j.status}</td>
              <td style={{ padding: 8 }}>{new Date(j.created_at).toLocaleString()}</td>
              <td style={{ padding: 8 }}>
                <button onClick={() => viewJob(j.id)}>View</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {total !== null && <div style={{ marginTop: 8 }}>Total jobs: {total}</div>}

      {selectedJob && (
        <div style={{ marginTop: 20, background: "#fafafa", padding: 12 }}>
          <h3>Job Details</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(selectedJob, null, 2)}</pre>
          <div style={{ marginTop: 8 }}>
            <button onClick={downloadCSVForJob}>Download Pallets CSV</button>
          </div>
        </div>
      )}
    </div>
  );
}
