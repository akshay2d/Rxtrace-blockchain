type SplunkEvent = {
  event: Record<string, any>;
  source?: string;
  sourcetype?: string;
  index?: string;
};

export async function sendToSplunk(event: SplunkEvent) {
  if (!process.env.SPLUNK_HEC_URL || !process.env.SPLUNK_HEC_TOKEN) {
    return; // SIEM optional, never block app
  }

  try {
    await fetch(process.env.SPLUNK_HEC_URL, {
      method: "POST",
      headers: {
        "Authorization": `Splunk ${process.env.SPLUNK_HEC_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        host: "rxtrace",
        source: event.source || "rxtrace",
        sourcetype: event.sourcetype || "_json",
        event: event.event,
      }),
    });
  } catch (err) {
    // ❌ Never throw
    // ❌ Never log secrets
    console.error("Splunk HEC failed");
  }
}
